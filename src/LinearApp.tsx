import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Code2,
  Copy,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  Info,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadReviewBundle,
  ReviewLoadError,
  type ReviewBundle,
} from "./lib/runtimeData";
import type {
  DiffFile,
  DiffLine,
  ReviewReference,
  ReviewSection,
} from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; bundle: ReviewBundle }
  | { status: "error"; error: unknown };

function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lg-icon-button ${active ? "is-active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function formatReviewTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Generated locally";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Generated just now";
  if (seconds < 3600) return `Generated ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Generated ${Math.floor(seconds / 3600)}h ago`;
  return `Generated ${Math.floor(seconds / 86400)}d ago`;
}

function fileForReference(files: DiffFile[], reference: ReviewReference): DiffFile | undefined {
  return files.find((file) => file.path === reference.file || file.previousPath === reference.file);
}

function referencesForFile(section: ReviewSection, file: DiffFile): ReviewReference[] {
  return section.references.filter(
    (reference) => reference.file === file.path || reference.file === file.previousPath,
  );
}

function relevantFiles(section: ReviewSection, files: DiffFile[]): DiffFile[] {
  const result: DiffFile[] = [];
  const seen = new Set<string>();

  for (const reference of section.references) {
    const file = fileForReference(files, reference);
    if (!file || seen.has(file.id)) continue;
    seen.add(file.id);
    result.push(file);
  }

  return result;
}

function lineMatchesReference(line: DiffLine, reference: ReviewReference): boolean {
  if (line.type === "hunk" || line.type === "binary") return false;

  if (line.referenceIds?.includes(reference.id)) return true;

  if (
    line.newLine !== undefined &&
    line.newLine >= reference.newLines.start &&
    line.newLine <= reference.newLines.end
  ) {
    return true;
  }

  if (
    reference.oldLines &&
    line.oldLine !== undefined &&
    line.oldLine >= reference.oldLines.start &&
    line.oldLine <= reference.oldLines.end
  ) {
    return true;
  }

  return false;
}

function focusedLines(file: DiffFile, references: ReviewReference[], context = 4): DiffLine[] {
  if (!references.length || file.binary || file.status === "binary") return file.lines;

  const relevantIndexes = file.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => references.some((reference) => lineMatchesReference(line, reference)))
    .map(({ index }) => index);

  if (!relevantIndexes.length) return file.lines;

  const included = new Set<number>();
  for (const index of relevantIndexes) {
    const start = Math.max(0, index - context);
    const end = Math.min(file.lines.length - 1, index + context);
    for (let cursor = start; cursor <= end; cursor += 1) included.add(cursor);

    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (file.lines[cursor]?.type === "hunk") {
        included.add(cursor);
        break;
      }
    }
  }

  const sorted = [...included].sort((a, b) => a - b);
  const output: DiffLine[] = [];
  let previous = -1;

  sorted.forEach((index) => {
    if (previous >= 0 && index > previous + 1) {
      output.push({
        id: `guide-gap-${file.id}-${previous}-${index}`,
        type: "hunk",
        content: "⋯",
      });
    }
    output.push(file.lines[index]);
    previous = index;
  });

  return output;
}

function fallbackTokenize(content: string): ReactNode {
  const parts = content.split(
    /(\/\/.*|\/\*[\s\S]*?\*\/|`[^`]*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\b(?:const|let|return|if|else|await|async|export|function|type|new|true|false|null|Promise|import|from|as|class|interface|extends|throw|try|catch)\b)/g,
  );

  return parts.map((part, index) => {
    if (!part) return null;
    let className = "";
    if (/^(\/\/|\/\*)/.test(part)) className = "lg-token-comment";
    else if (/^[`'\"]/.test(part)) className = "lg-token-string";
    else if (/^[A-Za-z]+$/.test(part)) className = "lg-token-keyword";
    return (
      <span className={className} key={`${part}-${index}`}>
        {part}
      </span>
    );
  });
}

function DiffLineView({
  line,
  highlighted,
  onSelect,
}: {
  line: DiffLine;
  highlighted?: string;
  onSelect: () => void;
}) {
  if (line.type === "hunk") {
    return (
      <div className="lg-hunk-row">
        <span className="lg-hunk-gutter" />
        <code>{line.content}</code>
      </div>
    );
  }

  const marker = line.type === "addition" ? "+" : line.type === "deletion" ? "−" : " ";

  return (
    <button
      type="button"
      className={`lg-diff-line lg-line-${line.type}`}
      onClick={onSelect}
      data-testid={`guide-line-${line.id}`}
    >
      <span className="lg-line-number">{line.oldLine ?? ""}</span>
      <span className="lg-line-number">{line.newLine ?? ""}</span>
      <span className="lg-line-marker">{marker}</span>
      <code>
        {highlighted ? (
          <span dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          fallbackTokenize(line.content)
        )}
      </code>
    </button>
  );
}

function DiffFileCard({
  file,
  references,
  registerRef,
  onCopy,
}: {
  file: DiffFile;
  references: ReviewReference[];
  registerRef: (element: HTMLElement | null) => void;
  onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [highlightedLines, setHighlightedLines] = useState<Record<string, string>>({});
  const lines = useMemo(() => focusedLines(file, references), [file, references]);

  useEffect(() => {
    if (!expanded || file.binary || file.status === "binary") return;
    let active = true;
    import("./lib/highlighting")
      .then(({ highlightFileLines }) => highlightFileLines(file.lines, file.language))
      .then((result) => {
        if (active) setHighlightedLines(result);
      })
      .catch(() => {
        if (active) setHighlightedLines({});
      });
    return () => {
      active = false;
    };
  }, [expanded, file]);

  return (
    <article className="lg-file-card" ref={registerRef} data-testid={`diff-file-${file.id}`}>
      <header className="lg-file-header">
        <button
          type="button"
          className="lg-file-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FileCode2 size={13} />
          <span className="lg-file-path">{file.path}</span>
        </button>
        <div className="lg-file-stats">
          <span className="lg-additions">+{file.additions}</span>
          <span className="lg-deletions">−{file.deletions}</span>
          <IconButton label={`Copy ${file.path}`} onClick={onCopy}>
            <Copy size={13} />
          </IconButton>
          <IconButton label="File actions">
            <MoreHorizontal size={14} />
          </IconButton>
        </div>
      </header>

      {expanded ? (
        file.binary || file.status === "binary" ? (
          <div className="lg-binary-file">Binary file — text diff unavailable.</div>
        ) : (
          <div className="lg-code-block" role="table" aria-label={`Diff for ${file.path}`}>
            {lines.map((line) => (
              <DiffLineView
                key={line.id}
                line={line}
                highlighted={highlightedLines[line.id]}
                onSelect={() => {
                  window.history.replaceState(null, "", `#${file.id}/${line.id}`);
                }}
              />
            ))}
          </div>
        )
      ) : (
        <button type="button" className="lg-collapsed-file" onClick={() => setExpanded(true)}>
          Show diff
        </button>
      )}
    </article>
  );
}

function GuideFileButton({
  file,
  reference,
  active,
  onClick,
}: {
  file: DiffFile;
  reference: ReviewReference;
  active: boolean;
  onClick: () => void;
}) {
  const name = file.path.split("/").pop() ?? file.path;
  const directory = file.path.slice(0, Math.max(0, file.path.length - name.length));

  return (
    <button
      type="button"
      className={`lg-guide-file ${active ? "is-active" : ""}`}
      onClick={onClick}
      data-testid={`reference-${reference.id}`}
    >
      <span className={`lg-guide-file-icon is-${file.status}`}>
        <FileCode2 size={13} />
      </span>
      <span className="lg-guide-file-copy">
        <strong>{name}</strong>
        <span>{directory}</span>
      </span>
      <span className="lg-guide-file-stats">
        {file.additions ? <span className="lg-additions">+{file.additions}</span> : null}
        {file.deletions ? <span className="lg-deletions">−{file.deletions}</span> : null}
      </span>
    </button>
  );
}

function ReviewGuide({
  bundle,
  onReload,
}: {
  bundle: ReviewBundle;
  onReload: (contextLines: number) => Promise<void>;
}) {
  const { review, diff } = bundle;
  const [activeSectionId, setActiveSectionId] = useState(
    () => window.localStorage.getItem(`opendiffs:${review.review.id}:section`) ?? review.sections[0]?.id ?? "",
  );
  const [selectedFileId, setSelectedFileId] = useState("");
  const [contextLines, setContextLines] = useState(5);
  const [contextOpen, setContextOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLElement | null>>({});

  const activeSection = useMemo(
    () => review.sections.find((section) => section.id === activeSectionId) ?? review.sections[0],
    [activeSectionId, review.sections],
  );

  const activeIndex = Math.max(
    0,
    review.sections.findIndex((section) => section.id === activeSection?.id),
  );

  const files = useMemo(
    () => (activeSection ? relevantFiles(activeSection, diff.files) : []),
    [activeSection, diff.files],
  );

  useEffect(() => {
    if (!activeSection) return;
    window.localStorage.setItem(`opendiffs:${review.review.id}:section`, activeSection.id);
    const firstFile = files[0];
    setSelectedFileId((current) => (files.some((file) => file.id === current) ? current : firstFile?.id ?? ""));
    diffScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [activeSection, files, review.review.id]);

  const selectSection = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(review.sections.length - 1, index));
      const section = review.sections[bounded];
      if (section) setActiveSectionId(section.id);
    },
    [review.sections],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "j" || event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        selectSection(activeIndex + 1);
      }
      if (event.key === "k" || event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        selectSection(activeIndex - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, selectSection]);

  const selectFile = useCallback((file: DiffFile) => {
    setSelectedFileId(file.id);
    fileRefs.current[file.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const copyText = useCallback(async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setToast(message);
      window.setTimeout(() => setToast(null), 1800);
    } catch {
      setToast("Clipboard unavailable");
      window.setTimeout(() => setToast(null), 1800);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onReload(contextLines);
      setToast("Review refreshed");
      window.setTimeout(() => setToast(null), 1800);
    } finally {
      setRefreshing(false);
    }
  }, [contextLines, onReload]);

  if (!activeSection) {
    return <div className="lg-empty">This review has no guided sections.</div>;
  }

  return (
    <div className="lg-app" data-testid="guided-review">
      <header className="lg-topbar">
        <div className="lg-brand">
          <span className="lg-brand-mark"><span /></span>
          <strong>OpenDiffs</strong>
          <span>local</span>
          {bundle.source === "demo" ? <span>demo data</span> : null}
        </div>
        <div className="lg-repository-context">
          <GitBranch size={12} />
          <span>{review.project.name}</span>
          <span>/</span>
          <span>{review.git.branch}</span>
          <span className="lg-commit"><GitCommitHorizontal size={12} /> {review.git.baseCommit}</span>
        </div>
        <div className="lg-topbar-actions">
          <span className={`lg-review-state ${bundle.stale ? "is-stale" : ""}`}>
            <span />
            {bundle.stale ? "Review out of date" : "Review ready"}
          </span>
          <IconButton label="Refresh review" onClick={() => void refresh()}>
            <RefreshCw size={14} className={refreshing ? "is-spinning" : ""} />
          </IconButton>
          <IconButton label="Technical information" onClick={() => setTechnicalOpen((value) => !value)} active={technicalOpen}>
            <Info size={14} />
          </IconButton>
        </div>
      </header>

      <main className="lg-workspace">
        <aside className="lg-guide-panel">
          <div className="lg-guide-scroll">
            <header className="lg-guide-review-header">
              <h1>{review.review.title}</h1>
              <div className="lg-guide-meta">
                <span>{review.git.branch}</span>
                <span>·</span>
                <span>{review.stats.filesChanged} files</span>
                <span>·</span>
                <span>{formatReviewTime(review.review.generatedAt)}</span>
              </div>
            </header>

            <div className="lg-guide-section-nav">
              <span>{String(activeIndex + 1).padStart(2, "0")} / {String(review.sections.length).padStart(2, "0")}</span>
              <div>
                <IconButton label="Previous section" onClick={() => selectSection(activeIndex - 1)}>
                  <ChevronLeft size={14} />
                </IconButton>
                <IconButton label="Next section" onClick={() => selectSection(activeIndex + 1)}>
                  <ChevronRight size={14} />
                </IconButton>
              </div>
            </div>

            <article className="lg-guide-copy">
              <h2>{activeSection.title}</h2>
              <p className="lg-guide-purpose">{activeSection.purpose}</p>
              {activeSection.explanation.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {activeSection.impact.slice(0, 2).map((item) => (
                <p className="lg-guide-impact" key={item}>{item}</p>
              ))}
            </article>

            <div className="lg-guide-files" aria-label="Files in this section">
              {activeSection.references.map((reference) => {
                const file = fileForReference(diff.files, reference);
                if (!file) {
                  return (
                    <div className="lg-guide-file is-unresolved" key={reference.id}>
                      <AlertTriangle size={13} />
                      <span>{reference.file}</span>
                    </div>
                  );
                }
                return (
                  <GuideFileButton
                    key={reference.id}
                    file={file}
                    reference={reference}
                    active={selectedFileId === file.id}
                    onClick={() => selectFile(file)}
                  />
                );
              })}
            </div>

            {activeSection.relatedTests?.length ? (
              <div className="lg-guide-verification">
                <span><Check size={12} /> Verified</span>
                <p>{activeSection.relatedTests[0]}</p>
              </div>
            ) : null}

            {activeSection.risks?.length ? (
              <div className="lg-guide-risk">
                <AlertTriangle size={13} />
                <div>
                  <strong>{activeSection.risks[0].title}</strong>
                  <p>{activeSection.risks[0].description}</p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="lg-diff-panel" aria-label="Guided diff">
          <div className="lg-diff-toolbar">
            <div className="lg-diff-toolbar-title">
              <Code2 size={13} />
              <strong>Guide</strong>
              <span>{files.length} {files.length === 1 ? "file" : "files"}</span>
            </div>
            <div className="lg-diff-toolbar-actions">
              <div className="lg-context-control">
                <button type="button" onClick={() => setContextOpen((value) => !value)} data-testid="context-control">
                  Context: {contextLines} <ChevronDown size={12} />
                </button>
                {contextOpen ? (
                  <div className="lg-context-menu">
                    {[3, 5, 8].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={contextLines === value ? "is-active" : ""}
                        onClick={() => {
                          setContextLines(value);
                          setContextOpen(false);
                          void onReload(value);
                        }}
                      >
                        {value} lines
                        {contextLines === value ? <Check size={12} /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <IconButton label="More diff options"><MoreHorizontal size={14} /></IconButton>
            </div>
          </div>

          {bundle.validation.warnings.length ? (
            <div className="lg-warning-banner">
              <AlertTriangle size={13} />
              <span>{bundle.validation.warnings[0]}</span>
            </div>
          ) : null}

          {bundle.stale ? (
            <div className="lg-stale-banner">
              <AlertTriangle size={13} />
              <span>The working tree changed after this guide was generated.</span>
              <button type="button" onClick={() => void refresh()}>Refresh</button>
            </div>
          ) : null}

          <div className="lg-diff-scroll" ref={diffScrollRef}>
            {files.map((file) => (
              <DiffFileCard
                key={file.id}
                file={file}
                references={referencesForFile(activeSection, file)}
                registerRef={(element) => {
                  fileRefs.current[file.id] = element;
                }}
                onCopy={() => void copyText(file.path, "File path copied")}
              />
            ))}
            {!files.length ? (
              <div className="lg-empty-diff">No resolvable files are attached to this section.</div>
            ) : null}
          </div>
        </section>
      </main>

      {technicalOpen ? (
        <aside className="lg-technical-popover">
          <div><span>Base commit</span><code>{review.git.baseCommit}</code></div>
          <div><span>Target</span><code>{review.git.targetRef}</code></div>
          <div><span>Schema</span><code>{review.schemaVersion}</code></div>
          <div><span>Changes</span><code>+{review.stats.additions} −{review.stats.deletions}</code></div>
        </aside>
      ) : null}

      {toast ? <div className="lg-toast"><CircleCheck size={14} /> {toast}</div> : null}
    </div>
  );
}

function loadErrorCopy(error: unknown): { title: string; body: string; detail?: string } {
  if (error instanceof ReviewLoadError) {
    if (error.kind === "missing-review") {
      return {
        title: "No OpenDiffs review was found",
        body: "Ask the coding agent to generate .agent-diffs/review.json, then reload.",
      };
    }
    if (error.kind === "missing-base") {
      return {
        title: "The review base is unavailable",
        body: "Regenerate the guide using an existing Git reference.",
      };
    }
    if (error.kind === "empty-diff") {
      return {
        title: "No code changes were found",
        body: "There are no changes between the selected base and the working tree.",
      };
    }
    return {
      title: "OpenDiffs could not load this review",
      body: error.message,
      detail: error.detail,
    };
  }

  return {
    title: "OpenDiffs could not load this review",
    body: error instanceof Error ? error.message : "An unknown error occurred.",
  };
}

function LoadingScreen() {
  return (
    <main className="lg-load-state" role="status">
      <span className="lg-brand-mark"><span /></span>
      <h1>Loading guided review</h1>
      <p>Reading the agent narrative and the current Git diff.</p>
      <span className="lg-loader" />
    </main>
  );
}

function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const copy = loadErrorCopy(error);
  return (
    <main className="lg-load-state lg-error-state" role="alert" data-testid="load-error">
      <AlertTriangle size={19} />
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {copy.detail ? <code>{copy.detail}</code> : null}
      <button type="button" onClick={onRetry}>Try again</button>
    </main>
  );
}

export default function LinearApp() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const query = new URLSearchParams(window.location.search);
  const demo = query.get("demo") === "1";
  const fixture = query.get("fixture");

  const load = useCallback(
    async (contextLines = 5) => {
      const bundle = await loadReviewBundle({ demo, fixture, contextLines });
      setState({ status: "ready", bundle });
    },
    [demo, fixture],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadReviewBundle({ demo, fixture })
      .then((bundle) => {
        if (!cancelled) setState({ status: "ready", bundle });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", error });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, demo, fixture]);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") {
    return <ErrorScreen error={state.error} onRetry={() => setAttempt((value) => value + 1)} />;
  }

  return <ReviewGuide bundle={state.bundle} onReload={load} />;
}
