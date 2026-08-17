export type DiffLineType = "context" | "addition" | "deletion" | "hunk" | "binary";

export type ReviewStatus = "complete" | "partial" | "blocked";

export type DiffLine = {
  id: string;
  type: DiffLineType;
  oldLine?: number;
  newLine?: number;
  content: string;
  sectionIds?: string[];
  referenceIds?: string[];
};

export type DiffFile = {
  id: string;
  path: string;
  language: string;
  status: "added" | "modified" | "deleted" | "renamed" | "binary";
  additions: number;
  deletions: number;
  sections: string[];
  lines: DiffLine[];
  previousPath?: string;
  generated?: boolean;
  lockfile?: boolean;
  binary?: boolean;
  oldSize?: number;
  newSize?: number;
};

export type ReviewReference = {
  id: string;
  file: string;
  symbol?: string;
  kind: "primary" | "secondary" | "test";
  newLines: { start: number; end: number };
  oldLines: { start: number; end: number } | null;
  description: string;
  resolved?: boolean;
  resolutionError?: string;
};

export type ReviewSection = {
  id: string;
  order: number;
  title: string;
  shortDescription: string;
  purpose: string;
  explanation: string[];
  impact: string[];
  references: ReviewReference[];
  relatedTests?: string[];
  risks?: ReviewRisk[];
  notes?: string[];
};

export type ReviewRisk = {
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  relatedReferences?: string[];
};

export type ReviewTest = {
  command: string;
  status: "passed" | "failed" | "skipped";
  summary: string;
  durationMs?: number;
  supports?: string[];
};

export type ReviewDecision = {
  id: string;
  title: string;
  rationale: string;
  alternatives: string[];
  status: "accepted" | "revised";
};

export type ReviewInvariant = {
  id: string;
  statement: string;
  importance: "must" | "should";
};

export type ReviewEvidence = {
  type: "code" | "test" | "benchmark" | "manual" | "design";
  description: string;
  referenceId?: string;
  command?: string;
};

export type ReviewCriterion = {
  id: string;
  statement: string;
  status: "verified" | "unverified";
  evidence: ReviewEvidence[];
};

export type ReviewDesign = {
  problem: string;
  desiredOutcome: string;
  nonGoals: string[];
  decisions: ReviewDecision[];
  invariants: ReviewInvariant[];
  acceptanceCriteria: ReviewCriterion[];
  deviations: string[];
};

type ReviewDataBase = {
  project: { name: string; root: string };
  review: {
    id: string;
    title: string;
    summary: string;
    originalTask: string;
    generatedAt: string;
  };
  git: {
    baseRef: string;
    baseCommit: string;
    targetRef: string;
    branch: string;
    includeStaged: boolean;
    includeUnstaged: boolean;
    includeUntracked: boolean;
    fingerprint: string;
    initialWorkingTree: { clean: boolean; preExistingChanges: string[] };
  };
  stats: {
    filesChanged: number;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed?: number;
    additions: number;
    deletions: number;
    sections: number;
    testsChanged: number;
  };
  sections: ReviewSection[];
  tests: { executed: ReviewTest[]; notExecuted: { name: string; reason: string }[] };
  risks: ReviewRisk[];
  assumptions: string[];
  completion: { status: ReviewStatus; summary: string; remainingWork: string[] };
};

export type ReviewData = ReviewDataBase & (
  | { schemaVersion: "1.0"; design?: never }
  | { schemaVersion: "2.0"; design: ReviewDesign }
);

export type DiffDocument = {
  files: Partial<DiffFile>[];
  stats?: ReviewData["stats"] | {
    filesChanged: number;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    filesRenamed?: number;
    additions: number;
    deletions: number;
  };
  fingerprint?: string;
  recordedFingerprint?: string | null;
  stale?: boolean;
  renderedAt?: string;
  baseRef?: string;
  baseCommit?: string;
};
