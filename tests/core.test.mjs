import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectDiff, getBaseCommit, getWorkingTree } from "../cli/git.mjs";

const cliPath = new URL("../cli/index.mjs", import.meta.url);

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "opendiff-core-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "opendiff-tests@example.com");
  git(root, "config", "user.name", "OpenDiff tests");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "original.ts"), "export const value = 1;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  return root;
}

test("collects the working-tree diff, statistics, and a stable fingerprint", () => {
  const root = createRepository();
  const baseCommit = getBaseCommit(root, "HEAD");
  writeFileSync(join(root, "src", "original.ts"), "export const value = 2;\nexport const ready = true;\n");
  writeFileSync(join(root, "src", "untracked.ts"), "export const untracked = true;\n");

  const result = collectDiff({ root, base: "HEAD", context: 3, includeUntracked: true });
  assert.equal(result.stats.filesChanged, 2);
  assert.equal(result.stats.filesModified, 1);
  assert.equal(result.stats.filesAdded, 1);
  assert.ok(result.files.some((file) => file.path === "src/untracked.ts" && file.status === "added"));
  assert.equal(result.fingerprint.length, 64);

  writeFileSync(join(root, "src", "original.ts"), "export const value = 3;\nexport const ready = true;\n");
  const changed = collectDiff({ root, base: baseCommit, context: 3, includeUntracked: true });
  assert.notEqual(changed.fingerprint, result.fingerprint);
  assert.equal(getWorkingTree(root).clean, false);
});

test("validates and renders a review document against the real diff", () => {
  const root = createRepository();
  writeFileSync(join(root, "src", "original.ts"), "export const value = 2;\n");
  const baseCommit = getBaseCommit(root, "HEAD");
  mkdirSync(join(root, ".agent-diffs"));
  writeFileSync(join(root, ".agent-diffs", "review.json"), JSON.stringify({
    schemaVersion: "1.0",
    project: { name: "fixture", root: "." },
    review: { id: "fixture-review", title: "Update value", summary: "Updates one exported value.", originalTask: "Update the value.", generatedAt: "2026-01-01T00:00:00.000Z" },
    git: { baseRef: "HEAD", baseCommit, targetRef: "WORKTREE", includeStaged: true, includeUnstaged: true, includeUntracked: true, fingerprint: "", initialWorkingTree: { clean: true, preExistingChanges: [] } },
    stats: { filesChanged: 1, filesAdded: 0, filesModified: 1, filesDeleted: 0, additions: 1, deletions: 1, sections: 1, testsChanged: 0 },
    sections: [{ id: "value", order: 1, title: "Update the exported value", shortDescription: "Change the value used by callers.", purpose: "Keep the exported value current.", explanation: ["The implementation changes the exported literal."], impact: ["Callers now receive the new value."], references: [{ id: "value-ref", file: "src/original.ts", symbol: "value", kind: "primary", newLines: { start: 1, end: 1 }, oldLines: { start: 1, end: 1 }, description: "The changed export." }] }],
    tests: { executed: [], notExecuted: [{ name: "Fixture tests", reason: "Not applicable." }] },
    risks: [],
    assumptions: [],
    completion: { status: "complete", summary: "The fixture change is complete.", remainingWork: [] },
  }, null, 2));

  execFileSync(process.execPath, [cliPath.pathname, "validate"], { cwd: root, encoding: "utf8" });
  execFileSync(process.execPath, [cliPath.pathname, "render"], { cwd: root, encoding: "utf8" });
  const renderedReview = JSON.parse(readFileSync(join(root, "public", "data", "review.json"), "utf8"));
  const renderedDiff = JSON.parse(readFileSync(join(root, "public", "data", "diff.json"), "utf8"));
  assert.equal(renderedReview.git.fingerprint.length, 64);
  assert.equal(renderedDiff.files.length, 1);
  assert.equal(renderedDiff.files[0].lines.some((line) => line.referenceIds?.includes("value-ref")), true);
});

test("reports its package version and rejects unknown options", () => {
  const version = execFileSync(process.execPath, [cliPath.pathname, "--version"], { encoding: "utf8" }).trim();
  assert.match(version, /^\d+\.\d+\.\d+/);

  const invalid = spawnSync(process.execPath, [cliPath.pathname, "validate", "--unknown"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown option or argument/);
});
