---
name: agent-diffs
description: Guide the current coding agent through capturing a Git baseline, implementing and verifying a change, authoring `.agent-diffs/review.json`, validating its references, and opening a local OpenDiff guided review. Use when the user invokes OpenDiff or agent-diffs, requests a Linear-style guided review for work the agent is about to do or has just completed, asks to present an implementation by intent instead of file order, or wants a local review URL.
---

# OpenDiff

Produce a factual, local guided review of the change you implemented. OpenDiff is a deterministic renderer, not a second reviewer: you author the explanation and OpenDiff reads the real Git diff.

## Guardrails

1. Author the narrative yourself. Never delegate interpretation to another model or agent.
2. If you did not implement the change, only render an existing `review.json`. Do not invent the original agent's reasoning; ask that agent to generate it.
3. Ground every claim in the final diff, code you read, or checks you actually ran. Record uncertainty under `assumptions` and incomplete work under `completion`.
4. Preserve user changes. Never stage, commit, reset, delete, or rewrite files merely to simplify the review.
5. Keep source code and the full diff out of `review.json`. Store only the narrative, metadata, test results, risks, assumptions, and line references.
6. Read the final diff again after the last edit. Do not render a narrative for an earlier version of the working tree.

## Resolve the command

Run all OpenDiff commands from the target repository root.

- Prefer `agent-diffs` when it is available on `PATH`.
- In an OpenDiff checkout, use `npm run agent-diffs --` as the command prefix when the binary is not installed.
- Do not download or install packages without user approval. If neither command form exists, still leave a valid `review.json` when possible and report that opening the renderer is blocked.

Use one command form consistently in the steps below.

## Workflow

### 1. Capture the baseline before editing

Run:

```bash
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --short
```

Record:

- `baseRef`: normally `HEAD`;
- `baseCommit`: the full commit returned by `git rev-parse HEAD`;
- `targetRef`: `WORKTREE`;
- `branch`: the current branch or `detached HEAD`;
- `initialWorkingTree.clean`: whether `git status --short` was empty;
- `initialWorkingTree.preExistingChanges`: every path already changed before your work.

If the skill is invoked after editing has begun, do not reconstruct a clean baseline. Record the current best-known state, add an assumption explaining that ownership of earlier changes cannot be proven, and avoid attributing those changes to yourself.

### 2. Implement and verify

Implement the user's request using the repository's conventions. Run the narrowest relevant tests first, then broader typecheck, lint, build, or E2E checks when warranted.

For every attempted check, retain the exact command, status (`passed`, `failed`, or `skipped`), and a short factual summary. Put checks you could not run in `tests.notExecuted`; never describe an unrun check as passing.

### 3. Read the complete final change

Inspect tracked and untracked changes:

```bash
git diff --find-renames HEAD --
git ls-files --others --exclude-standard
git status --short
```

Read the contents of relevant untracked files because ordinary `git diff` does not show them. Separate pre-existing work from task-related work. Identify the most useful reading path: begin with the primary mechanism, follow its consequences and integrations, then finish with tests, migration, generated, or low-signal supporting changes.

Group by intent, not directory or filename. A file may appear in more than one section when different hunks serve different purposes.

### 4. Write `.agent-diffs/review.json`

Create the parent directory if needed. Emit strict JSON using schema version `1.0` and this shape:

```json
{
  "schemaVersion": "1.0",
  "project": { "name": "project-name", "root": "." },
  "review": {
    "id": "stable-review-id",
    "title": "Concise implementation title",
    "summary": "What changed, why, and the observable result.",
    "originalTask": "The user's request",
    "generatedAt": "2026-08-02T15:00:00+02:00"
  },
  "git": {
    "baseRef": "HEAD",
    "baseCommit": "full-commit-sha",
    "targetRef": "WORKTREE",
    "branch": "branch-name",
    "includeStaged": true,
    "includeUnstaged": true,
    "includeUntracked": true,
    "initialWorkingTree": { "clean": true, "preExistingChanges": [] }
  },
  "stats": { "filesChanged": 1, "additions": 1, "deletions": 0, "sections": 1, "testsChanged": 0 },
  "sections": [
    {
      "id": "primary-change",
      "order": 1,
      "title": "Introduce the primary change",
      "shortDescription": "A specific description under 120 characters.",
      "purpose": "Why this part of the implementation exists.",
      "explanation": ["How it works and how it relates to the surrounding system."],
      "impact": ["The observable or architectural consequence."],
      "references": [
        {
          "id": "ref-primary-change",
          "file": "src/example.ts",
          "symbol": "example",
          "kind": "primary",
          "newLines": { "start": 1, "end": 1 },
          "oldLines": null,
          "description": "The exact responsibility of this referenced hunk."
        }
      ],
      "relatedTests": ["specific behavior covered by a test"],
      "notes": []
    }
  ],
  "tests": {
    "executed": [{ "command": "npm test", "status": "passed", "summary": "All relevant tests passed." }],
    "notExecuted": [{ "name": "End-to-end tests", "reason": "Why they could not be run." }]
  },
  "risks": [],
  "assumptions": [],
  "completion": { "status": "complete", "summary": "The requested behavior is implemented.", "remainingWork": [] }
}
```

Replace every placeholder with real data. Let `render` recalculate diff statistics, but keep the authored values plausible and consistent.

Represent each global or section-level risk as an object, never as a bare string:

```json
{
  "severity": "low",
  "title": "Concise risk title",
  "description": "The concrete failure mode or limitation.",
  "relatedReferences": ["ref-primary-change"]
}
```

Use `severity` values `low`, `medium`, or `high`. Use an empty `risks` array when no evidence-backed risk remains.

#### Reference rules

- Use unique, stable, lowercase IDs for every section and reference.
- Use repository-relative POSIX file paths.
- Use inclusive, positive, final-file line numbers. `newLines` must resolve to lines present in the rendered diff, not merely to the surrounding symbol.
- Keep ranges narrow. If one logical change spans separate hunks, create separate references instead of one range crossing omitted lines.
- Set `oldLines` to `null` for a pure addition; otherwise record the corresponding old-side range when known.
- Give every section at least one reference and at least one non-empty `explanation` and `impact` entry.
- Use `kind: "primary"` for the core mechanism, `"secondary"` for supporting integration, and `"test"` for verification code.
- Keep assumptions as concise strings. Keep remaining work in `completion.remainingWork`, not in assumptions or risks.
- For deleted-only files, use the precise `oldLines`; schema 1.0 still requires `newLines`, so mirror the old range and accept an unresolved warning rather than pretending a new-side line exists.
- For binary files, use a file-level reference with `{ "start": 1, "end": 1 }` and describe the asset change without claiming line-level inspection.

### 5. Validate, repair, and launch

Initialize only when `.agent-diffs/config.json` is absent:

```bash
agent-diffs init
```

Validate:

```bash
agent-diffs validate --base HEAD --context 6
```

Repair schema errors, duplicate IDs, unavailable bases, missing files, and resolvable line-range warnings before continuing. Re-read the actual diff when a reference fails; do not silence the warning by inventing a range. A deleted-only file may retain the documented schema limitation above.

Start the complete flow without forcing a GUI browser:

```bash
agent-diffs review --base HEAD --context 6 --no-open
```

Omit `--no-open` only when the user explicitly wants the browser opened and the environment permits it. If the working tree changes after validation, update the narrative or references as needed and validate again.

## Quality bar

- Explain the problem, chosen approach, relationships between changed parts, and observable impact.
- Prefer 2–6 coherent sections. Use more only when the implementation genuinely has more distinct ideas.
- Lead with behavior and intent; avoid line-by-line narration, generic praise, language trivia, and claims of correctness or security that tests do not establish.
- Mark `completion.status` as `partial` or `blocked` when requested behavior remains incomplete, even if the code compiles.
- Treat validation warnings as information to resolve or explicitly disclose, not as success noise.

## Handoff

Return the local URL, review title, section count, executed and skipped checks, completion status, and any remaining validation warnings. Do not claim the browser opened when `--no-open` was used.
