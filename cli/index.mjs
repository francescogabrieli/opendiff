#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
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
import { synthesizeReview } from "./synthesize.mjs";
import { buildSharedHtml, DEFAULT_SHARE_FILENAME, gistAvailable, shareTemplatePath, uploadGist } from "./share.mjs";
import { createInterface } from "node:readline/promises";

const root = process.cwd();
const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rendererRoot = join(packageRoot, "dist");
const packageMetadata = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const agentDir = join(root, ".opendiff");
const reviewPath = join(agentDir, "review.json");
const renderDir = join(agentDir, "render");

const defaultConfig = gitDefaultConfig;

function printHelp() {
  console.log(`OpenDiff — review code you did not write

Usage:
  opendiff                    Open the current working-tree change
  opendiff <command> [options]

Commands:
  review                Open the review (guided when an agent recorded one)
  share                 Write a single self-contained HTML file of the review
  init                  Create .opendiff/config.json
  skill install         Install the OpenDiff skill for Codex and Claude Code
  validate              Validate review.json and its diff references
  render                Materialize review and the real Git diff for the web app
  open                  Start the local renderer and print the URL
  export --output PATH  Export a portable review folder

Options:
  --base REF            Diff base (default: HEAD)
  --context N           Context lines (default: 5)
  --port PORT           Server port (default: 4173)
  --output PATH         Destination for share and export
  --gist                Upload the shared HTML as a GitHub Gist (asks first)
  --no-open             Do not open a browser
  --yes                 Skip the confirmation prompt for --gist
  --force               Replace an existing installed skill
  --version             Print the installed OpenDiff version
  --help                Show this help

Running opendiff with no arguments works in any Git repository. Design and
evidence appear once a coding agent records them with the @opendiff skill.
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
  const options = { base: null, context: null, port: 4173, open: true, output: null, force: false, gist: false, yes: false };
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
    else if (arg === "--gist") options.gist = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "install" && index === 0) continue;
    else throw new Error(`Unknown option or argument “${arg}”. Run opendiff --help.`);
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
    // Excluded paths have to be invisible to the collector, not filtered out
    // afterwards, or the statistics and title would still count them.
    ignoredPaths: [...config.ignoredPaths, ...(options.exclude ?? [])],
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

function ensureAgentArtifactsIgnored() {
  const ignorePath = join(agentDir, ".gitignore");
  mkdirSync(agentDir, { recursive: true });
  if (existsSync(ignorePath)) return false;
  writeFileSync(ignorePath, "*\n");
  return true;
}

// Level 0: without a recorded review OpenDiff still has everything it needs
// to show the real change, so it reports the diff instead of refusing.
function diffOnlyReview(options = {}) {
  const config = loadConfig();
  const base = options.base || config.baseRef || "HEAD";
  const context = Number.isFinite(options.context) && options.context > 0 ? options.context : Number(config.defaultContextLines) || 5;
  let collected;
  try {
    getBaseCommit(root, base);
    collected = collectDiff({ base, context, exclude: options.exclude });
  } catch {
    return fail(`The Git base “${base}” is unavailable in this repository.`);
  }
  const document = synthesizeReview({ root, base, collected });
  const warnings = [];
  if (!collected.files.length) warnings.push("No code changes were found between the selected base and the working tree.");
  console.log(`OpenDiff diff-only review: ${document.review.title}`);
  console.log(`  ${collected.files.length} diff files · no recorded design or evidence`);
  warnings.forEach((warning) => console.log(`  Warning: ${warning}`));
  return { document, collected, errors: [], warnings, unresolvedReferenceIds: [], base, context, diffOnly: true };
}

function validateReview({ reportOnly = false, options = {}, allowDiffOnly = false } = {}) {
  if (!getGitRoot()) return fail("OpenDiff could not find a Git repository from the current directory. Run the command inside a repository.");
  if (!existsSync(reviewPath)) {
    if (allowDiffOnly) return diffOnlyReview(options);
    return fail("No OpenDiff review was found. Ask the coding agent to generate .opendiff/review.json.");
  }
  ensureAgentArtifactsIgnored();

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
      exclude: options.exclude,
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
  const ignoredArtifacts = ensureAgentArtifactsIgnored();
  const configPath = join(agentDir, "config.json");
  const createdConfig = !existsSync(configPath);
  if (createdConfig) writeFileSync(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`);
  console.log(`${createdConfig ? "Created" : "Using existing"} ${relative(root, configPath)}`);
  if (ignoredArtifacts) console.log("Configured .opendiff/ artifacts to remain local and untracked");
  console.log("Install the agent instruction with: opendiff skill install");
  console.log("Generate .opendiff/review.json with the OpenDiff skill, then run npx --yes @opendiff/cli@latest review.");
}

function render(options) {
  const result = validateReview({ reportOnly: true, options });
  if (!result || result.errors.length) return fail("The review cannot be rendered until the blocking validation errors are fixed.");
  mkdirSync(renderDir, { recursive: true });
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
  console.log(`Rendered ${result.collected.files.length} files to ${relative(root, renderDir)}`);
}

function installSkill(options) {
  const source = join(packageRoot, "skills", "opendiff", "SKILL.md");
  if (!existsSync(source)) return fail("The bundled OpenDiff skill could not be found in this checkout.");
  const candidates = [
    join(homedir(), ".codex", "skills"),
    join(homedir(), ".claude", "skills"),
  ];
  const existing = candidates.filter((directory) => existsSync(directory));
  const targets = existing.length ? existing : [candidates[0]];
  for (const skillsDirectory of targets) {
    const destinationDirectory = join(skillsDirectory, "opendiff");
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

async function openServer(options) {
  if (!existsSync(join(rendererRoot, "index.html"))) {
    return fail("The bundled renderer is missing. Run `npm run build` in the OpenDiff checkout and try again.");
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
  console.log(`OpenDiff review starting at ${url}`);
  if (options.open && loadConfig().openBrowser !== false) setTimeout(() => openBrowser(url), 850);
}

function exportReview(options) {
  const result = validateReview({ reportOnly: true, options, allowDiffOnly: true });
  if (!result || result.errors.length) return fail("The review cannot be exported until the blocking validation errors are fixed.");
  const output = resolve(root, options.output || "opendiff-export");
  if (!existsSync(join(rendererRoot, "index.html"))) return fail("The bundled renderer is missing. Run `npm run build` in the OpenDiff checkout and try again.");
  cpSync(rendererRoot, output, { recursive: true, force: true });
  mkdirSync(join(output, "data"), { recursive: true });
  const reviewDocument = { ...result.document, stats: { ...result.document.stats, ...result.collected.stats, sections: result.document.sections.length }, git: { ...result.document.git, fingerprint: result.collected.fingerprint } };
  const files = attachReviewReferences(reviewDocument, result.collected.files);
  writeFileSync(join(output, "data", "review.json"), `${JSON.stringify(reviewDocument, null, 2)}\n`);
  writeFileSync(join(output, "data", "diff.json"), `${JSON.stringify({ files, fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base), renderedAt: new Date().toISOString() }, null, 2)}\n`);
  writeFileSync(join(output, "data", "status.json"), `${JSON.stringify({ fingerprint: result.collected.fingerprint, baseRef: result.base, baseCommit: getBaseCommit(root, result.base) }, null, 2)}\n`);
  writeFileSync(join(output, "README.txt"), "This folder contains a portable OpenDiff review. Serve this directory with any local static file server.\n");
  console.log(`Exported review data to ${relative(root, output)}`);
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function shareReview(options) {
  // The shared file is usually written inside the repository, where it would
  // show up as an untracked change and be embedded into the next share. It has
  // to be excluded before the diff is collected, so it never reaches the
  // statistics, the title, or the fingerprint.
  const output = resolve(root, options.output || DEFAULT_SHARE_FILENAME);
  const excluded = relative(root, output).split(sep).join("/");
  const collectOptions = { ...options, exclude: excluded.startsWith("..") ? [] : [excluded] };

  const result = validateReview({ reportOnly: true, options: collectOptions, allowDiffOnly: true });
  if (!result || result.errors.length) return fail("The review cannot be shared until the blocking validation errors are fixed.");

  const stats = result.collected.stats;
  const reviewDocument = {
    ...result.document,
    stats: { ...result.document.stats, ...stats, sections: result.document.sections.length },
    git: { ...result.document.git, baseRef: result.base, fingerprint: result.collected.fingerprint },
  };
  const files = attachReviewReferences(reviewDocument, result.collected.files);
  const html = buildSharedHtml({
    templatePath: shareTemplatePath(packageRoot),
    review: reviewDocument,
    diff: {
      files,
      stats,
      fingerprint: result.collected.fingerprint,
      baseRef: result.base,
      baseCommit: getBaseCommit(root, result.base),
      renderedAt: new Date().toISOString(),
    },
    mode: result.diffOnly ? "diff-only" : "guided",
  });

  writeFileSync(output, html);
  const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
  console.log(`Wrote ${relative(root, output)} (${sizeMb} MB, self-contained)`);
  console.log("Open it in any browser, attach it to a pull request, or send it as a file.");

  if (!options.gist) return;

  if (!gistAvailable()) {
    return fail("--gist needs the GitHub CLI, authenticated. Install gh and run `gh auth login`, or share the file directly.");
  }
  // Creating a Gist uploads the diff — including source code — to GitHub, so it
  // never happens without the user saying so in this run.
  console.log("");
  console.log("Creating a Gist uploads this review, including the source code in the diff, to GitHub.");
  const approved = options.yes || await confirm("Upload it now?");
  if (!approved) {
    console.log("Skipped the Gist upload. The local file is unchanged.");
    return;
  }
  const url = uploadGist(output, reviewDocument.review.title);
  console.log(`Uploaded to ${url}`);
}

const KNOWN_COMMANDS = new Set(["help", "--help", "-h", "--version", "-v", "version", "init", "skill", "validate", "render", "open", "review", "export", "share"]);

// `opendiff` with no command, or with only options, opens the current change.
const rawArgs = process.argv.slice(2);
const command = rawArgs.length && KNOWN_COMMANDS.has(rawArgs[0]) ? rawArgs[0] : "review";
const argv = command === rawArgs[0] ? rawArgs.slice(1) : rawArgs;

try {
  const options = getOptions(argv);
  if (command === "help" || command === "--help" || command === "-h") printHelp();
  else if (command === "--version" || command === "-v" || command === "version") console.log(packageMetadata.version);
  else if (command === "init") init();
  else if (command === "skill" && argv[0] === "install") installSkill(options);
  else if (command === "validate") validateReview({ options });
  else if (command === "render") render(options);
  else if (command === "open") {
    const result = validateReview({ options, allowDiffOnly: true });
    if (result && !result.errors.length) await openServer(options);
  }
  else if (command === "review") {
    const result = validateReview({ options, allowDiffOnly: true });
    if (result && !result.errors.length) {
      // A diff-only review is computed live by the server, so there is no
      // recorded narrative to materialize under .opendiff/render.
      if (!result.diffOnly) render(options);
      await openServer(options);
    }
  } else if (command === "export") exportReview(options);
  else if (command === "share") await shareReview(options);
  else fail(`Unknown command “${command}”. Run opendiff --help.`);
} catch (error) {
  fail(error.message || String(error));
}
