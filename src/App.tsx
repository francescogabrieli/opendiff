import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Clock3,
  Code2,
  Command,
  Copy,
  FileCode2,
  FileMinus2,
  FilePlus2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Info,
  Keyboard,
  ListTree,
  Maximize2,
  Menu,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  RefreshCw,
  ShieldCheck,
  TestTube2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SAMPLE_DIFF, SAMPLE_REVIEW } from "./data/sampleReview";
import { loadReviewBundle, loadReviewStatus, ReviewLoadError, type ReviewBundle } from "./lib/runtimeData";
import { loadUiState, saveUiState } from "./lib/storage";
import type { DiffFile, DiffLine, ReviewReference, ReviewSection, ReviewUiState } from "./types";

let review = SAMPLE_REVIEW;
let diff = SAMPLE_DIFF;
let fileIds = diff.files.map((file) => file.id);

type NavigationSource = "pointer" | "keyboard";

function IconButton({
  label,
  children,
  onClick,
  active = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusDot({ tone = "green" }: { tone?: "green" | "purple" | "yellow" }) {
  return <span className={`status-dot status-dot-${tone}`} aria-hidden="true" />;
}

function getStatusLabel(status: DiffFile["status"]): string {
  if (status === "added") return "added";
  if (status === "deleted") return "deleted";
  if (status === "renamed") return "renamed";
  if (status === "binary") return "binary";
  return "modified";
}

function getFileIcon(status: DiffFile["status"]) {
  if (status === "added") return <FilePlus2 size={14} strokeWidth={1.8} />;
  if (status === "deleted") return <FileMinus2 size={14} strokeWidth={1.8} />;
  return <FileCode2 size={14} strokeWidth={1.8} />;
}

function formatReviewTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Generated locally";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Generated just now";
  if (seconds < 3600) return `Generated ${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `Generated ${Math.floor(seconds / 3600)}h ago`;
  return `Generated ${Math.floor(seconds / 86400)}d ago`;
}

function tokenizeCode(content: string, showWhitespace: boolean): ReactNode {
  const display = showWhitespace
    ? content.replaceAll("\t", "⇥   ").replaceAll(" ", "·")
    : content;
  const parts = display.split(/(\/\/.*|\/\*[\s\S]*?\*\/|`[^`]*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\b(?:const|let|return|if|else|await|async|export|function|type|new|true|false|null|Promise|import|from|as)\b)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        let tokenClass = "";
        if (/^(\/\/|\/\*)/.test(part)) tokenClass = "token-comment";
        else if (/^[`'\"]/.test(part)) tokenClass = "token-string";
        else if (/^(const|let|return|if|else|await|async|export|function|type|new|true|false|null|Promise|import|from|as)$/.test(part)) tokenClass = "token-keyword";
        return (
          <span className={tokenClass} key={`${part}-${index}`}>
            {part}
          </span>
        );
      })}
    </>
  );
}

function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "green" | "red" | "purple";
  icon: ReactNode;
}) {
  return (
    <div className={`stat-card stat-card-${tone}`}>
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">{value}</div>
      {detail ? <div className="stat-detail">{detail}</div> : null}
    </div>
  );
}

function ReviewOverview({
  onSectionSelect,
  overviewRef,
}: {
  onSectionSelect: (sectionId: string, source?: NavigationSource) => void;
  overviewRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <section className="overview-section" ref={overviewRef} aria-labelledby="overview-title">
      <div className="overview-eyebrow">
        <span className="eyebrow-mark"><ListTree size={13} /></span>
        <span>Guided review</span>
        <span className="eyebrow-divider" />
        <span className="muted">Overview</span>
      </div>
      <div className="overview-heading-row">
        <div>
          <h2 id="overview-title">{review.review.title}</h2>
          <p className="overview-summary">{review.review.summary}</p>
        </div>
        <div className={`completion-badge completion-${review.completion.status}`}>
          <CircleCheck size={14} />
          <span>{review.completion.status === "complete" ? "Ready to review" : review.completion.status === "partial" ? "Partially complete" : "Blocked"}</span>
        </div>
      </div>

      <div className="overview-stats" aria-label="Review statistics">
        <StatCard label="Files changed" value={`${review.stats.filesChanged}`} detail={`${review.stats.filesAdded ?? 0} added · ${review.stats.filesModified ?? 0} modified · ${review.stats.filesDeleted ?? 0} deleted`} icon={<Code2 size={14} />} />
        <StatCard label="Lines added" value={`+${review.stats.additions}`} tone="green" icon={<ArrowUp size={14} />} />
        <StatCard label="Lines removed" value={`−${review.stats.deletions}`} tone="red" icon={<ArrowDown size={14} />} />
        <StatCard label="Logical changes" value={`${review.stats.sections}`} detail={`${review.stats.testsChanged} test files`} tone="purple" icon={<ListTree size={14} />} />
      </div>

      <div className="overview-lower-grid">
        <section className="overview-subsection">
          <div className="section-kicker">Reading path</div>
          <p className="section-intro">A short path through the change, ordered by intent.</p>
          <div className="overview-path-list">
            {review.sections.map((section) => (
              <button
                type="button"
                className="overview-path-item"
                key={section.id}
                onClick={() => onSectionSelect(section.id, "pointer")}
              >
                <span className="path-number">{String(section.order).padStart(2, "0")}</span>
                <span className="path-copy">
                  <strong>{section.title}</strong>
                  <span>{section.shortDescription}</span>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </section>

        <section className="overview-subsection verification-subsection">
          <div className="section-kicker">Verification</div>
          <p className="section-intro">The same agent recorded the checks run after the change.</p>
          <div className="test-summary-list">
            {review.tests.executed.map((test) => (
              <div className="test-summary-row" key={test.command}>
                <span className="test-pass"><Check size={12} /></span>
                <span className="test-command">{test.command}</span>
                <span className="test-duration">{test.durationMs ? `${(test.durationMs / 1000).toFixed(1)}s` : "—"}</span>
              </div>
            ))}
          </div>
          <div className="verification-note">
            <AlertTriangle size={13} />
            <span>{review.tests.notExecuted.length} check not run: {review.tests.notExecuted[0]?.name}</span>
          </div>
          {review.risks.length ? (
            <div className="overview-risk-list">
              {review.risks.slice(0, 3).map((risk) => <div className={`overview-risk overview-risk-${risk.severity}`} key={risk.title}><AlertTriangle size={13} /><span><strong>{risk.title}</strong>{risk.description}</span></div>)}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function SectionNav({
  activeSectionId,
  visitedSections,
  onOverview,
  onSectionSelect,
}: {
  activeSectionId: string | null;
  visitedSections: string[];
  onOverview: () => void;
  onSectionSelect: (sectionId: string, source?: NavigationSource) => void;
}) {
  return (
    <nav className="review-nav" aria-label="Guided review navigation">
      <div className="side-nav-heading">
        <div>
          <div className="side-nav-kicker">Guided review</div>
          <div className="side-nav-title">Reading path</div>
        </div>
        <StatusDot tone="purple" />
      </div>

      <button type="button" data-testid="overview-nav-item" className={`overview-nav-item ${activeSectionId === null ? "is-active" : ""}`} onClick={onOverview}>
        <span className="overview-nav-icon"><ListTree size={14} /></span>
        <span>Overview</span>
        <span className="nav-item-hint">⌘ 0</span>
      </button>

      <div className="nav-divider" />
      <div className="nav-section-label">
        <span>Changes</span>
        <span className="nav-count">{review.sections.length}</span>
      </div>

      <div className="section-list">
        {review.sections.map((section) => {
          const visited = visitedSections.includes(section.id);
          const active = activeSectionId === section.id;
          const lines = section.references.reduce((total, reference) => total + reference.newLines.end - reference.newLines.start + 1, 0);
          return (
            <button
              type="button"
              key={section.id}
              data-testid={`section-nav-item-${section.id}`}
              className={`section-nav-item ${active ? "is-active" : ""} ${visited ? "is-visited" : ""}`}
              onClick={() => onSectionSelect(section.id, "pointer")}
              aria-current={active ? "step" : undefined}
            >
              <span className="section-rail" aria-hidden="true"><span /></span>
              <span className="section-nav-number">{String(section.order).padStart(2, "0")}</span>
              <span className="section-nav-copy">
                <strong>{section.title}</strong>
                <span>{section.shortDescription}</span>
                <small>{section.references.length} {section.references.length === 1 ? "file" : "files"} · {lines} lines</small>
              </span>
              {visited ? <span className="visited-mark" aria-label="Visited"><Check size={11} /></span> : null}
            </button>
          );
        })}
      </div>

      <div className="nav-footer">
        <div className="progress-row">
          <span>Review progress</span>
          <span>{visitedSections.length}/{review.sections.length}</span>
        </div>
        <div className="progress-track"><span style={{ width: `${(visitedSections.length / review.sections.length) * 100}%` }} /></div>
        <div className="nav-footer-actions">
          <span><Keyboard size={13} /> <kbd>J</kbd><kbd>K</kbd> navigate</span>
          <span className="shortcut-key"><Command size={12} /> K</span>
        </div>
      </div>
    </nav>
  );
}

function FileHeader({
  file,
  expanded,
  activeSectionId,
  onToggle,
  onCopy,
}: {
  file: DiffFile;
  expanded: boolean;
  activeSectionId: string | null;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const name = file.path.split("/").pop() ?? file.path;
  const directory = file.path.slice(0, Math.max(0, file.path.length - name.length));
  const relevant = activeSectionId === null || file.sections.includes(activeSectionId);
  return (
    <header className={`file-header ${relevant ? "" : "is-dimmed"}`}>
      <button type="button" className="file-toggle" onClick={onToggle} aria-expanded={expanded}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className={`file-status-icon file-status-${file.status}`}>{getFileIcon(file.status)}</span>
        <span className="file-path" title={file.path}>
          <span className="file-directory">{directory}</span><strong>{name}</strong>
          {file.previousPath ? <span className="file-rename-source">← {file.previousPath}</span> : null}
        </span>
      </button>
      <div className="file-header-meta">
        <span className="file-language">{file.language === "TypeScript" ? "TS" : file.language}</span>
        {file.lockfile ? <span className="file-kind">lockfile</span> : null}
        {file.generated ? <span className="file-kind">generated</span> : null}
        <span className={`file-status file-status-text-${file.status}`}>{getStatusLabel(file.status)}</span>
        <span className="file-change file-change-add">+{file.additions}</span>
        <span className="file-change file-change-remove">−{file.deletions}</span>
        <span className="file-sections" aria-label={`${file.sections.length} review sections`}>
          {file.sections.map((sectionId) => <span key={sectionId} className="file-section-dot" title={sectionId} />)}
        </span>
        <IconButton label={`Copy ${file.path}`} onClick={onCopy}><Copy size={13} /></IconButton>
        <IconButton label={expanded ? `Collapse ${file.path}` : `Expand ${file.path}`} onClick={onToggle} active={!expanded}>
          {expanded ? <Maximize2 size={13} /> : <ChevronDown size={13} />}
        </IconButton>
      </div>
    </header>
  );
}

function DiffLineRow({
  file,
  line,
  activeSectionId,
  hoveredReferenceId,
  pulseLineId,
  selectedLineAnchor,
  showWhitespace,
  onLineClick,
  onLineRef,
  highlightedContent,
}: {
  file: DiffFile;
  line: DiffLine;
  activeSectionId: string | null;
  hoveredReferenceId: string | null;
  pulseLineId: string | null;
  selectedLineAnchor: string | null;
  showWhitespace: boolean;
  onLineClick: (file: DiffFile, line: DiffLine) => void;
  onLineRef: (lineId: string, element: HTMLDivElement | null) => void;
  highlightedContent?: string;
}) {
  const relevant = activeSectionId === null || (line.sectionIds ?? []).includes(activeSectionId);
  const selected = selectedLineAnchor === `${file.id}/${line.id}`;
  const hovered = Boolean(hoveredReferenceId && (line.referenceIds ?? []).includes(hoveredReferenceId));
  const kindMark = line.type === "addition" ? "+" : line.type === "deletion" ? "−" : " ";
  return (
    <div
      className={`diff-line-row diff-line-${line.type} ${relevant ? "" : "is-dimmed"} ${selected ? "is-selected" : ""} ${hovered ? "is-reference-hover" : ""} ${pulseLineId === line.id ? "is-pulsing" : ""}`}
      data-testid={`diff-line-${file.id}-${line.id}`}
      id={`${file.id}-${line.id}`}
      ref={(element) => onLineRef(line.id, element)}
      role="button"
      tabIndex={0}
      onClick={() => onLineClick(file, line)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onLineClick(file, line);
        }
      }}
      aria-label={`${line.type} line ${line.newLine ?? line.oldLine ?? ""}`}
    >
      <span className="line-number line-number-old">{line.oldLine ?? ""}</span>
      <span className="line-number line-number-new">{line.newLine ?? ""}</span>
      <span className="line-marker" aria-hidden="true">{kindMark}</span>
      <code className="line-code">{highlightedContent && !showWhitespace ? <span dangerouslySetInnerHTML={{ __html: highlightedContent }} /> : tokenizeCode(line.content, showWhitespace)}</code>
    </div>
  );
}

function VirtualizedDiffCode({
  file,
  activeSectionId,
  hoveredReferenceId,
  pulseLineId,
  selectedLineAnchor,
  showWhitespace,
  onLineClick,
  onLineRef,
  pendingReferenceId,
  highlightedLines,
}: {
  file: DiffFile;
  activeSectionId: string | null;
  hoveredReferenceId: string | null;
  pulseLineId: string | null;
  selectedLineAnchor: string | null;
  showWhitespace: boolean;
  onLineClick: (file: DiffFile, line: DiffLine) => void;
  onLineRef: (lineId: string, element: HTMLDivElement | null) => void;
  pendingReferenceId: string | null;
  highlightedLines: Record<string, string>;
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: file.lines.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 23,
    overscan: 14,
  });
  useEffect(() => {
    if (!pendingReferenceId) return;
    const index = file.lines.findIndex((line) => line.referenceIds?.includes(pendingReferenceId));
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center", behavior: "smooth" });
  }, [file.lines, pendingReferenceId, virtualizer]);

  return (
    <div className="diff-code diff-code-virtualized" role="table" aria-label={`Diff for ${file.path}`} ref={scrollElementRef}>
      <div className="virtual-diff-spacer" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const line = file.lines[item.index];
          return line.type === "hunk" ? (
            <div className="diff-hunk-row virtual-diff-row" key={line.id} role="row" ref={virtualizer.measureElement} data-index={item.index} style={{ transform: `translateY(${item.start}px)` }}>
              <span className="hunk-gutter" />
              <span className="hunk-copy">{line.content}</span>
            </div>
          ) : (
            <div className="virtual-diff-row" key={line.id} ref={virtualizer.measureElement} data-index={item.index} style={{ transform: `translateY(${item.start}px)` }}>
              <DiffLineRow
                file={file}
                line={line}
                activeSectionId={activeSectionId}
                hoveredReferenceId={hoveredReferenceId}
                pulseLineId={pulseLineId}
                selectedLineAnchor={selectedLineAnchor}
                showWhitespace={showWhitespace}
                onLineClick={onLineClick}
                onLineRef={onLineRef}
                highlightedContent={highlightedLines[line.id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffFileView({
  file,
  expanded,
  activeSectionId,
  hoveredReferenceId,
  pulseLineId,
  selectedLineAnchor,
  showWhitespace,
  onToggle,
  onCopy,
  onLineClick,
  onFileRef,
  onLineRef,
  pendingReferenceId,
}: {
  file: DiffFile;
  expanded: boolean;
  activeSectionId: string | null;
  hoveredReferenceId: string | null;
  pulseLineId: string | null;
  selectedLineAnchor: string | null;
  showWhitespace: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onLineClick: (file: DiffFile, line: DiffLine) => void;
  onFileRef: (fileId: string, element: HTMLElement | null) => void;
  onLineRef: (lineId: string, element: HTMLDivElement | null) => void;
  pendingReferenceId: string | null;
}) {
  const [highlightedLines, setHighlightedLines] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!expanded || file.binary || file.status === "binary") return;
    let active = true;
    import("./lib/highlighting").then(({ highlightFileLines }) => highlightFileLines(file.lines, file.language)).then((result) => {
      if (active) setHighlightedLines(result);
    });
    return () => { active = false; };
  }, [expanded, file.binary, file.id, file.language, file.lines, file.status]);
  return (
    <article className={`diff-file ${activeSectionId && !file.sections.includes(activeSectionId) ? "is-dimmed" : ""}`} data-testid={`diff-file-${file.id}`} ref={(element) => onFileRef(file.id, element)}>
      <FileHeader file={file} expanded={expanded} activeSectionId={activeSectionId} onToggle={onToggle} onCopy={onCopy} />
      {expanded ? (
        file.binary || file.status === "binary" ? (
          <div className="binary-file-summary" role="status">
            <div className="binary-file-icon"><FileCode2 size={16} /></div>
            <div><strong>Binary diff unavailable</strong><span>{file.oldSize !== undefined ? `${formatBytes(file.oldSize)} previous` : "No previous file"} → {file.newSize !== undefined ? `${formatBytes(file.newSize)} current` : "file removed"}</span></div>
          </div>
        ) : file.lines.length > 400 ? (
          <VirtualizedDiffCode
            file={file}
            activeSectionId={activeSectionId}
            hoveredReferenceId={hoveredReferenceId}
            pulseLineId={pulseLineId}
            selectedLineAnchor={selectedLineAnchor}
            showWhitespace={showWhitespace}
            onLineClick={onLineClick}
            onLineRef={onLineRef}
            pendingReferenceId={pendingReferenceId}
            highlightedLines={highlightedLines}
          />
        ) : (
          <div className="diff-code" role="table" aria-label={`Diff for ${file.path}`}>
            {file.lines.map((line) => line.type === "hunk" ? (
              <div className="diff-hunk-row" key={line.id} role="row">
                <span className="hunk-gutter" />
                <span className="hunk-copy">{line.content}</span>
              </div>
            ) : (
              <DiffLineRow
                key={line.id}
                file={file}
                line={line}
                activeSectionId={activeSectionId}
                hoveredReferenceId={hoveredReferenceId}
                pulseLineId={pulseLineId}
                selectedLineAnchor={selectedLineAnchor}
                showWhitespace={showWhitespace}
                onLineClick={onLineClick}
                onLineRef={onLineRef}
                highlightedContent={highlightedLines[line.id]}
              />
            ))}
          </div>
        )
      ) : (
        <div className="collapsed-file-note"><span>File collapsed</span><button type="button" onClick={onToggle}>Show diff</button></div>
      )}
    </article>
  );
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReferenceItem({
  reference,
  onClick,
  onHover,
}: {
  reference: ReviewReference;
  onClick: () => void;
  onHover: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`reference-item ${reference.resolved === false ? "is-unresolved" : ""}`}
      data-testid={`reference-${reference.id}`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <span className={`reference-kind reference-kind-${reference.kind}`} aria-hidden="true"><Code2 size={12} /></span>
      <span className="reference-copy">
        <span className="reference-file">{reference.file}</span>
        <span className="reference-symbol">{reference.symbol ?? "Changed lines"} <span className="reference-lines">L{reference.newLines.start}–{reference.newLines.end}</span></span>
        <span className="reference-description">{reference.description}</span>
      </span>
      {reference.resolved === false ? <AlertTriangle className="reference-warning" size={13} aria-label="Unresolved reference" /> : <ChevronRight className="reference-arrow" size={14} />}
    </button>
  );
}

function ExplanationPanel({
  activeSection,
  onReferenceClick,
  onReferenceHover,
  onSectionSelect,
  onOverview,
}: {
  activeSection: ReviewSection | null;
  onReferenceClick: (section: ReviewSection, reference: ReviewReference) => void;
  onReferenceHover: (reference: ReviewReference, active: boolean) => void;
  onSectionSelect: (sectionId: string, source?: NavigationSource) => void;
  onOverview: () => void;
}) {
  const activeIndex = activeSection ? review.sections.findIndex((section) => section.id === activeSection.id) : -1;
  const previous = activeIndex > 0 ? review.sections[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < review.sections.length - 1 ? review.sections[activeIndex + 1] : null;

  return (
    <div className="explanation-inner">
      <div className="explanation-topline">
        <span>{activeSection ? `Section ${String(activeSection.order).padStart(2, "0")}` : "Review context"}</span>
        <span className="explanation-topline-status"><StatusDot /> {activeSection ? "Focused" : "Overview"}</span>
      </div>
      {activeSection ? (
        <>
          <h2 className="explanation-title">{activeSection.title}</h2>
          <div className="purpose-block">
            <span className="panel-label">Purpose</span>
            <p>{activeSection.purpose}</p>
          </div>
          <div className="explanation-block">
            <span className="panel-label">Explanation</span>
            {activeSection.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          <div className="explanation-block">
            <span className="panel-label">Impact</span>
            <ul className="impact-list">
              {activeSection.impact.map((item) => <li key={item}><span className="impact-bullet" />{item}</li>)}
            </ul>
          </div>
          <div className="explanation-block references-block">
            <div className="panel-label-row"><span className="panel-label">References</span><span className="panel-label-count">{activeSection.references.length}</span></div>
            <div className="reference-list">
              {activeSection.references.map((reference) => (
                <ReferenceItem
                  key={reference.id}
                  reference={reference}
                  onClick={() => onReferenceClick(activeSection, reference)}
                  onHover={(isActive) => onReferenceHover(reference, isActive)}
                />
              ))}
            </div>
          </div>
          {activeSection.relatedTests?.length ? (
            <div className="explanation-block related-tests-block">
              <span className="panel-label">Related verification</span>
              {activeSection.relatedTests.map((test) => <div className="related-test" key={test}><TestTube2 size={13} /><span>{test}</span></div>)}
            </div>
          ) : null}
          {activeSection.notes?.length ? (
            <div className="note-block"><span className="panel-label">Note</span><p>{activeSection.notes[0]}</p></div>
          ) : null}
          {activeSection.risks?.length ? (
            <div className="risk-block">
              <div className="risk-heading"><AlertTriangle size={13} /><span>Risk to keep in mind</span></div>
              <strong>{activeSection.risks[0].title}</strong>
              <p>{activeSection.risks[0].description}</p>
            </div>
          ) : null}
          <div className="explanation-pagination">
            <button type="button" disabled={!previous} onClick={() => previous && onSectionSelect(previous.id, "pointer")}><ArrowUp size={13} /><span>Previous</span></button>
            <button type="button" disabled={!next} onClick={() => next && onSectionSelect(next.id, "pointer")}><span>Next</span><ArrowDown size={13} /></button>
          </div>
        </>
      ) : (
        <>
          <h2 className="explanation-title">A review organized by intent</h2>
          <p className="explanation-lead">OpenDiff keeps the code in the center and puts the agent’s reasoning one click away from the lines it describes.</p>
          <div className="overview-panel-block">
            <span className="panel-label">How to read it</span>
            <div className="read-instruction"><span className="instruction-number">01</span><span>Start with the reading path on the left.</span></div>
            <div className="read-instruction"><span className="instruction-number">02</span><span>Use references to jump to the exact hunk.</span></div>
            <div className="read-instruction"><span className="instruction-number">03</span><span>Click a line to create a stable deep link.</span></div>
          </div>
          <div className="overview-panel-block">
            <div className="panel-label-row"><span className="panel-label">Verification</span><span className="panel-label-count">{review.tests.executed.length} passed</span></div>
            {review.tests.executed.map((test) => <div className="panel-test-row" key={test.command}><span className="test-pass"><Check size={11} /></span><span>{test.command}</span></div>)}
          </div>
          {review.tests.notExecuted.length ? (
            <div className="panel-warning"><AlertTriangle size={14} /><span>{review.tests.notExecuted[0].name} was not run.</span></div>
          ) : null}
          <div className="overview-panel-block overview-commit-block">
            <span className="panel-label">Source</span>
            <div className="source-row"><GitCommitHorizontal size={13} /><span>Base <strong>{review.git.baseCommit}</strong></span></div>
            <div className="source-row"><GitBranch size={13} /><span>{review.git.branch}</span></div>
            <div className="source-row"><Clock3 size={13} /><span>{formatReviewTime(review.review.generatedAt)}</span></div>
          </div>
          <button type="button" className="focus-first-button" onClick={() => onSectionSelect(review.sections[0].id, "pointer")}>
            <span>Start with the first change</span><ArrowDown size={14} />
          </button>
          <button type="button" className="back-overview-button" onClick={onOverview}>Keep overview open</button>
        </>
      )}
    </div>
  );
}

function TechnicalDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="technical-dialog" data-testid="technical-dialog" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="technical-title" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="technical-dialog-header">
          <div><span className="panel-label">Review metadata</span><h2 id="technical-title">Technical information</h2></div>
          <IconButton label="Close technical information" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="technical-grid">
          <div><span className="technical-label">Review ID</span><code>{review.review.id}</code></div>
          <div><span className="technical-label">Schema</span><code>v{review.schemaVersion}</code></div>
          <div><span className="technical-label">Base commit</span><code>{review.git.baseCommit}</code></div>
          <div><span className="technical-label">Fingerprint</span><code>{review.git.fingerprint}</code></div>
          <div><span className="technical-label">Target</span><code>{review.git.targetRef}</code></div>
          <div><span className="technical-label">Working tree</span><span className="technical-clean"><CircleCheck size={13} /> clean</span></div>
        </div>
        <div className="technical-original-task"><span className="technical-label">Original task</span><p>{review.review.originalTask}</p></div>
        <div className="technical-dialog-footer"><span><ShieldCheck size={13} /> Local-only review data</span><button type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

function ReviewWorkspace({ bundle }: { bundle: ReviewBundle }) {
  review = bundle.review;
  const [renderedDiff, setRenderedDiff] = useState(bundle.diff);
  diff = renderedDiff;
  fileIds = diff.files.map((file) => file.id);
  const [ui, setUi] = useState<ReviewUiState>(() => loadUiState(review.review.id, fileIds, Object.fromEntries(diff.files.map((file) => [file.id, !(file.lockfile || file.generated)]))));
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [stale, setStale] = useState(bundle.stale);
  const [refreshing, setRefreshing] = useState(false);
  const [pulseLineId, setPulseLineId] = useState<string | null>(null);
  const [hoveredReferenceId, setHoveredReferenceId] = useState<string | null>(null);
  const overviewRef = useRef<HTMLElement>(null);
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLElement | null>>({});
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingReference = useRef<string | null>(null);
  const scrollBehavior = useRef<ScrollBehavior>("smooth");
  const ignoreScrollUntil = useRef(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    setRenderedDiff(bundle.diff);
    setStale(bundle.stale);
    setUi((previous) => ({
      ...previous,
      expandedFiles: Object.fromEntries(bundle.diff.files.map((file) => [file.id, previous.expandedFiles[file.id] !== false])),
    }));
  }, [bundle]);

  const activeSection = useMemo(
    () => review.sections.find((section) => section.id === ui.activeSectionId) ?? null,
    [ui.activeSectionId, bundle],
  );
  const referenceSectionMap = useMemo(() => {
    const map = new Map<string, ReviewSection>();
    review.sections.forEach((section) => section.references.forEach((reference) => map.set(reference.id, section)));
    return map;
  }, [bundle]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    const scrollElement = diffScrollRef.current;
    if (!scrollElement) return;
    let frame = 0;
    const handleScroll = () => {
      if (ignoreScrollUntil.current > Date.now()) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const midpoint = scrollElement.getBoundingClientRect().top + Math.min(280, scrollElement.clientHeight * 0.35);
        let closest: { distance: number; sectionId: string } | null = null;
        for (const file of diff.files) {
          for (const line of file.lines) {
            if (!line.sectionIds?.length) continue;
            const node = lineRefs.current[line.id];
            if (!node) continue;
            const rect = node.getBoundingClientRect();
            if (rect.bottom < scrollElement.getBoundingClientRect().top || rect.top > scrollElement.getBoundingClientRect().bottom) continue;
            const distance = Math.abs(rect.top - midpoint);
            if (!closest || distance < closest.distance) closest = { distance, sectionId: line.sectionIds[0] };
          }
        }
        if (closest && closest.sectionId !== ui.activeSectionId) {
          setUi((previous) => ({ ...previous, activeSectionId: closest?.sectionId ?? previous.activeSectionId }));
        }
      });
    };
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [renderedDiff, ui.activeSectionId]);

  useEffect(() => {
    saveUiState(review.review.id, ui);
  }, [ui]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    const pendingReferenceId = pendingReference.current;
    if (!pendingReferenceId) return;
    const timeout = window.setTimeout(() => {
      const target = diff.files.flatMap((file) => file.lines.map((line) => ({ file, line }))).find(({ line }) => line.referenceIds?.includes(pendingReferenceId));
      const node = target ? lineRefs.current[target.line.id] : null;
      if (node) {
        node.scrollIntoView({ behavior: scrollBehavior.current, block: "center", inline: "nearest" });
        setPulseLineId(target?.line.id ?? null);
        window.setTimeout(() => setPulseLineId(null), 900);
      }
      pendingReference.current = null;
    }, 45);
    return () => window.clearTimeout(timeout);
  }, [ui.expandedFiles, ui.activeReferenceId, renderedDiff]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const [fileId, lineId] = hash.split("/");
      if (!fileId || !lineId || !fileRefs.current[fileId]) return;
      const file = diff.files.find((item) => item.id === fileId);
      const line = file?.lines.find((item) => item.id === lineId);
      if (!file || !line) return;
      setUi((previous) => ({ ...previous, expandedFiles: { ...previous.expandedFiles, [fileId]: true }, selectedLineAnchor: `${fileId}/${lineId}` }));
      pendingReference.current = line.referenceIds?.[0] ?? null;
    };
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setUiPartial = useCallback((patch: Partial<ReviewUiState>) => {
    setUi((previous) => ({ ...previous, ...patch }));
  }, []);

  const selectSection = useCallback((sectionId: string, source: NavigationSource = "pointer", explicitReferenceId?: string) => {
    const section = review.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const reference = section.references.find((item) => item.id === explicitReferenceId) ?? section.references[0];
    const targetFile = reference ? diff.files.find((file) => file.path === reference.file || file.previousPath === reference.file) : undefined;
    scrollBehavior.current = source === "keyboard" ? "auto" : "smooth";
    ignoreScrollUntil.current = Date.now() + (source === "keyboard" ? 350 : 900);
    setUi((previous) => ({
      ...previous,
      activeSectionId: sectionId,
      activeReferenceId: reference?.id ?? null,
      visitedSections: previous.visitedSections.includes(sectionId) ? previous.visitedSections : [...previous.visitedSections, sectionId],
      expandedFiles: targetFile ? { ...previous.expandedFiles, [targetFile.id]: true } : previous.expandedFiles,
    }));
    if (reference) pendingReference.current = reference.id;
  }, []);

  const showOverview = useCallback(() => {
    scrollBehavior.current = "smooth";
    setUiPartial({ activeSectionId: null, activeReferenceId: null, selectedLineAnchor: null });
    overviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setUiPartial]);

  const handleReferenceClick = useCallback((section: ReviewSection, reference: ReviewReference) => {
    selectSection(section.id, "pointer", reference.id);
    const file = diff.files.find((item) => item.path === reference.file || item.previousPath === reference.file);
    if (file) {
      const targetLine = file.lines.find((line) => line.newLine === reference.newLines.start && line.type !== "hunk") ?? file.lines.find((line) => line.referenceIds?.includes(reference.id));
      if (targetLine) {
        window.history.replaceState(null, "", `#${file.id}/${targetLine.id}`);
        setUiPartial({ selectedLineAnchor: `${file.id}/${targetLine.id}` });
      }
    }
  }, [selectSection, setUiPartial]);

  const handleReferenceHover = useCallback((reference: ReviewReference, active: boolean) => {
    setHoveredReferenceId(active ? reference.id : null);
    if (!active) return;
    const file = diff.files.find((item) => item.path === reference.file || item.previousPath === reference.file);
    if (!file) return;
    setUi((previous) => ({ ...previous, expandedFiles: { ...previous.expandedFiles, [file.id]: true } }));
  }, []);

  const handleLineClick = useCallback((file: DiffFile, line: DiffLine) => {
    const referenceId = line.referenceIds?.[0] ?? null;
    const sectionId = line.sectionIds?.[0] ?? (referenceId ? referenceSectionMap.get(referenceId)?.id : null) ?? null;
    setUi((previous) => ({
      ...previous,
      activeSectionId: sectionId,
      activeReferenceId: referenceId,
      selectedLineAnchor: `${file.id}/${line.id}`,
      visitedSections: sectionId && !previous.visitedSections.includes(sectionId) ? [...previous.visitedSections, sectionId] : previous.visitedSections,
    }));
    window.history.replaceState(null, "", `#${file.id}/${line.id}`);
    setPulseLineId(line.id);
    window.setTimeout(() => setPulseLineId(null), 900);
  }, [referenceSectionMap]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const activeIndex = ui.activeSectionId ? review.sections.findIndex((section) => section.id === ui.activeSectionId) : -1;
    if (event.key === "Escape") {
      event.preventDefault();
      showOverview();
      return;
    }
    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(review.sections.length - 1, activeIndex + 1);
      selectSection(review.sections[nextIndex].id, "keyboard");
      return;
    }
    if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      const previousIndex = activeIndex <= 0 ? 0 : activeIndex - 1;
      selectSection(review.sections[previousIndex].id, "keyboard");
      return;
    }
    if (event.key === "Enter" && ui.activeSectionId === null) {
      event.preventDefault();
      selectSection(review.sections[0].id, "keyboard");
    }
  }, [selectSection, showOverview, ui.activeSectionId]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const copyText = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("Clipboard access is unavailable");
    }
  }, [notify]);

  const reloadReview = useCallback(async (contextLines = ui.contextLines, message = "Review checked against the working tree") => {
    setRefreshing(true);
    try {
      if (bundle.source === "demo") {
        setStale(false);
        notify(message);
        return;
      }
      const nextBundle = await loadReviewBundle({ contextLines });
      setRenderedDiff(nextBundle.diff);
      setStale(nextBundle.stale);
      notify(nextBundle.stale ? "The working tree is still out of date" : message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not reload the review");
    } finally {
      window.setTimeout(() => setRefreshing(false), 180);
    }
  }, [bundle.source, notify, ui.contextLines]);

  const refreshReview = useCallback(() => {
    void reloadReview(ui.contextLines);
  }, [reloadReview, ui.contextLines]);

  const changeContext = useCallback((value: number) => {
    setUiPartial({ contextLines: value });
    setContextMenuOpen(false);
    if (bundle.source !== "demo") void reloadReview(value, `Context updated to ${value} lines`);
  }, [bundle.source, reloadReview, setUiPartial]);

  useEffect(() => {
    if (bundle.source === "demo") return;
    const checkStatus = () => { void loadReviewStatus().then((status) => setStale(Boolean(status.stale))).catch(() => { /* Keep the last known state when the server is unavailable. */ }); };
    const interval = window.setInterval(checkStatus, 15000);
    return () => window.clearInterval(interval);
  }, [bundle.source]);

  return (
    <div className={`app-shell ${ui.navigationOpen ? "nav-open" : ""} ${ui.explanationOpen ? "explanation-open" : "explanation-closed"}`} data-testid="guided-review">
      <a className="skip-link" href="#main-content">Skip to diff</a>
      <header className="topbar">
        <div className="topbar-brand">
          <button type="button" className="mobile-panel-button" aria-label="Open review navigation" onClick={() => setUiPartial({ navigationOpen: !ui.navigationOpen })}><Menu size={16} /></button>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">OpenDiff</span>
          <span className="brand-version">local</span>
          {bundle.source === "demo" ? <span className="demo-badge">demo data</span> : null}
        </div>
        <div className="topbar-context" aria-label="Repository context">
          <span>agent-diffs</span><span className="context-slash">/</span><span>{review.git.branch}</span>
          <span className="context-base"><GitCommitHorizontal size={12} /> {review.git.baseCommit}</span>
        </div>
        <div className="topbar-actions">
          <div className={`review-status ${stale ? "review-status-stale" : ""}`}><StatusDot tone={stale ? "yellow" : "green"} /><span>{stale ? "Review out of date" : "Review ready"}</span></div>
          <span className="topbar-separator" />
          <IconButton label="Refresh review" onClick={refreshReview} className={refreshing ? "is-spinning" : ""}><RefreshCw size={14} /></IconButton>
          <IconButton label="Technical information" onClick={() => setTechnicalOpen(true)}><Info size={14} /></IconButton>
          <IconButton label="Toggle explanation panel" onClick={() => setUiPartial({ explanationOpen: !ui.explanationOpen })} active={ui.explanationOpen}><PanelRight size={15} /></IconButton>
        </div>
      </header>

      <header className="review-header">
        <div className="review-header-copy">
          <div className="review-breadcrumb"><GitPullRequest size={13} /><span>Working tree review</span><span className="breadcrumb-dot">·</span><span>{review.git.targetRef}</span></div>
          <h1>{review.review.title}</h1>
          <p className="review-original-task" title={review.review.originalTask}>{review.review.originalTask}</p>
        </div>
        <div className="review-header-stats">
          <span>{review.stats.filesChanged} files changed</span>
          <span className="header-stat-add">+{review.stats.additions}</span>
          <span className="header-stat-remove">−{review.stats.deletions}</span>
          <span className="header-generated"><Clock3 size={12} /> {formatReviewTime(review.review.generatedAt)}</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="navigation-panel">
          <SectionNav
            activeSectionId={ui.activeSectionId}
            visitedSections={ui.visitedSections}
            onOverview={showOverview}
            onSectionSelect={selectSection}
          />
        </aside>

        <main className="diff-panel" id="main-content">
          <div className="diff-toolbar">
            <div className="diff-toolbar-title"><span className="toolbar-title-icon"><Code2 size={14} /></span><span>Unified diff</span><span className="toolbar-file-count">{diff.files.length} files</span></div>
            <div className="diff-toolbar-actions">
              <div className="context-control">
                <button type="button" className={`toolbar-control ${contextMenuOpen ? "is-active" : ""}`} data-testid="context-control" onClick={() => setContextMenuOpen(!contextMenuOpen)} aria-expanded={contextMenuOpen}>Context: {ui.contextLines}<ChevronDown size={12} /></button>
                {contextMenuOpen ? (
                  <div className="context-popover" role="menu">
                    <span className="context-popover-label">Context lines</span>
                    {[3, 5, 8].map((value) => <button type="button" role="menuitemradio" aria-checked={ui.contextLines === value} className={ui.contextLines === value ? "is-selected" : ""} key={value} onClick={() => changeContext(value)}>{value} lines {ui.contextLines === value ? <Check size={12} /> : null}</button>)}
                  </div>
                ) : null}
              </div>
              <button type="button" className={`toolbar-control ${ui.showWhitespace ? "is-active" : ""}`} onClick={() => setUiPartial({ showWhitespace: !ui.showWhitespace })}><span className="whitespace-symbol">·</span> Whitespace</button>
              <span className="toolbar-divider" />
              <IconButton label="More diff options"><MoreHorizontal size={15} /></IconButton>
              <button type="button" className="mobile-panel-button diff-panel-toggle" aria-label="Open explanation" onClick={() => setUiPartial({ explanationOpen: true })}><PanelRight size={15} /></button>
            </div>
          </div>
          {bundle.validation.warnings.length ? <div className="review-warning-banner" role="status"><AlertTriangle size={14} /><span>{bundle.validation.warnings.length === 1 ? bundle.validation.warnings[0] : `${bundle.validation.warnings.length} review warnings — unresolved references remain visible.`}</span></div> : null}
          {stale ? <div className="stale-banner" data-testid="stale-banner"><AlertTriangle size={14} /><span>The working tree has changed since this review was generated.</span><button type="button" onClick={refreshReview}>Regenerate review</button></div> : null}
          <div className="diff-scroll" ref={diffScrollRef}>
            <ReviewOverview onSectionSelect={selectSection} overviewRef={overviewRef} />
            <div className="diff-files-heading"><span>Changed files</span><span>{diff.files.length} files in reading order</span></div>
            <div className="diff-file-list">
              {diff.files.map((file) => (
                <DiffFileView
                  key={file.id}
                  file={file}
                  expanded={ui.expandedFiles[file.id] !== false}
                  activeSectionId={ui.activeSectionId}
                  hoveredReferenceId={hoveredReferenceId}
                  pulseLineId={pulseLineId}
                  selectedLineAnchor={ui.selectedLineAnchor}
                  showWhitespace={ui.showWhitespace}
                  onToggle={() => setUi((previous) => ({ ...previous, expandedFiles: { ...previous.expandedFiles, [file.id]: !expandedFile(previous, file.id) } }))}
                  onCopy={() => copyText(file.path, "File path copied")}
                  onLineClick={handleLineClick}
                  onFileRef={(fileId, element) => { fileRefs.current[fileId] = element; }}
                  onLineRef={(lineId, element) => { lineRefs.current[lineId] = element; }}
                  pendingReferenceId={ui.activeReferenceId}
                />
              ))}
            </div>
          </div>
        </main>

        <aside className="explanation-panel" aria-label="Section explanation">
          <div className="explanation-panel-header">
            <div className="explanation-heading"><span className="explanation-heading-mark"><Code2 size={13} /></span><span>Agent explanation</span></div>
            <IconButton label="Close explanation panel" onClick={() => setUiPartial({ explanationOpen: false })}><X size={14} /></IconButton>
          </div>
          <div className="explanation-scroll">
            <ExplanationPanel
              activeSection={activeSection}
              onReferenceClick={handleReferenceClick}
              onReferenceHover={handleReferenceHover}
              onSectionSelect={selectSection}
              onOverview={showOverview}
            />
          </div>
        </aside>
      </div>

      {ui.navigationOpen ? <button type="button" className="mobile-backdrop" aria-label="Close navigation" onClick={() => setUiPartial({ navigationOpen: false })} /> : null}
      {technicalOpen ? <TechnicalDialog onClose={() => setTechnicalOpen(false)} /> : null}
      {toast ? <div className="toast" role="status"><Check size={14} /><span>{toast}</span></div> : null}
    </div>
  );
}

function expandedFile(ui: ReviewUiState, fileId: string): boolean {
  return ui.expandedFiles[fileId] !== false;
}

function loadErrorCopy(error: unknown): { title: string; body: string; detail?: string } {
  if (error instanceof ReviewLoadError) {
    if (error.kind === "missing-review") return { title: "No OpenDiff review was found", body: "Ask the coding agent to generate .agent-diffs/review.json, then reload this page." };
    if (error.kind === "missing-base") return { title: "The review base is unavailable", body: "The recorded Git base no longer exists. Regenerate the review using an existing Git reference." };
    if (error.kind === "empty-diff") return { title: "No code changes were found", body: "There are no changes between the selected base and the current working tree." };
    if (error.kind === "invalid-json") return { title: "The review data is invalid", body: "OpenDiff could not read the generated review data. Validate review.json and render it again.", detail: error.detail };
    return { title: "The local renderer is unavailable", body: "Start OpenDiff from the repository with agent-diffs review, then try again.", detail: error.detail };
  }
  return { title: "OpenDiff could not open this review", body: error instanceof Error ? error.message : "An unknown local error occurred." };
}

function LoadingScreen() {
  return (
    <main className="load-state" role="status" aria-live="polite">
      <div className="load-state-mark"><span /></div>
      <span className="load-state-kicker">OpenDiff · local review</span>
      <h1>Loading guided review</h1>
      <p>Reading the review narrative and the current Git diff.</p>
      <span className="load-spinner" aria-hidden="true" />
    </main>
  );
}

function ErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const copy = loadErrorCopy(error);
  return (
    <main className="load-state load-error" role="alert" data-testid="load-error">
      <div className="load-state-mark load-state-mark-error"><AlertTriangle size={17} /></div>
      <span className="load-state-kicker">OpenDiff · local review</span>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {copy.detail ? <code>{copy.detail}</code> : null}
      <div className="load-state-actions">
        <button type="button" className="primary-action" onClick={onRetry}>Try again</button>
        <span>Generate data with <code>agent-diffs render</code></span>
      </div>
    </main>
  );
}

export default function App() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; bundle: ReviewBundle } | { status: "error"; error: unknown }>({ status: "loading" });
  const query = new URLSearchParams(window.location.search);
  const demo = query.get("demo") === "1";
  const fixture = query.get("fixture");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadReviewBundle({ demo, fixture }).then((bundle) => {
      if (!cancelled) setState({ status: "ready", bundle });
    }).catch((error) => {
      if (!cancelled) setState({ status: "error", error });
    });
    return () => { cancelled = true; };
  }, [attempt, demo, fixture]);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ErrorScreen error={state.error} onRetry={() => setAttempt((value) => value + 1)} />;
  return <ReviewWorkspace bundle={state.bundle} />;
}
