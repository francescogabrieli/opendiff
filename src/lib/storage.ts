import type { ReviewUiState } from "../types";

const defaultState = (fileIds: string[]): ReviewUiState => ({
  activeSectionId: null,
  activeReferenceId: null,
  expandedFiles: Object.fromEntries(fileIds.map((id) => [id, true])),
  visitedSections: [],
  contextLines: 5,
  showWhitespace: false,
  navigationOpen: false,
  explanationOpen: typeof window === "undefined" ? true : window.innerWidth > 1120,
  selectedLineAnchor: null,
});

export function loadUiState(reviewId: string, fileIds: string[], defaultExpandedFiles: Record<string, boolean> = {}): ReviewUiState {
  const fallback = defaultState(fileIds);
  fallback.expandedFiles = { ...fallback.expandedFiles, ...defaultExpandedFiles };
  if (typeof window === "undefined") return fallback;
  try {
    const saved = window.localStorage.getItem(`opendiffs:ui:${reviewId}`);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<ReviewUiState>;
    return {
      ...fallback,
      ...parsed,
      expandedFiles: { ...fallback.expandedFiles, ...(parsed.expandedFiles ?? {}) },
      visitedSections: Array.isArray(parsed.visitedSections) ? parsed.visitedSections : [],
    };
  } catch {
    return fallback;
  }
}

export function saveUiState(reviewId: string, state: ReviewUiState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`opendiffs:ui:${reviewId}`, JSON.stringify(state));
  } catch {
    // Local storage can be disabled; the review remains usable in memory.
  }
}
