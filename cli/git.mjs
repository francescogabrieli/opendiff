import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { parseDiff } from "./diff.mjs";

export const defaultConfig = {
  version: 1,
  baseRef: "HEAD",
  includeUntracked: true,
  includeStaged: true,
  includeUnstaged: true,
  defaultContextLines: 5,
  openBrowser: true,
  collapseGeneratedFiles: true,
  collapseLockfiles: true,
  ignoredPaths: ["dist/**", "coverage/**", ".next/**"],
  generatedPaths: ["**/*.generated.ts", "**/generated/**"],
};

export function runGit(root, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", options.silent ? "ignore" : "pipe"],
    });
  } catch (error) {
    if (options.allowFailure) return "";
    const detail = error?.stderr?.toString?.().trim() || error?.message || "unknown Git error";
    throw new Error(detail);
  }
}

export function getGitRoot(root) {
  try {
    return runGit(root, ["rev-parse", "--show-toplevel"], { silent: true }).trim();
  } catch {
    return null;
  }
}

export function getGitBranch(root) {
  return runGit(root, ["branch", "--show-current"], { allowFailure: true, silent: true }).trim() || "detached HEAD";
}

export function getBaseCommit(root, base = "HEAD") {
  return runGit(root, ["rev-parse", base], { silent: true }).trim();
}

export function getWorkingTree(root) {
  const porcelain = runGit(root, ["status", "--porcelain=v1", "-z"], { allowFailure: true, silent: true });
  const entries = porcelain.split("\0").filter(Boolean).map((entry) => entry.slice(3));
  return { clean: entries.length === 0, files: entries };
}

export function loadConfig(root) {
  const configPath = join(root, ".agent-diffs", "config.json");
  if (!existsSync(configPath)) return { ...defaultConfig };
  try {
    return { ...defaultConfig, ...JSON.parse(readFileSync(configPath, "utf8")) };
  } catch {
    return { ...defaultConfig };
  }
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§§").replace(/\*/g, "[^/]*").replace(/§§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

export function matchesAnyPath(path, patterns = []) {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function fileLanguage(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages = {
    ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", mjs: "JavaScript", cjs: "JavaScript",
    json: "JSON", yaml: "YAML", yml: "YAML", css: "CSS", scss: "SCSS", md: "Markdown", mdx: "MDX",
    html: "HTML", vue: "Vue", svelte: "Svelte", py: "Python", go: "Go", rs: "Rust", java: "Java",
    kt: "Kotlin", swift: "Swift", sh: "Shell", bash: "Shell", sql: "SQL", xml: "XML",
  };
  return languages[extension] || (path.endsWith("Dockerfile") ? "Dockerfile" : "Text");
}

function isLockfile(path) {
  return /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock)$/.test(path);
}

function isBinaryPath(path) {
  return /\.(png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|zip|tar|gz|pdf|mp4|mov|mp3|sqlite|db)$/i.test(path);
}

function addUntrackedFileDiff(root, path, context) {
  try {
    return execFileSync("git", ["diff", "--no-index", "--no-ext-diff", `--unified=${context}`, "--", "/dev/null", path], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (error) {
    // git diff --no-index returns 1 when it finds a difference.
    return error?.stdout?.toString?.() || "";
  }
}

export function collectDiff({ root, base = "HEAD", context = 5, includeStaged = true, includeUnstaged = true, includeUntracked = true, ignoredPaths = [], generatedPaths = [] }) {
  let tracked = "";
  if (includeStaged && includeUnstaged) tracked = runGit(root, ["diff", "--find-renames=50%", "--no-ext-diff", `--unified=${context}`, "--binary", base, "--"], { allowFailure: true, silent: true });
  else if (includeStaged) tracked = runGit(root, ["diff", "--find-renames=50%", "--cached", "--no-ext-diff", `--unified=${context}`, "--binary", base, "--"], { allowFailure: true, silent: true });
  else if (includeUnstaged) tracked = runGit(root, ["diff", "--find-renames=50%", "--no-ext-diff", `--unified=${context}`, "--binary", "--"], { allowFailure: true, silent: true });

  let diffText = tracked;
  if (includeUntracked) {
    const untracked = runGit(root, ["ls-files", "--others", "--exclude-standard"], { allowFailure: true, silent: true })
      .split("\n").map((path) => path.trim()).filter(Boolean)
      .filter((path) => !path.startsWith(".agent-diffs/") && !path.startsWith("node_modules/") && !matchesAnyPath(path, ignoredPaths));
    for (const path of untracked) diffText += `\n${addUntrackedFileDiff(root, path, context)}`;
  }

  const files = parseDiff(diffText)
    .filter((file) => !matchesAnyPath(file.path, ignoredPaths))
    .map((file) => ({
      ...file,
      language: fileLanguage(file.path),
      lockfile: isLockfile(file.path),
      generated: matchesAnyPath(file.path, generatedPaths),
      binary: file.status === "binary" || isBinaryPath(file.path),
      previousPath: file.previousPath,
      oldSize: file.status === "added" ? undefined : file.previousPath ? gitFileSize(root, base, file.previousPath) : gitFileSize(root, base, file.path),
      newSize: file.status === "deleted" ? undefined : workingFileSize(root, file.path),
    }));
  return {
    text: diffText,
    files,
    stats: calculateDiffStats(files),
    fingerprint: createDiffFingerprint({ base, text: diffText, files }),
  };
}

function workingFileSize(root, path) {
  try { return statSync(join(root, path)).size; } catch { return undefined; }
}

function gitFileSize(root, ref, path) {
  try {
    return Number(runGit(root, ["cat-file", "-s", `${ref}:${path}`], { silent: true }).trim()) || undefined;
  } catch {
    return undefined;
  }
}

export function calculateDiffStats(files) {
  return {
    filesChanged: files.length,
    filesAdded: files.filter((file) => file.status === "added").length,
    filesModified: files.filter((file) => file.status === "modified").length,
    filesDeleted: files.filter((file) => file.status === "deleted").length,
    filesRenamed: files.filter((file) => file.status === "renamed").length,
    additions: files.reduce((total, file) => total + (file.additions || 0), 0),
    deletions: files.reduce((total, file) => total + (file.deletions || 0), 0),
  };
}

export function createDiffFingerprint({ base, text, files }) {
  const canonical = JSON.stringify({ base, files: files.map((file) => ({ path: file.path, previousPath: file.previousPath, status: file.status, additions: file.additions, deletions: file.deletions })), text });
  return createHash("sha256").update(canonical).digest("hex");
}

export function relativePath(root, path) {
  return relative(root, path);
}
