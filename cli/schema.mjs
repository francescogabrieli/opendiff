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
  schemaVersion: z.literal("1.0"),
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
  tests: z.object({ executed: z.array(executedTestSchema), notExecuted: z.array(notExecutedTestSchema) }),
  risks: z.array(reviewRiskSchema),
  assumptions: z.array(z.string()),
  completion: z.object({ status: z.enum(["complete", "partial", "blocked"]), summary: z.string(), remainingWork: z.array(z.string()) }),
});

export function formatZodIssues(issues) {
  return issues.map((issue) => `${issue.path.join(".") || "review"}: ${issue.message}`);
}
