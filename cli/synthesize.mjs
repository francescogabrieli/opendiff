import { basename } from "node:path";
import { createHash } from "node:crypto";
import { getBaseCommit, getGitBranch, getWorkingTree } from "./git.mjs";

// Level 0: OpenDiff must be useful in any Git repository, with no coding
// agent, no installed skill, and no .opendiff/review.json. This builds the
// same document shape the renderer already consumes, containing only facts
// Git can prove: no narrative, no sections, no claims.
export function synthesizeReview({ root, base, collected, projectName }) {
  const name = projectName || basename(root) || "repository";
  const branch = getGitBranch(root);
  let baseCommit = "";
  try {
    baseCommit = getBaseCommit(root, base);
  } catch {
    baseCommit = "";
  }
  const workingTree = getWorkingTree(root);
  const stats = collected.stats || {};
  const id = createHash("sha256").update(`${root}:${base}:${collected.fingerprint || ""}`).digest("hex").slice(0, 16);

  return {
    schemaVersion: "1.0",
    mode: "diff-only",
    project: { name, root },
    review: {
      id: `diff-${id}`,
      title: describeChange(name, base, stats),
      summary: summarize(stats),
      originalTask: "",
      generatedAt: new Date().toISOString(),
    },
    git: {
      baseRef: base,
      baseCommit,
      targetRef: "WORKTREE",
      branch,
      includeStaged: true,
      includeUnstaged: true,
      includeUntracked: true,
      fingerprint: collected.fingerprint || "",
      initialWorkingTree: { clean: workingTree.clean, preExistingChanges: [] },
    },
    stats: {
      filesChanged: stats.filesChanged ?? 0,
      filesAdded: stats.filesAdded ?? 0,
      filesModified: stats.filesModified ?? 0,
      filesDeleted: stats.filesDeleted ?? 0,
      filesRenamed: stats.filesRenamed ?? 0,
      additions: stats.additions ?? 0,
      deletions: stats.deletions ?? 0,
      sections: 0,
      testsChanged: countTestFiles(collected.files || []),
    },
    sections: [],
    tests: { executed: [], notExecuted: [] },
    risks: [],
    assumptions: [],
    completion: {
      status: "partial",
      summary: "This is a plain diff. No agent recorded a design or evidence for it.",
      remainingWork: [],
    },
  };
}

function describeChange(name, base, stats) {
  const files = stats.filesChanged ?? 0;
  if (!files) return `${name} — no changes against ${base}`;
  return `${name} — ${files} changed file${files === 1 ? "" : "s"} against ${base}`;
}

function summarize(stats) {
  const files = stats.filesChanged ?? 0;
  if (!files) return "The working tree matches the selected base.";
  const parts = [];
  if (stats.filesAdded) parts.push(`${stats.filesAdded} added`);
  if (stats.filesModified) parts.push(`${stats.filesModified} modified`);
  if (stats.filesDeleted) parts.push(`${stats.filesDeleted} deleted`);
  if (stats.filesRenamed) parts.push(`${stats.filesRenamed} renamed`);
  const breakdown = parts.length ? ` (${parts.join(", ")})` : "";
  return `${files} file${files === 1 ? "" : "s"}${breakdown}, +${stats.additions ?? 0} −${stats.deletions ?? 0}.`;
}

function countTestFiles(files) {
  return files.filter((file) => /(^|\/)(tests?|__tests__|spec)\//.test(file.path) || /\.(test|spec)\.[a-z]+$/i.test(file.path)).length;
}

export function isDiffOnly(document) {
  return document?.mode === "diff-only";
}
