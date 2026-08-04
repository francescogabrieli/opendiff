#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createRequestHandler } from "./server.mjs";
import {
  collectDiff as collectGitDiff,
  defaultConfig as gitDefaultConfig,
  getBaseCommit,
  loadConfig as loadGitConfig,
} from "./git.mjs";
import { formatZodIssues, reviewDocumentSchema } from "./schema.mjs";

const root = process.cwd();
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rendererRoot = join(packageRoot, "dist");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const agentDir = join(root, ".opendiffs");
const reviewPath = join(agentDir, "review.json");
const renderDir = join(agentDir, "render");
const publicDataDir = join(root, "public", "data");

const defaultConfig = gitDefaultConfig;

function printHelp() {
  console.log(`OpenDiffs — local guided reviews

Usage:
  opendiffs <command> [options]

Commands:
  init                  Create .opendiffs/config.json
  skill install         Install the OpenDiffs skill for Codex
  validate              Validate review.json and its diff references
  render                Materialize review and the real Git diff for the web app
  open                  Start the local renderer and print the URL
  review                Validate, render, and open the review
  export --output PATH  Export a portable review folder

Options:
  --base REF            Diff base (default: HEAD)
  --context N           Context lines (default: 5)
  --port PORT           Server port (default: 4173)
  --no-open             Do not open a browser
  --force               Replace an existing installed skill
  --version             Print the installed OpenDiffs version
  --help                Show this help
`);
}

function fail(message, code = 1) {
  console.error(`\nOpenDiffs: ${message}`);
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
  const options = { base: null, context: null, port: 4173, open: true, output: null, force: false };
  const valueAfter = (option, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value.`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") options.base = valueAfter(arg, index++);
    else if (arg === "--context") options.context = Number(valueAfter(arg, index++));
    else if (arg === "--port") options.port = Number(valueAfter(arg, index++));
    else if (arg === "--output") options.output = valueAfter(arg, index++);
    else if (arg === "--no-open") options.open = false;
    else if (arg === "--force") options.force = true;
    else if (arg === "install" && index === 0) continue;
    else throw new Error(`Unknown option or argument “${arg}”. Run opendiffs --help.`);
  }
  if (options.context !== null && (!Number.isInteger(options.context) || options.context < 1)) throw new Error("--context must be a positive integer.");
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error("--port must be an integer between 1 and 65535.");
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
  if (current.split(/\r?\n/).some((line) => line.trim() === ".opendiffs/")) return false;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignorePath, `${prefix}# OpenDiffs generated review artifacts\n.opendiffs/\n`);
  return true;
}

function validateReview({ reportOnly = false, options = {} } = {}) {
  if (!getGitRoot()) return fail("OpenDiffs could not find a Git repository from the current directory. Run the command inside a repository.");
  if (!existsSync(reviewPath)) return fail("No OpenDiffs review was found. Ask the coding agent to generate .opendiffs/review.json.");

  let rawDocument;
  try {
    rawDocument = readJson(reviewPath);
  } catch (error) {
    return fail(error.message);
  }

  const parsed = reviewDocumentSchema.safeParse(rawDocument);
  if (!parsed.success) {
    const errors = formatZodIssues(parsed.error.issues);
    console.error("OpenDiffs review invalid: review.json does not match schema 1.0.");
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
  console.log(`OpenDiffs review ${label}: ${document.review.title}`);
  console.log(`  ${collected.files.length} diff files · ${document.sections.length} logical sections`);
  [...new Set(warnings)].forEach((warning) => console.log(`  Warning: ${warning}`));
  errors.forEach((error) => console.error(`  Error: ${error}`));
  if (errors.length && !reportOnly) process.exitCode = 1;
  return { document, collected, errors, warnings: [...new Set(warnings)], unresolvedReferenceIds: [...new Set(unresolvedReferenceIds)], base, context };
}

function init() {
  if (!getGitRoot()) return fail("OpenDiffs could not find a Git repository from the current directory. Run the command inside a repository.");
  mkdirSync(agentDir, { recursive: true });
  const configPath = join(agentDir, "config.json");
  const createdConfig = !existsSync(configPath);
  if (createdConfig) writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
  const addedGitignore = ensureGitignoreEntry();
  console.log(`${createdConfig ? "Created" : "Using existing"} ${relative(root, configPath)}`);
  if (addedGitignore) console.log("Added .opendiffs/ to .gitignore");
  console.log("Install the agent instruction with: opendiffs skill install");
  console.log("Generate .opendiffs/review.json with the OpenDiffs skill, then run opendiffs review.");
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
  const source = join(packageRoot, "skills", "opendiffs", "SKILL.md");
  if (!existsSync(source)) return fail("The bundled OpenDiffs skill could not be found in this checkout.");
  const candidates = [
    join(homedir(), ".codex", "skills"),
    join(homedir(), ".claude", "skills"),
  ];
  const existing = candidates.filter((directory) => existsSync(directory));
  const targets = existing.length ? existing : [candidates[0]];
  for (const skillsDirectory of targets) {
    const destinationDirectory = join(skillsDirectory, "opendiffs");
    const destination = join(destinationDirectory, "SKILL.md");
    if (existsSync(destination) && !options.force) {
      console.log(`Skill already installed at ${destination} (use --force to replace it)`);
      continue;
    }
    mkdirSync(destinationDirectory, { recursive: true });
    copyFileSync(source, destination);
    console.log(`Installed OpenDiffs skill at ${destination}`);
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(command, args, { detached: true, stdio: "ignore" }).unref(); } catch { /* The URL is still printed. */ }
}

async function openServer(options) {
  if (!existsSync(join(rendererRoot, "index.html"))) {
    return fail("The bundled renderer is missing. Run `npm run build` in the OpenDiffs checkout and try again.");
  }
  const preferredPort = Number(options.port) || 4173;
  const server = createHttpServer(createRequestHandler(root, rendererRoot));
  const listen = (port) => new Promise((resolveListen, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") resolveListen(listen(port + 1));
      else reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
  await listen(preferredPort);
  server.on("error", (error) => fail(`Local renderer error: ${error.message}`));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : preferredPort;
  const url = `http://localhost:${port}`;
  console.log(`OpenDiffs review starting at ${url}`);
  if (options.open && loadConfig().openBrowser !== false) setTimeout(() => openBrowser(url), 850);
}

function exportReview(options) {
  const result = validateReview({ reportOnly: true, options });
  if (!result || result.errors.length) return fail("The review cannot be exported until the blocking validation errors are fixed.");
  const output = resolve(root, options.output || "opendiffs-export");
  if (!existsSync(join(rendererRoot, "index.html"))) return fail("The bundled renderer is missing. Run `npm run build` in the OpenDiffs checkout and try again.");
  cpSync(rendererRoot, output, { recursive: true, force: true });
  mkdirSync(join(output, "data"), { recursive: true });
  const reviewDocument = { ...result.document, stats: { ...result.document.stats, ...result.collected.stats, sections: result.document.sections.length }, git: { ...result.document.git, fingerprint: result.collected.fingerprint } };
  const files = attachReviewReferences(reviewDocument, result.collected.files);
  writeFileSync(join(output, "data", "review.json"), `${JSON.stringify(reviewDocument, null, 2)}\n`);
  writeFileSync(join(output, "data", "diff.json"), `${JSON.stringify({ files, fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base), renderedAt: new Date().toISOString() }, null, 2)}\n`);
  writeFileSync(join(output, "data", "status.json"), `${JSON.stringify({ fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base) }, null, 2)}\n`);
  writeFileSync(join(output, "README.txt"), "This folder contains a portable OpenDiffs review. Serve this directory with any local static file server.\n");
  console.log(`Exported review data to ${relative(root, output)}`);
}

const [command = "help", ...argv] = process.argv.slice(2);

try {
  const options = getOptions(argv);
  if (command === "help" || command === "--help" || command === "-h") printHelp();
  else if (command === "--version" || command === "-v" || command === "version") console.log(packageMetadata.version);
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
  else fail(`Unknown command “${command}”. Run opendiffs --help.`);
} catch (error) {
  fail(error.message || String(error));
}
