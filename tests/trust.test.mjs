import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getBaseCommit } from "../cli/git.mjs";

const cliFilePath = fileURLToPath(new URL("../cli/index.mjs", import.meta.url));

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "opendiff-trust-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "opendiff-tests@example.com");
  git(root, "config", "user.name", "OpenDiff tests");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "mentioned.ts"), "export const mentioned = 1;\n");
  writeFileSync(join(root, "src", "silent.ts"), "export const silent = 1;\n");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  return root;
}

function baseDesignDocument(baseCommit) {
  return {
    schemaVersion: "2.0",
    project: { name: "fixture", root: "." },
    review: { id: "fixture-review", title: "Update two values", summary: "Updates two exported values.", originalTask: "Update the values.", generatedAt: "2026-01-01T00:00:00.000Z" },
    git: { baseRef: "HEAD", baseCommit, targetRef: "WORKTREE", branch: "main", includeStaged: true, includeUnstaged: true, includeUntracked: true, fingerprint: "", initialWorkingTree: { clean: true, preExistingChanges: [] } },
    stats: { filesChanged: 2, filesAdded: 0, filesModified: 2, filesDeleted: 0, additions: 2, deletions: 2, sections: 1, testsChanged: 0 },
    tests: { executed: [], notExecuted: [{ name: "Fixture tests", reason: "Not applicable." }] },
    risks: [],
    assumptions: [],
    completion: { status: "complete", summary: "The fixture change is complete.", remainingWork: [] },
  };
}

test("flags a changed file that no section mentions", () => {
  const root = createRepository();
  writeFileSync(join(root, "src", "mentioned.ts"), "export const mentioned = 2;\n");
  writeFileSync(join(root, "src", "silent.ts"), "export const silent = 2;\n");
  const baseCommit = getBaseCommit(root, "HEAD");

  const document = {
    ...baseDesignDocument(baseCommit),
    design: {
      problem: "The value was stale.", desiredOutcome: "The value is current.", nonGoals: [],
      decisions: [], invariants: [{ id: "inv-1", statement: "The exported value stays a number.", importance: "must" }],
      acceptanceCriteria: [{ id: "criterion-mentioned", statement: "mentioned.ts is updated.", status: "verified", evidence: [{ type: "code", description: "The literal changed.", referenceId: "ref-mentioned" }] }],
      deviations: [],
    },
    sections: [{
      id: "value", order: 1, title: "Update mentioned.ts", shortDescription: "Change the value.", purpose: "Keep it current.",
      explanation: ["The implementation changes the exported literal."], impact: ["Callers now receive the new value."],
      references: [{ id: "ref-mentioned", file: "src/mentioned.ts", symbol: "mentioned", kind: "primary", newLines: { start: 1, end: 1 }, oldLines: { start: 1, end: 1 }, description: "The changed export." }],
    }],
  };
  mkdirSync(join(root, ".opendiff"));
  writeFileSync(join(root, ".opendiff", "review.json"), JSON.stringify(document, null, 2));

  const output = execFileSync(process.execPath, [cliFilePath, "validate"], { cwd: root, encoding: "utf8" });
  assert.match(output, /1 changed file not mentioned in any section: src\/silent\.ts/);
});

test("flags a verified criterion whose evidence no longer resolves against the diff", () => {
  const root = createRepository();
  // The reference claims lines 1-1 changed, but the working tree now has three lines, so it does not resolve.
  writeFileSync(join(root, "src", "mentioned.ts"), "export const mentioned = 2;\nexport const extra = 1;\nexport const another = 1;\n");
  writeFileSync(join(root, "src", "silent.ts"), "export const silent = 2;\n");
  const baseCommit = getBaseCommit(root, "HEAD");

  const document = {
    ...baseDesignDocument(baseCommit),
    design: {
      problem: "The value was stale.", desiredOutcome: "The value is current.", nonGoals: [],
      decisions: [], invariants: [{ id: "inv-1", statement: "The exported value stays a number.", importance: "must" }],
      acceptanceCriteria: [{ id: "criterion-mentioned", statement: "mentioned.ts is updated.", status: "verified", evidence: [{ type: "code", description: "The literal changed.", referenceId: "ref-mentioned" }] }],
      deviations: [],
    },
    sections: [{
      id: "value", order: 1, title: "Update mentioned.ts", shortDescription: "Change the value.", purpose: "Keep it current.",
      explanation: ["The implementation changes the exported literal."], impact: ["Callers now receive the new value."],
      references: [
        { id: "ref-mentioned", file: "src/mentioned.ts", symbol: "mentioned", kind: "primary", newLines: { start: 90, end: 90 }, oldLines: { start: 1, end: 1 }, description: "The changed export." },
        { id: "ref-silent", file: "src/silent.ts", symbol: "silent", kind: "secondary", newLines: { start: 1, end: 1 }, oldLines: { start: 1, end: 1 }, description: "Also touched." },
      ],
    }],
  };
  mkdirSync(join(root, ".opendiff"));
  writeFileSync(join(root, ".opendiff", "review.json"), JSON.stringify(document, null, 2));

  const output = execFileSync(process.execPath, [cliFilePath, "validate"], { cwd: root, encoding: "utf8" });
  assert.match(output, /criterion-mentioned: marked verified, but none of its evidence resolves against the current diff/);
  // Every file is at least referenced by some section, so this must not also fire.
  assert.doesNotMatch(output, /not mentioned in any section/);
});

test("does not flag a verified criterion backed by a resolving reference", () => {
  const root = createRepository();
  writeFileSync(join(root, "src", "mentioned.ts"), "export const mentioned = 2;\n");
  writeFileSync(join(root, "src", "silent.ts"), "export const silent = 2;\n");
  const baseCommit = getBaseCommit(root, "HEAD");

  const document = {
    ...baseDesignDocument(baseCommit),
    design: {
      problem: "The value was stale.", desiredOutcome: "The value is current.", nonGoals: [],
      decisions: [], invariants: [{ id: "inv-1", statement: "The exported value stays a number.", importance: "must" }],
      acceptanceCriteria: [{ id: "criterion-mentioned", statement: "mentioned.ts is updated.", status: "verified", evidence: [{ type: "code", description: "The literal changed.", referenceId: "ref-mentioned" }] }],
      deviations: [],
    },
    sections: [{
      id: "value", order: 1, title: "Update both files", shortDescription: "Change both values.", purpose: "Keep them current.",
      explanation: ["The implementation changes both exported literals."], impact: ["Callers now receive the new values."],
      references: [
        { id: "ref-mentioned", file: "src/mentioned.ts", symbol: "mentioned", kind: "primary", newLines: { start: 1, end: 1 }, oldLines: { start: 1, end: 1 }, description: "The changed export." },
        { id: "ref-silent", file: "src/silent.ts", symbol: "silent", kind: "secondary", newLines: { start: 1, end: 1 }, oldLines: { start: 1, end: 1 }, description: "Also touched." },
      ],
    }],
  };
  mkdirSync(join(root, ".opendiff"));
  writeFileSync(join(root, ".opendiff", "review.json"), JSON.stringify(document, null, 2));

  const output = execFileSync(process.execPath, [cliFilePath, "validate"], { cwd: root, encoding: "utf8" });
  assert.doesNotMatch(output, /not mentioned in any section/);
  assert.doesNotMatch(output, /marked verified, but none of its evidence resolves/);
  assert.match(output, /OpenDiff review valid:/);
});
