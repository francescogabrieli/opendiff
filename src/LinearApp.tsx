import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  Info,
  Link2,
  Maximize2,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  Star,
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

type ReviewView = "activity" | "diff" | "guide";

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
  fileId,
  line,
  highlighted,
  selected,
  onSelect,
}: {
  fileId: string;
  line: DiffLine;
  highlighted?: string;
  selected: boolean;
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
      className={`lg-diff-line diff-line-row lg-line-${line.type} ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      data-testid={`diff-line-${fileId}-${line.id}`}
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
  forceOpen,
  selectedLineId,
  onLineSelect,
}: {
  file: DiffFile;
  references: ReviewReference[];
  registerRef: (element: HTMLElement | null) => void;
  onCopy: () => void;
  forceOpen: boolean;
  selectedLineId: string;
  onLineSelect: (line: DiffLine) => void;
}) {
  const [expanded, setExpanded] = useState(forceOpen);
  const [reviewed, setReviewed] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<Record<string, string>>({});
  const lines = useMemo(() => focusedLines(file, references), [file, references]);

  useEffect(() => {
    if (forceOpen) setExpanded(true);
  }, [forceOpen]);

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
          aria-label={`${expanded ? "Collapse" : "Expand"} ${file.path}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <FileCode2 size={13} />
          <span className="lg-file-path">{file.path}</span>
        </button>
        <div className="lg-file-stats">
          <span className="lg-additions">+{file.additions}</span>
          <span className="lg-deletions">−{file.deletions}</span>
          <button
            type="button"
            className={`lg-reviewed ${reviewed ? "is-reviewed" : ""}`}
            onClick={() => setReviewed((value) => !value)}
            aria-pressed={reviewed}
          >
            <span>{reviewed ? <Check size={11} /> : null}</span>
            Reviewed
          </button>
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
                fileId={file.id}
                line={line}
                highlighted={highlightedLines[line.id]}
                selected={selectedLineId === line.id}
                onSelect={() => onLineSelect(line)}
              />
            ))}
          </div>
        )
      ) : null}
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
  const [activeView, setActiveView] = useState<ReviewView>(() => {
    const stored = window.localStorage.getItem(`opendiffs:${review.review.id}:view`);
    return stored === "activity" || stored === "diff" || stored === "guide" ? stored : "guide";
  });
  const [activeSectionId, setActiveSectionId] = useState(
    () => window.localStorage.getItem(`opendiffs:${review.review.id}:section`) ?? review.sections[0]?.id ?? "",
  );
  const [expandedFileKey, setExpandedFileKey] = useState(() => {
    const fileId = window.location.hash.slice(1).split("/")[0];
    if (!fileId) return "";
    const section = review.sections.find((candidate) => relevantFiles(candidate, diff.files).some((file) => file.id === fileId));
    return section ? `${section.id}:${fileId}` : "";
  });
  const [selectedLineId, setSelectedLineId] = useState(
    () => window.location.hash.slice(1).split("/")[1] ?? "",
  );
  const [contextLines, setContextLines] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const guideScrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const fileRefs = useRef<Record<string, HTMLElement | null>>({});

  const activeIndex = Math.max(
    0,
    review.sections.findIndex((section) => section.id === activeSectionId),
  );

  useEffect(() => {
    if (!activeSectionId) return;
    window.localStorage.setItem(`opendiffs:${review.review.id}:section`, activeSectionId);
  }, [activeSectionId, review.review.id]);

  useEffect(() => {
    window.localStorage.setItem(`opendiffs:${review.review.id}:view`, activeView);
  }, [activeView, review.review.id]);

  const selectView = useCallback((view: ReviewView) => {
    setActiveView(view);
    setSettingsOpen(false);
    if (view === "diff") setExpandedFileKey((current) => current.startsWith("diff:") ? current : `diff:${diff.files[0]?.id ?? ""}`);
    window.requestAnimationFrame(() => guideScrollRef.current?.scrollTo({ top: 0, behavior: "instant" }));
  }, [diff.files]);

  const selectSection = useCallback(
    (index: number, scroll = true) => {
      const bounded = Math.max(0, Math.min(review.sections.length - 1, index));
      const section = review.sections[bounded];
      if (!section) return;
      setActiveSectionId(section.id);
      if (scroll) sectionRefs.current[section.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [review.sections],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (activeView !== "guide") return;
      if (event.key === "j") {
        event.preventDefault();
        selectSection(activeIndex + 1);
      }
      if (event.key === "k") {
        event.preventDefault();
        selectSection(activeIndex - 1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        selectSection(0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, activeView, selectSection]);

  const selectFile = useCallback((section: ReviewSection, file: DiffFile, reference: ReviewReference) => {
    const key = `${section.id}:${file.id}`;
    const line = file.lines.find((candidate) => lineMatchesReference(candidate, reference));
    setActiveSectionId(section.id);
    setExpandedFileKey(key);
    if (line) {
      setSelectedLineId(line.id);
      window.history.replaceState(null, "", `#${file.id}/${line.id}`);
    }
    window.requestAnimationFrame(() => {
      fileRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
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

  if (!review.sections.length) {
    return <div className="lg-empty">This review has no guided sections.</div>;
  }

  const issueKey = `${review.project.name.slice(0, 4).toUpperCase()}-${review.review.id.replace(/\D/g, "").slice(-4) || "1"}`;

  return (
    <div className="lg-app" data-testid="guided-review">
      <header className="lg-topbar">
        <div className="lg-pr-context">
          <span className="lg-issue-mark" />
          <strong>{issueKey}</strong>
          <ChevronRight size={13} />
          <span className="lg-pr-title">[{issueKey}] {review.review.title}</span>
          <span className="lg-top-additions">+{review.stats.additions}</span>
          <span className="lg-top-deletions">−{review.stats.deletions}</span>
          <IconButton label="Star review"><Star size={14} /></IconButton>
          <IconButton label="More review actions"><MoreHorizontal size={15} /></IconButton>
        </div>
        <div className="lg-topbar-actions">
          <IconButton label="Copy review link" onClick={() => void copyText(window.location.href, "Review link copied")}><Link2 size={14} /></IconButton>
          <IconButton label="Refresh review" onClick={() => void refresh()}><RefreshCw size={14} className={refreshing ? "is-spinning" : ""} /></IconButton>
          <IconButton label="Enter fullscreen" onClick={() => void document.documentElement.requestFullscreen?.()}><Maximize2 size={14} /></IconButton>
          <IconButton label="Technical information" onClick={() => setTechnicalOpen((value) => !value)} active={technicalOpen}>
            <Info size={14} />
          </IconButton>
        </div>
      </header>

      <nav className="lg-viewbar" aria-label="Review views">
        <div className="lg-view-tabs">
          {(["activity", "diff", "guide"] as const).map((view) => (
            <button
              type="button"
              key={view}
              className={activeView === view ? "is-active" : ""}
              aria-current={activeView === view ? "page" : undefined}
              onClick={() => selectView(view)}
            >
              {view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>
        {activeView !== "activity" ? <div className="lg-settings-control">
          <IconButton label="Diff display settings" onClick={() => setSettingsOpen((value) => !value)} active={settingsOpen}>
            <SlidersHorizontal size={14} />
          </IconButton>
          {settingsOpen ? (
            <div className="lg-settings-menu">
              <div className="lg-view-switch"><button type="button" disabled>Split</button><button type="button" className="is-active">Unified</button></div>
              <div className="lg-settings-row"><span>Context lines</span><button type="button" data-testid="context-control" onClick={() => setContextLines((value) => (value === 8 ? 3 : value + 2))}>{contextLines} <ChevronDown size={12} /></button></div>
              <div className="lg-context-options" role="menu" aria-label="Context lines">
                {[3, 5, 8].map((value) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={contextLines === value}
                    key={value}
                    className={contextLines === value ? "is-active" : ""}
                    onClick={() => {
                      setContextLines(value);
                      void onReload(value);
                    }}
                  >
                    {value} lines {contextLines === value ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
              <div className="lg-settings-row"><span>Structural highlighting</span><span className="lg-toggle is-on" /></div>
              <div className="lg-settings-row"><span>Wrap lines</span><span className="lg-toggle" /></div>
              <div className="lg-settings-row"><span>Code theme</span><strong>Linear Dark</strong></div>
            </div>
          ) : null}
        </div> : null}
      </nav>

      <main className="lg-guide-scroll diff-scroll" ref={guideScrollRef}>
        {activeView === "activity" ? (
          <section className="lg-mode-view lg-activity-view" data-testid="activity-view" aria-labelledby="activity-title">
            <header className="lg-mode-header">
              <span>Activity</span>
              <h1 id="activity-title">Review activity</h1>
              <p>Changes, generated guidance, and verification for this local review.</p>
            </header>
            <div className="lg-activity-layout">
              <ol className="lg-activity-feed">
                <li>
                  <span className="lg-activity-icon is-complete"><CircleCheck size={14} /></span>
                  <div><strong>Guided review generated</strong><p>{review.review.summary}</p></div>
                  <time>{formatReviewTime(review.review.generatedAt).replace("Generated ", "")}</time>
                </li>
                {review.sections.map((section, index) => (
                  <li key={section.id}>
                    <span className="lg-activity-icon">{String(index + 1).padStart(2, "0")}</span>
                    <div><strong>{section.title}</strong><p>{section.shortDescription}</p></div>
                    <span>{section.references.length} {section.references.length === 1 ? "reference" : "references"}</span>
                  </li>
                ))}
                {review.tests.executed.map((test) => (
                  <li key={test.command}>
                    <span className={`lg-activity-icon is-${test.status}`}>{test.status === "passed" ? <Check size={13} /> : <AlertTriangle size={13} />}</span>
                    <div><strong>{test.command}</strong><p>{test.summary}</p></div>
                    <span>{test.status}</span>
                  </li>
                ))}
              </ol>
              <aside className="lg-activity-summary">
                <h2>Review summary</h2>
                <dl>
                  <div><dt>Status</dt><dd>{review.completion.status}</dd></div>
                  <div><dt>Files</dt><dd>{review.stats.filesChanged}</dd></div>
                  <div><dt>Sections</dt><dd>{review.sections.length}</dd></div>
                  <div><dt>Changes</dt><dd><span className="lg-additions">+{review.stats.additions}</span> <span className="lg-deletions">−{review.stats.deletions}</span></dd></div>
                </dl>
                <p>{review.completion.summary}</p>
              </aside>
            </div>
          </section>
        ) : activeView === "diff" ? (
          <section className="lg-mode-view lg-full-diff-view" data-testid="diff-view" aria-labelledby="diff-title">
            <header className="lg-mode-header lg-diff-mode-header">
              <div><span>Diff</span><h1 id="diff-title">All changes</h1></div>
              <div className="lg-diff-total"><span>{diff.files.length} files changed</span><span className="lg-additions">+{review.stats.additions}</span><span className="lg-deletions">−{review.stats.deletions}</span></div>
            </header>
            <div className="lg-full-diff-list">
              {diff.files.map((file) => {
                const key = `diff:${file.id}`;
                return (
                  <DiffFileCard
                    key={key}
                    file={file}
                    references={[]}
                    forceOpen={expandedFileKey === key}
                    selectedLineId={selectedLineId}
                    registerRef={(element) => { fileRefs.current[key] = element; }}
                    onCopy={() => void copyText(file.path, "File path copied")}
                    onLineSelect={(line) => {
                      setExpandedFileKey(key);
                      setSelectedLineId(line.id);
                      window.history.replaceState(null, "", `#${file.id}/${line.id}`);
                    }}
                  />
                );
              })}
            </div>
          </section>
        ) : (
          <>
            <header className="lg-guide-review-header">
              <h1>[{issueKey}] {review.review.title}</h1>
              <div className="lg-guide-meta">
                <span className="lg-meta-logo"><span /></span>
                <span>OpenDiff</span><span>·</span><span>{review.project.name}</span><span>·</span>
                <GitBranch size={12} /><span>{review.git.branch}</span><span>←</span>
                <GitCommitHorizontal size={12} /><span>{review.git.baseCommit}</span>
              </div>
              <p>{review.review.summary}</p>
              <div className="lg-review-facts">
                <span>{review.stats.filesChanged} files changed</span>
                <span className="lg-additions">+{review.stats.additions}</span>
                <span className="lg-deletions">−{review.stats.deletions}</span>
                <span>·</span><span>{formatReviewTime(review.review.generatedAt)}</span>
                <span className={`lg-review-state ${bundle.stale ? "is-stale" : ""}`}><span />{bundle.stale ? "Review out of date" : "Ready to review"}</span>
              </div>
            </header>

            {bundle.validation.warnings.length ? <div className="lg-warning-banner review-warning-banner"><AlertTriangle size={14} /><span>{bundle.validation.warnings[0]}</span></div> : null}
            {bundle.stale ? <div className="lg-stale-banner" data-testid="stale-banner"><AlertTriangle size={14} /><span>The working tree has changed since this review was generated.</span><button type="button" onClick={() => void refresh()}>Refresh</button></div> : null}

            <div className="lg-guide-sections">
              {review.sections.map((section, sectionIndex) => {
                const files = relevantFiles(section, diff.files);
                return (
                  <section
                    key={section.id}
                    className={`lg-guide-section ${activeSectionId === section.id ? "is-active" : ""}`}
                    data-testid={`section-nav-item-${section.id}`}
                    ref={(element) => { sectionRefs.current[section.id] = element; }}
                    onClick={() => setActiveSectionId(section.id)}
                  >
                    <article className="lg-guide-copy">
                      <div className="lg-section-count">{String(sectionIndex + 1).padStart(2, "0")} / {String(review.sections.length).padStart(2, "0")}</div>
                      <h2>{section.title}</h2>
                      <p className="lg-guide-purpose">{section.purpose}</p>
                      {section.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      <div className="lg-guide-files" aria-label={`Files in ${section.title}`}>
                        {section.references.map((reference) => {
                          const file = fileForReference(diff.files, reference);
                          if (!file) return <div className="lg-guide-file is-unresolved reference-item" key={reference.id}><AlertTriangle size={13} /><span>{reference.file}</span></div>;
                          return <GuideFileButton key={reference.id} file={file} reference={reference} active={expandedFileKey === `${section.id}:${file.id}`} onClick={() => selectFile(section, file, reference)} />;
                        })}
                      </div>
                      {section.relatedTests?.length ? <div className="lg-guide-verification"><span><Check size={12} /> Verified</span><p>{section.relatedTests[0]}</p></div> : null}
                      {section.risks?.length ? <div className="lg-guide-risk"><AlertTriangle size={13} /><div><strong>{section.risks[0].title}</strong><p>{section.risks[0].description}</p></div></div> : null}
                    </article>
                    <div className="lg-section-diffs" aria-label={`Diffs for ${section.title}`}>
                      {files.map((file) => {
                        const key = `${section.id}:${file.id}`;
                        return <DiffFileCard key={key} file={file} references={referencesForFile(section, file)} forceOpen={expandedFileKey === key} selectedLineId={selectedLineId} registerRef={(element) => { fileRefs.current[key] = element; }} onCopy={() => void copyText(file.path, "File path copied")} onLineSelect={(line) => { setExpandedFileKey(key); setSelectedLineId(line.id); window.history.replaceState(null, "", `#${file.id}/${line.id}`); }} />;
                      })}
                      {!files.length ? <div className="lg-empty-diff">No resolvable files are attached to this section.</div> : null}
                    </div>
                  </section>
                );
              })}
            </div>
            <footer className="lg-completion"><CircleCheck size={16} /><span>{review.completion.summary}</span></footer>
          </>
        )}
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
