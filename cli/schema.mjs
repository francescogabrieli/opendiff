import { z } from "zod";

const lineRange = z.object({ start: z.number().int().positive(), end: z.number().int().positive() }).refine((range) => range.end >= range.start, "end must be greater than or equal to start");

export const reviewRiskSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().min(1),
  description: z.string().min(1),
  relatedReferences: z.array(z.string().min(1)).optional(),
});

export const executedTestSchema = z.object({
  command: z.string().min(1),
  status: z.enum(["passed", "failed", "skipped"]),
  summary: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  supports: z.array(z.string().min(1)).optional(),
});

const reviewEvidenceSchema = z.object({
  type: z.enum(["code", "test", "benchmark", "manual", "design"]),
  description: z.string().min(1),
  referenceId: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
});

const reviewDesignSchema = z.object({
  problem: z.string().min(1),
  desiredOutcome: z.string().min(1),
  nonGoals: z.array(z.string().min(1)),
  decisions: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    rationale: z.string().min(1),
    alternatives: z.array(z.string().min(1)),
    status: z.enum(["accepted", "revised"]),
  })),
  invariants: z.array(z.object({
    id: z.string().min(1),
    statement: z.string().min(1),
    importance: z.enum(["must", "should"]),
  })).min(1),
  acceptanceCriteria: z.array(z.object({
    id: z.string().min(1),
    statement: z.string().min(1),
    status: z.enum(["verified", "unverified"]),
    evidence: z.array(reviewEvidenceSchema),
  })).min(1),
  deviations: z.array(z.string().min(1)),
});

export const notExecutedTestSchema = z.object({
  name: z.string().min(1),
  reason: z.string().min(1),
});

export const reviewReferenceSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  symbol: z.string().optional(),
  kind: z.enum(["primary", "secondary", "test"]),
  newLines: lineRange,
  oldLines: lineRange.nullable(),
  description: z.string().min(1),
  resolved: z.boolean().optional(),
  resolutionError: z.string().optional(),
});

export const reviewSectionSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  title: z.string().min(1),
  shortDescription: z.string().min(1).max(120),
  purpose: z.string().min(1),
  explanation: z.array(z.string().min(1)).min(1),
  impact: z.array(z.string().min(1)).min(1),
  references: z.array(reviewReferenceSchema).min(1),
  relatedTests: z.array(z.string()).optional(),
  risks: z.array(reviewRiskSchema).optional(),
  notes: z.array(z.string()).optional(),
});

export const reviewDocumentSchema = z.object({
  schemaVersion: z.enum(["1.0", "2.0"]),
  project: z.object({ name: z.string().min(1), root: z.string() }),
  review: z.object({ id: z.string().min(1), title: z.string().min(1), summary: z.string().min(1), originalTask: z.string(), generatedAt: z.iso.datetime({ offset: true }) }),
  git: z.object({
    baseRef: z.string().min(1),
    baseCommit: z.string().min(1),
    targetRef: z.string().min(1),
    branch: z.string().optional().default("detached HEAD"),
    includeStaged: z.boolean(),
    includeUnstaged: z.boolean(),
    includeUntracked: z.boolean(),
    fingerprint: z.string().optional().default(""),
    initialWorkingTree: z.object({ clean: z.boolean(), preExistingChanges: z.array(z.string()) }).optional().default({ clean: true, preExistingChanges: [] }),
  }),
  stats: z.object({
    filesChanged: z.number().int().nonnegative(), filesAdded: z.number().int().nonnegative().optional(), filesModified: z.number().int().nonnegative().optional(), filesDeleted: z.number().int().nonnegative().optional(), filesRenamed: z.number().int().nonnegative().optional(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(), sections: z.number().int().nonnegative().optional(), testsChanged: z.number().int().nonnegative().optional(),
  }),
  sections: z.array(reviewSectionSchema).min(1),
  design: reviewDesignSchema.optional(),
  tests: z.object({ executed: z.array(executedTestSchema), notExecuted: z.array(notExecutedTestSchema) }),
  risks: z.array(reviewRiskSchema),
  assumptions: z.array(z.string()),
  completion: z.object({ status: z.enum(["complete", "partial", "blocked"]), summary: z.string(), remainingWork: z.array(z.string()) }),
}).superRefine((review, context) => {
  if (review.schemaVersion === "2.0" && !review.design) {
    context.addIssue({ code: "custom", path: ["design"], message: "design is required for schema version 2.0" });
  }

  if (!review.design) return;
  const designIds = [
    ...review.design.decisions.map((decision) => decision.id),
    ...review.design.invariants.map((invariant) => invariant.id),
    ...review.design.acceptanceCriteria.map((criterion) => criterion.id),
  ];
  if (new Set(designIds).size !== designIds.length) {
    context.addIssue({ code: "custom", path: ["design"], message: "design IDs must be unique" });
  }
  const invariantIds = new Set(review.design.invariants.map((invariant) => invariant.id));
  const criterionIds = new Set(review.design.acceptanceCriteria.map((criterion) => criterion.id));
  const referenceIds = new Set(review.sections.flatMap((section) => section.references.map((reference) => reference.id)));
  const executedCommands = new Set(review.tests.executed.filter((test) => test.status !== "skipped").map((test) => test.command));
  for (const test of review.tests.executed) {
    for (const id of test.supports ?? []) {
      if (!invariantIds.has(id) && !criterionIds.has(id)) {
        context.addIssue({ code: "custom", path: ["tests", "executed"], message: `unknown supported design claim: ${id}` });
      }
    }
  }
  for (const criterion of review.design.acceptanceCriteria) {
    if (criterion.status === "verified" && criterion.evidence.length === 0) {
      context.addIssue({ code: "custom", path: ["design", "acceptanceCriteria"], message: `verified criterion ${criterion.id} requires evidence` });
    }
    for (const evidence of criterion.evidence) {
      if (evidence.referenceId && !referenceIds.has(evidence.referenceId)) {
        context.addIssue({ code: "custom", path: ["design", "acceptanceCriteria"], message: `unknown evidence reference: ${evidence.referenceId}` });
      }
      if (evidence.command && !executedCommands.has(evidence.command)) {
        context.addIssue({ code: "custom", path: ["design", "acceptanceCriteria"], message: `evidence command was not executed successfully: ${evidence.command}` });
      }
    }
  }
});

export function formatZodIssues(issues) {
  return issues.map((issue) => `${issue.path.join(".") || "review"}: ${issue.message}`);
}
