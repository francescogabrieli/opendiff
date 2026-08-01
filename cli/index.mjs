#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  collectDiff as collectGitDiff,
  defaultConfig as gitDefaultConfig,
  getBaseCommit,
  loadConfig as loadGitConfig,
} from "./git.mjs";
import { formatZodIssues, reviewDocumentSchema } from "./schema.mjs";

const root = process.cwd();
const agentDir = join(root, ".agent-diffs");
const reviewPath = join(agentDir, "review.json");
const renderDir = join(agentDir, "render");
const publicDataDir = join(root, "public", "data");

const defaultConfig = gitDefaultConfig;

function printHelp() {
  console.log(`OpenDiff — local guided reviews

Usage:
  agent-diffs <command> [options]

Commands:
  init                  Create .agent-diffs/config.json
  skill install         Install the OpenDiff skill for Codex
  validate              Validate review.json and its diff references
  render                Materialize review and the real Git diff for the web app
  open                  Start a local Vite server and print the URL
  review                Validate, render, and open the review
  export --output PATH  Export a portable review folder

Options:
  --base REF            Diff base (default: HEAD)
  --context N           Context lines (default: 5)
  --port PORT           Server port (default: 4173)
  --theme dark          Use the focused dark renderer (default)
  --no-open             Do not open a browser
  --force               Replace an existing installed skill
  --help                Show this help
`);
}

function fail(message, code = 1) {
  console.error(`\nOpenDiff: ${message}`);
  process.exitCode = code;
  return null;
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 30 * 1024 * 1024,
      stdio: ["ignore", "pipe", options.silent ? "ignore" : "pipe"],
    });
  } catch (error) {
    if (options.allowFailure) return "";
    const detail = error?.stderr?.toString?.().trim() || error?.message || "unknown Git error";
    throw new Error(detail);
  }
}

function getGitRoot() {
  try {
    return runGit(["rev-parse", "--show-toplevel"], { silent: true }).trim();
  } catch {
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${relative(root, path)} is not valid JSON: ${error.message}`);
  }
}

function getOptions(argv) {
  const options = { base: null, context: null, port: 4173, open: true, output: null, force: false, theme: "dark" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") options.base = argv[++index];
    else if (arg === "--context") options.context = Number(argv[++index]);
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--force") options.force = true;
    else if (arg === "--theme") options.theme = argv[++index] || "dark";
  }
  return options;
}

function collectDiff(options = {}) {
  const config = loadGitConfig(root);
  return collectGitDiff({
    root,
    base: options.base ?? config.baseRef,
    context: options.context ?? config.defaultContextLines,
    includeStaged: options.includeStaged ?? config.includeStaged,
    includeUnstaged: options.includeUnstaged ?? config.includeUnstaged,
    includeUntracked: options.includeUntracked ?? config.includeUntracked,
    ignoredPaths: config.ignoredPaths,
    generatedPaths: config.generatedPaths,
  });
}

function attachReviewReferences(document, files) {
  return files.map((file) => {
    const references = (document.sections || []).flatMap((section) => (section.references || []).filter((reference) => reference.file === file.path || reference.file === file.previousPath));
    const sectionIds = [...new Set((document.sections || []).filter((section) => section.references?.some((reference) => reference.file === file.path || reference.file === file.previousPath)).map((section) => section.id))];
    const lines = (file.lines || []).map((line, index) => {
      const matchingReferences = references.filter((reference) => line.newLine && line.newLine >= reference.newLines.start && line.newLine <= reference.newLines.end);
      return {
        ...line,
        id: line.id || `${file.id}-${index + 1}`,
        sectionIds: [...new Set([...(line.sectionIds || []), ...matchingReferences.map((reference) => document.sections.find((section) => section.references?.some((item) => item.id === reference.id))?.id).filter(Boolean)])],
        referenceIds: [...new Set([...(line.referenceIds || []), ...matchingReferences.map((reference) => reference.id)])],
      };
    });
    return { ...file, sections: sectionIds, lines };
  });
}

function loadConfig() {
  return loadGitConfig(root);
}

function ensureGitignoreEntry() {
  const gitignorePath = join(root, ".gitignore");
  const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === ".agent-diffs/")) return false;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignorePath, `${prefix}# OpenDiff generated review artifacts\n.agent-diffs/\n`);
  return true;
}

function validateReview({ reportOnly = false, options = {} } = {}) {
  if (!getGitRoot()) return fail("OpenDiff could not find a Git repository from the current directory. Run the command inside a repository.");
  if (!existsSync(reviewPath)) return fail("No OpenDiff review was found. Ask the coding agent to generate .agent-diffs/review.json.");

  let rawDocument;
  try {
    rawDocument = readJson(reviewPath);
  } catch (error) {
    return fail(error.message);
  }

  const parsed = reviewDocumentSchema.safeParse(rawDocument);
  if (!parsed.success) {
    const errors = formatZodIssues(parsed.error.issues);
    console.error("OpenDiff review invalid: review.json does not match schema 1.0.");
    errors.forEach((error) => console.error(`  Error: ${error}`));
    if (!reportOnly) process.exitCode = 1;
    return { document: rawDocument, collected: { files: [], stats: {}, fingerprint: "", text: "" }, errors, warnings: [], unresolvedReferenceIds: [] };
  }

  const document = parsed.data;
  const config = loadConfig();
  const base = options.base || document.git.baseRef || config.baseRef || "HEAD";
  const context = Number.isFinite(options.context) && options.context > 0 ? options.context : Number(config.defaultContextLines) || 5;
  const errors = [];
  const warnings = [];
  let collected;

  try {
    getBaseCommit(root, base);
    collected = collectDiff({
      base,
      context,
      includeStaged: document.git.includeStaged,
      includeUnstaged: document.git.includeUnstaged,
      includeUntracked: document.git.includeUntracked,
    });
  } catch (error) {
    errors.push(`The base commit recorded by the review is no longer available: ${document.git.baseCommit || base}.`);
    collected = { files: [], stats: {}, fingerprint: "", text: "" };
  }

  const sectionIds = new Set();
  const referenceIds = new Set();
  const unresolvedReferenceIds = [];
  for (const [index, section] of document.sections.entries()) {
    if (sectionIds.has(section.id)) errors.push(`sections[${index}].id must be unique: ${section.id}.`);
    sectionIds.add(section.id);
    for (const [referenceIndex, reference] of section.references.entries()) {
      if (referenceIds.has(reference.id)) errors.push(`sections[${index}].references[${referenceIndex}].id must be unique: ${reference.id}.`);
      referenceIds.add(reference.id);
      const file = collected.files.find((item) => item.path === reference.file || item.previousPath === reference.file);
      let resolutionError = "";
      if (!file) resolutionError = `The referenced file does not exist in the current diff: ${reference.file}.`;
      else if (file.status !== "binary") {
        const newLines = new Set(file.lines.filter((line) => line.newLine !== undefined).map((line) => line.newLine));
        const range = Array.from({ length: reference.newLines.end - reference.newLines.start + 1 }, (_, offset) => reference.newLines.start + offset);
        if (range.some((line) => !newLines.has(line))) resolutionError = `The referenced lines ${reference.newLines.start}–${reference.newLines.end} could not be resolved in ${reference.file}.`;
      }
      if (resolutionError) {
        unresolvedReferenceIds.push(reference.id);
        warnings.push(`${reference.id}: ${resolutionError}`);
      }
    }
  }

  if (collected.files.length === 0) warnings.push("No code changes were found between the selected base and the working tree.");
  if (document.git.initialWorkingTree?.clean === false) warnings.push("The review was generated from an initially dirty working tree.");
  const label = errors.length ? "invalid" : warnings.length ? "valid with warnings" : "valid";
  console.log(`OpenDiff review ${label}: ${document.review.title}`);
  console.log(`  ${collected.files.length} diff files · ${document.sections.length} logical sections`);
  [...new Set(warnings)].forEach((warning) => console.log(`  Warning: ${warning}`));
  errors.forEach((error) => console.error(`  Error: ${error}`));
  if (errors.length && !reportOnly) process.exitCode = 1;
  return { document, collected, errors, warnings: [...new Set(warnings)], unresolvedReferenceIds: [...new Set(unresolvedReferenceIds)], base, context };
}

function init() {
  if (!getGitRoot()) return fail("OpenDiff could not find a Git repository from the current directory. Run the command inside a repository.");
  mkdirSync(agentDir, { recursive: true });
  if (!existsSync(join(agentDir, "config.json"))) writeFileSync(join(agentDir, "config.json"), `${JSON.stringify(defaultConfig, null, 2)}\n`);
  const addedGitignore = ensureGitignoreEntry();
  console.log(`Created ${relative(root, agentDir)}/config.json`);
  if (addedGitignore) console.log("Added .agent-diffs/ to .gitignore");
  console.log("Install the agent instruction with: agent-diffs skill install");
  console.log("Generate .agent-diffs/review.json with the OpenDiff skill, then run agent-diffs review.");
}

function render(options) {
  const result = validateReview({ reportOnly: true, options });
  if (!result || result.errors.length) return fail("The review cannot be rendered until the blocking validation errors are fixed.");
  mkdirSync(renderDir, { recursive: true });
  mkdirSync(publicDataDir, { recursive: true });
  const reviewDocument = {
    ...result.document,
    stats: { ...result.document.stats, ...result.collected.stats, sections: result.document.sections.length },
    git: { ...result.document.git, baseRef: result.base, baseCommit: getBaseCommit(root, result.base), fingerprint: result.collected.fingerprint },
  };
  const metadata = {
    renderedAt: new Date().toISOString(),
    baseRef: result.base,
    baseCommit: getBaseCommit(root, result.base),
    fingerprint: result.collected.fingerprint,
    filesChanged: result.collected.files.length,
    stats: result.collected.stats,
    validation: { warnings: result.warnings, unresolvedReferenceIds: result.unresolvedReferenceIds },
  };
  writeFileSync(join(renderDir, "review.json"), `${JSON.stringify(reviewDocument, null, 2)}\n`);
  const renderedFiles = attachReviewReferences(reviewDocument, result.collected.files);
  writeFileSync(join(renderDir, "diff.json"), `${JSON.stringify({ ...metadata, files: renderedFiles }, null, 2)}\n`);
  writeFileSync(join(renderDir, "status.json"), `${JSON.stringify({ fingerprint: metadata.fingerprint, renderedAt: metadata.renderedAt, baseRef: metadata.baseRef, baseCommit: metadata.baseCommit }, null, 2)}\n`);
  writeFileSync(join(publicDataDir, "review.json"), `${JSON.stringify(reviewDocument, null, 2)}\n`);
  writeFileSync(join(publicDataDir, "diff.json"), `${JSON.stringify({ ...metadata, files: renderedFiles }, null, 2)}\n`);
  writeFileSync(join(publicDataDir, "status.json"), `${JSON.stringify({ fingerprint: metadata.fingerprint, renderedAt: metadata.renderedAt, baseRef: metadata.baseRef, baseCommit: metadata.baseCommit }, null, 2)}\n`);
  console.log(`Rendered ${result.collected.files.length} files to ${relative(root, renderDir)}`);
}

function installSkill(options) {
  const source = join(root, "skills", "agent-diffs", "SKILL.md");
  if (!existsSync(source)) return fail("The bundled OpenDiff skill could not be found in this checkout.");
  const candidates = [
    join(homedir(), ".codex", "skills"),
    join(homedir(), ".claude", "skills"),
  ];
  const existing = candidates.filter((directory) => existsSync(directory));
  const targets = existing.length ? existing : [candidates[0]];
  for (const skillsDirectory of targets) {
    const destinationDirectory = join(skillsDirectory, "agent-diffs");
    const destination = join(destinationDirectory, "SKILL.md");
    if (existsSync(destination) && !options.force) {
      console.log(`Skill already installed at ${destination} (use --force to replace it)`);
      continue;
    }
    mkdirSync(destinationDirectory, { recursive: true });
    copyFileSync(source, destination);
    console.log(`Installed OpenDiff skill at ${destination}`);
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(command, args, { detached: true, stdio: "ignore" }).unref(); } catch { /* The URL is still printed. */ }
}

function findAvailablePort(start) {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolvePort(findAvailablePort(start + 1));
      } else {
        reject(error);
      }
    });
    probe.listen(start, "127.0.0.1", () => {
      probe.close(() => resolvePort(start));
    });
  });
}

async function openServer(options) {
  const port = await findAvailablePort(Number(options.port) || 4173);
  const url = `http://localhost:${port}`;
  const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    stdio: "inherit",
  });
  console.log(`OpenDiff review starting at ${url}`);
  if (options.open) setTimeout(() => openBrowser(url), 850);
  child.on("error", (error) => fail(`Could not start the local renderer: ${error.message}`));
}

function exportReview(options) {
  const result = validateReview({ reportOnly: true, options });
  if (!result || result.errors.length) return fail("The review cannot be exported until the blocking validation errors are fixed.");
  const output = resolve(root, options.output || "agent-diffs-export");
  if (existsSync(join(root, "dist"))) cpSync(join(root, "dist"), output, { recursive: true, force: true });
  mkdirSync(join(output, "data"), { recursive: true });
  const reviewDocument = { ...result.document, stats: { ...result.document.stats, ...result.collected.stats, sections: result.document.sections.length }, git: { ...result.document.git, fingerprint: result.collected.fingerprint } };
  const files = attachReviewReferences(reviewDocument, result.collected.files);
  writeFileSync(join(output, "data", "review.json"), `${JSON.stringify(reviewDocument, null, 2)}\n`);
  writeFileSync(join(output, "data", "diff.json"), `${JSON.stringify({ files, fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base), renderedAt: new Date().toISOString() }, null, 2)}\n`);
  writeFileSync(join(output, "data", "status.json"), `${JSON.stringify({ fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base) }, null, 2)}\n`);
  writeFileSync(join(output, "README.txt"), "This folder contains the local OpenDiff review data. Serve it beside the built web renderer.\n");
  console.log(`Exported review data to ${relative(root, output)}`);
}

const [command = "help", ...argv] = process.argv.slice(2);
const options = getOptions(argv);

try {
  if (command === "help" || command === "--help" || command === "-h") printHelp();
  else if (command === "init") init();
  else if (command === "skill" && argv[0] === "install") installSkill(options);
  else if (command === "validate") validateReview({ options });
  else if (command === "render") render(options);
  else if (command === "open") {
    const result = validateReview({ options });
    if (result && !result.errors.length) await openServer(options);
  }
  else if (command === "review") {
    const result = validateReview({ options });
    if (result && !result.errors.length) {
      render(options);
      await openServer(options);
    }
  } else if (command === "export") exportReview(options);
  else fail(`Unknown command “${command}”. Run agent-diffs --help.`);
} catch (error) {
  fail(error.message || String(error));
}
