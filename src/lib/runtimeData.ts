import { SAMPLE_DIFF, SAMPLE_REVIEW } from "../data/sampleReview";
import type { DiffDocument, DiffFile, DiffLine, ReviewData, ReviewReference } from "../types";

export type ReviewLoadErrorKind =
  | "missing-review"
  | "invalid-json"
  | "missing-base"
  | "empty-diff"
  | "unavailable";

export class ReviewLoadError extends Error {
  kind: ReviewLoadErrorKind;
  detail?: string;

  constructor(kind: ReviewLoadErrorKind, message: string, detail?: string) {
    super(message);
    this.name = "ReviewLoadError";
    this.kind = kind;
    this.detail = detail;
  }
}

export type ReviewValidation = {
  warnings: string[];
  unresolvedReferenceIds: string[];
};

export type ReviewBundle = {
  review: ReviewData;
  diff: { files: DiffFile[]; fingerprint?: string; stats?: DiffDocument["stats"] };
  source: "demo" | "rendered";
  stale: boolean;
  validation: ReviewValidation;
  metadata?: Pick<DiffDocument, "renderedAt" | "baseRef" | "baseCommit">;
};

type LoadOptions = {
  demo?: boolean;
  fixture?: string | null;
  contextLines?: number;
};

type ReviewStatusDocument = {
  stale?: boolean;
  fingerprint?: string;
  currentFingerprint?: string;
  renderedAt?: string;
  message?: string;
};

function normalizeLine(line: Partial<DiffLine>, index: number): DiffLine {
  const type = line.type === "addition" || line.type === "deletion" || line.type === "hunk" || line.type === "binary"
    ? line.type
    : "context";
  return {
    id: line.id ?? `generated-line-${index}`,
    type,
    oldLine: line.oldLine,
    newLine: line.newLine,
    content: line.content ?? "",
    sectionIds: line.sectionIds ?? [],
    referenceIds: line.referenceIds ?? [],
  };
}

function referenceFileMatches(reference: ReviewReference, file: Partial<DiffFile>): boolean {
  return reference.file === file.path || reference.file === file.previousPath;
}

function resolveReference(reference: ReviewReference, file: Partial<DiffFile> | undefined): ReviewReference {
  if (!file) {
    return {
      ...reference,
      resolved: false,
      resolutionError: `The referenced file is not present in the current diff: ${reference.file}`,
    };
  }
  const matchingLines = (file.lines ?? []).map(normalizeLine).filter((line) => line.newLine !== undefined);
  const hasRange = matchingLines.some((line) => line.newLine !== undefined && line.newLine >= reference.newLines.start && line.newLine <= reference.newLines.end);
  if (!hasRange && file.status !== "binary") {
    return {
      ...reference,
      resolved: false,
      resolutionError: `Lines ${reference.newLines.start}–${reference.newLines.end} could not be resolved in ${reference.file}.`,
    };
  }
  return { ...reference, resolved: true, resolutionError: undefined };
}

function enrichDiff(review: ReviewData, rawFiles: Partial<DiffFile>[]): { files: DiffFile[]; validation: ReviewValidation } {
  const warnings: string[] = [];
  const unresolvedReferenceIds: string[] = [];
  const allReferences = review.sections.flatMap((section) => section.references);
  const resolvedReferences = allReferences.map((reference) => {
    const file = rawFiles.find((candidate) => referenceFileMatches(reference, candidate));
    const resolved = resolveReference(reference, file);
    if (resolved.resolved === false) {
      unresolvedReferenceIds.push(reference.id);
      warnings.push(`${reference.id}: ${resolved.resolutionError}`);
    }
    return resolved;
  });

  const files = rawFiles.map((rawFile, fileIndex) => {
    const fileReferences = resolvedReferences.filter((reference) => referenceFileMatches(reference, rawFile));
    const sections = [...new Set(fileReferences.map((reference) => review.sections.find((section) => section.references.some((item) => item.id === reference.id))?.id).filter(Boolean) as string[])];
    const lines = (rawFile.lines ?? []).map((rawLine, lineIndex) => {
      const line = normalizeLine(rawLine, lineIndex);
      const matchingReferences = fileReferences.filter((reference) => line.newLine !== undefined && line.newLine >= reference.newLines.start && line.newLine <= reference.newLines.end && reference.resolved !== false);
      return {
        ...line,
        sectionIds: [...new Set([
          ...(line.sectionIds ?? []),
          ...matchingReferences.map((reference) => review.sections.find((section) => section.references.some((item) => item.id === reference.id))?.id).filter(Boolean) as string[],
        ])],
        referenceIds: [...new Set([...(line.referenceIds ?? []), ...matchingReferences.map((reference) => reference.id)])],
      };
    });
    return {
      id: rawFile.id ?? `generated-file-${fileIndex}`,
      path: rawFile.path ?? "unknown",
      language: rawFile.language ?? "Text",
      status: rawFile.status ?? "modified",
      additions: rawFile.additions ?? lines.filter((line) => line.type === "addition").length,
      deletions: rawFile.deletions ?? lines.filter((line) => line.type === "deletion").length,
      sections,
      lines,
      previousPath: rawFile.previousPath,
      generated: rawFile.generated,
      lockfile: rawFile.lockfile,
      binary: rawFile.binary ?? rawFile.status === "binary",
      oldSize: rawFile.oldSize,
      newSize: rawFile.newSize,
    };
  });
  return { files, validation: { warnings: [...new Set(warnings)], unresolvedReferenceIds: [...new Set(unresolvedReferenceIds)] } };
}

function annotateReview(review: ReviewData, validation: ReviewValidation): ReviewData {
  const unresolved = new Set(validation.unresolvedReferenceIds);
  return {
    ...review,
    sections: review.sections.map((section) => ({
      ...section,
      references: section.references.map((reference) => {
        if (!unresolved.has(reference.id)) return { ...reference, resolved: true };
        return {
          ...reference,
          resolved: false,
          resolutionError: validation.warnings.find((warning) => warning.startsWith(`${reference.id}:`))?.slice(reference.id.length + 2),
        };
      }),
    })),
  };
}

async function fetchJson<T>(url: string, kind: ReviewLoadErrorKind): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    throw new ReviewLoadError("unavailable", "The local OpenDiff renderer is unavailable.", error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    let message = response.statusText || `HTTP ${response.status}`;
    let responseCode = `http-${response.status}`;
    try {
      const body = await response.json() as { message?: string; code?: string };
      message = body.message ?? message;
      responseCode = body.code ?? responseCode;
    } catch {
      // Keep the HTTP status when the server did not return JSON.
    }
    throw new ReviewLoadError(kind, message, responseCode);
  }
  const body = await response.text();
  if (body.trimStart().startsWith("<")) {
    throw new ReviewLoadError(kind, kind === "missing-review" ? "No OpenDiff review was found." : "The requested OpenDiff data is unavailable.", "spa-fallback");
  }
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new ReviewLoadError("invalid-json", `OpenDiff received invalid JSON from ${url}.`, error instanceof Error ? error.message : String(error));
  }
}

function demoBundle(fixture?: string | null): ReviewBundle {
  const reviewDocument = structuredClone(SAMPLE_REVIEW) as ReviewData;
  const diffDocument = structuredClone(SAMPLE_DIFF);
  if (fixture === "invalid") {
    const reference = reviewDocument.sections[0]?.references[0];
    if (reference) reference.file = "src/missing-file.ts";
  }
  if (fixture === "small") {
    diffDocument.files = diffDocument.files.slice(0, 2);
  }
  if (fixture === "rename") {
    const file = diffDocument.files[0];
    if (file) {
      file.status = "renamed";
      file.previousPath = "src/auth/legacyRefreshCoordinator.ts";
    }
  }
  if (fixture === "deleted") {
    const file = diffDocument.files[2];
    if (file) {
      file.status = "deleted";
      file.lines = file.lines.map((line) => line.type === "addition" ? { ...line, type: "deletion", oldLine: line.newLine, newLine: undefined } : line);
    }
  }
  if (fixture === "large") {
    const file = diffDocument.files[0];
    if (file) {
      file.lines = Array.from({ length: 1200 }, (_, index) => ({
        id: `large-line-${index + 1}`,
        type: index % 7 === 0 ? "addition" : "context",
        oldLine: index % 7 === 0 ? undefined : index + 1,
        newLine: index + 1,
        content: index % 7 === 0 ? `export const generatedLine${index + 1} = ${index + 1};` : `  return value + ${index + 1};`,
        sectionIds: index < 20 ? ["refresh-coordination"] : [],
        referenceIds: index < 20 ? ["ref-refresh-coordinator"] : [],
      }));
      file.additions = 172;
      file.deletions = 0;
    }
  }
  if (fixture === "empty") diffDocument.files = [];
  const enriched = enrichDiff(reviewDocument, diffDocument.files);
  const warnings = [...enriched.validation.warnings];
  if (fixture === "empty") warnings.unshift("No code changes were found between the selected base and the working tree.");
  return {
    review: annotateReview(reviewDocument, { ...enriched.validation, warnings }),
    diff: { files: enriched.files },
    source: "demo",
    stale: fixture === "stale",
    validation: { ...enriched.validation, warnings },
    metadata: { renderedAt: reviewDocument.review.generatedAt, baseRef: reviewDocument.git.baseRef, baseCommit: reviewDocument.git.baseCommit },
  };
}

async function fetchRenderedDocuments(contextLines: number): Promise<{ review: ReviewData; diff: DiffDocument; status: ReviewStatusDocument }> {
  const endpointReview = "/__opendiff/data/review";
  const endpointDiff = `/__opendiff/data/diff?context=${encodeURIComponent(contextLines)}`;
  try {
    const review = await fetchJson<ReviewData>(endpointReview, "missing-review");
    const diff = await fetchJson<DiffDocument>(endpointDiff, "missing-base");
    let status: ReviewStatusDocument = {};
    try { status = await fetchJson<ReviewStatusDocument>("/__opendiff/status", "unavailable"); } catch { /* status is optional */ }
    return { review, diff, status };
  } catch (endpointError) {
    if (endpointError instanceof ReviewLoadError && endpointError.detail === "missing-review") throw endpointError;
    if (endpointError instanceof ReviewLoadError && endpointError.detail === "missing-base") throw endpointError;
    if (endpointError instanceof ReviewLoadError && endpointError.kind === "invalid-json") throw endpointError;
    try {
      const review = await fetchJson<ReviewData>("/data/review.json", "missing-review");
      const diff = await fetchJson<DiffDocument>("/data/diff.json", "missing-base");
      let status: ReviewStatusDocument = {};
      try { status = await fetchJson<ReviewStatusDocument>("/data/status.json", "unavailable"); } catch { /* status is optional */ }
      return { review, diff, status };
    } catch (staticError) {
      if (staticError instanceof ReviewLoadError) throw staticError;
      if (endpointError instanceof ReviewLoadError) throw endpointError;
      throw new ReviewLoadError("missing-review", "No OpenDiff review was found. Ask the coding agent to generate .opendiff/review.json.");
    }
  }
}

export async function loadDiffDocument(contextLines = 5): Promise<DiffDocument> {
  try {
    return await fetchJson<DiffDocument>(`/__opendiff/data/diff?context=${encodeURIComponent(contextLines)}`, "missing-base");
  } catch {
    return fetchJson<DiffDocument>("/data/diff.json", "missing-base");
  }
}

export async function loadReviewStatus(): Promise<ReviewStatusDocument> {
  try {
    return await fetchJson<ReviewStatusDocument>("/__opendiff/status", "unavailable");
  } catch {
    return fetchJson<ReviewStatusDocument>("/data/status.json", "unavailable");
  }
}

export async function loadReviewBundle(options: LoadOptions = {}): Promise<ReviewBundle> {
  const fixture = options.fixture ?? new URLSearchParams(window.location.search).get("fixture");
  if (options.demo || fixture === "demo" || fixture === "small" || fixture === "medium" || fixture === "rename" || fixture === "deleted" || fixture === "lockfile" || fixture === "large" || fixture === "invalid" || fixture === "stale" || fixture === "empty" || fixture === "missing") {
    if (fixture === "missing") throw new ReviewLoadError("missing-review", "No OpenDiff review was found. Ask the coding agent to generate .opendiff/review.json.");
    return demoBundle(fixture);
  }
  const contextLines = options.contextLines ?? 5;
  const { review, diff: diffDocument, status } = await fetchRenderedDocuments(contextLines);
  if (!review?.review?.id || !Array.isArray(diffDocument?.files)) {
    throw new ReviewLoadError("invalid-json", "The rendered OpenDiff data is incomplete.");
  }
  const enriched = enrichDiff(review, diffDocument.files);
  const warnings = [...enriched.validation.warnings];
  if (enriched.files.length === 0) warnings.unshift("No code changes were found between the selected base and the working tree.");
  const stale = status.stale ?? Boolean(status.currentFingerprint && status.fingerprint && status.currentFingerprint !== status.fingerprint);
  return {
    review: annotateReview(review, { ...enriched.validation, warnings: [...new Set(warnings)] }),
    diff: { files: enriched.files, fingerprint: diffDocument.fingerprint, stats: diffDocument.stats },
    source: "rendered",
    stale,
    validation: { ...enriched.validation, warnings: [...new Set(warnings)] },
    metadata: { renderedAt: diffDocument.renderedAt, baseRef: diffDocument.baseRef, baseCommit: diffDocument.baseCommit },
  };
}
