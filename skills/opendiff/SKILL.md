---
name: opendiff
description: Implement a code change and present the final working-tree diff as a local, Linear-style guided review. Use when the user invokes OpenDiff, tags @opendiff, asks for a guided review, or wants the change explained by intent instead of filename order.
---

# OpenDiff

Implement the user's request, then produce and open a factual guided review of the exact final change.

OpenDiff is a deterministic local renderer. You, the same coding agent that implements the change, must author the explanation. Never delegate the narrative to a second model or agent.

## Non-negotiable rules

1. Preserve existing user work. Do not reset, stage, commit, delete, or rewrite unrelated changes.
2. Capture the Git baseline before editing whenever possible.
3. Ground every statement in code you read, the final Git diff, or checks you actually ran.
4. Read the complete final change again after the last edit.
5. Do not place source code or the full diff inside `review.json`; store narrative, metadata, checks, risks, assumptions, and precise references only.
6. Do not ask the user to run `init`, `render`, `validate`, or `open`. The skill owns the complete review flow.
7. Write the review narrative in the same natural language as the user's original task unless the user explicitly asks for another language. Apply this to review titles and summaries, section prose, reference descriptions, risks, notes, test summaries, assumptions, completion text, and remaining work. Keep code, identifiers, file paths, symbols, and shell commands unchanged.
8. Explain the implementation for a technically competent reader who is new to the repository. Do not reduce the review to a changelog that merely restates what was added, removed, or renamed.

## 1. Capture the baseline

From the target repository root, run:

```bash
git rev-parse --show-toplevel
git rev-parse HEAD
git branch --show-current
git status --short
```

Record:

- the full starting commit as `git.baseCommit`;
- `HEAD` as the normal `git.baseRef`;
- `WORKTREE` as `git.targetRef`;
- the current branch;
- whether the working tree was initially clean;
- every path already changed before your work.

When invoked after editing has already started, do not invent a clean baseline. Record the best-known state and explain the uncertainty under `assumptions`.

## 2. Implement and verify

Implement the request using the repository's conventions.

Run the narrowest relevant checks first, then broader typecheck, lint, build, or end-to-end checks when warranted. Record every attempted check with its exact command, status, and factual summary. Never report an unrun check as passing.

## 3. Inspect the complete final change

Read tracked and untracked changes:

```bash
git diff --find-renames HEAD --
git ls-files --others --exclude-standard
git status --short
```

Read relevant untracked file contents because ordinary `git diff` does not include them.

Organize the review by implementation intent, not alphabetically. Prefer two to six coherent sections:

1. primary mechanism;
2. integration and consequences;
3. user-visible behavior;
4. verification, migration, generated, or lower-signal supporting work.

A file may appear in more than one section when separate hunks serve different purposes.

### Narrative requirements

Treat the guided review as an onboarding explanation of the change, not as a release note.

Assume the reader knows how to program but has not worked in this repository before. Give them enough context to understand the changed code without already knowing the local architecture.

For each meaningful section, explain the parts that are supported by the code and relevant to the change:

- what responsibility this area of the system has and, when useful, how it behaved before the change;
- the data flow or control flow through the changed code, including where important values come from and where they go;
- why the implementation is shaped this way instead of merely naming the APIs or lines that changed;
- how the change integrates with surrounding modules, state, rendering, persistence, validation, or other relevant boundaries;
- important invariants, assumptions, edge cases, or trade-offs a maintainer should know;
- how the cited diff hunks provide evidence for the explanation.

Start from the mental model and then connect it to concrete code. A sentence such as "Added X to implement Y" is not sufficient by itself. Explain the mechanism and the reason the code fits the surrounding system.

Do not invent design intent. When the reason for a choice is not evidenced by the implementation or repository context, describe what the code guarantees and mark any uncertainty explicitly.

Use the review fields deliberately:

- `purpose` explains the design problem or responsibility addressed by the section, not a paraphrase of the diff;
- `explanation` contains substantive prose that teaches how the implementation works and why it is structured that way;
- `impact` records observable consequences, architectural effects, invariants, or maintenance implications;
- `references` are evidence for the narrative, not a substitute for it.

## 4. Write `.opendiff/review.json`

Create `.opendiff/` when necessary and write strict JSON matching schema version `1.0`:

```json
{
  "schemaVersion": "1.0",
  "project": { "name": "project-name", "root": "." },
  "review": {
    "id": "stable-review-id",
    "title": "Concise implementation title",
    "summary": "What changed, why, and the observable result.",
    "originalTask": "The user's request",
    "generatedAt": "ISO-8601 timestamp"
  },
  "git": {
    "baseRef": "HEAD",
    "baseCommit": "full-starting-commit-sha",
    "targetRef": "WORKTREE",
    "branch": "branch-name",
    "includeStaged": true,
    "includeUnstaged": true,
    "includeUntracked": true,
    "initialWorkingTree": {
      "clean": true,
      "preExistingChanges": []
    }
  },
  "stats": {
    "filesChanged": 1,
    "filesAdded": 0,
    "filesModified": 1,
    "filesDeleted": 0,
    "additions": 1,
    "deletions": 0,
    "sections": 1,
    "testsChanged": 0
  },
  "sections": [
    {
      "id": "primary-change",
      "order": 1,
      "title": "Introduce the primary change",
      "shortDescription": "A concrete description under 120 characters.",
      "purpose": "Why this part of the implementation exists.",
      "explanation": [
        "How it works and how it relates to the surrounding system."
      ],
      "impact": [
        "The observable or architectural consequence."
      ],
      "references": [
        {
          "id": "ref-primary-change",
          "file": "src/example.ts",
          "symbol": "example",
          "kind": "primary",
          "newLines": { "start": 1, "end": 1 },
          "oldLines": null,
          "description": "The exact responsibility of this hunk."
        }
      ],
      "relatedTests": [],
      "risks": [],
      "notes": []
    }
  ],
  "tests": {
    "executed": [
      {
        "command": "npm test",
        "status": "passed",
        "summary": "The relevant tests passed."
      }
    ],
    "notExecuted": []
  },
  "risks": [],
  "assumptions": [],
  "completion": {
    "status": "complete",
    "summary": "The requested behavior is implemented.",
    "remainingWork": []
  }
}
```

Replace every placeholder with real data and write all narrative placeholders in the original task's language.

### Reference requirements

- Use unique stable lowercase IDs.
- Use repository-relative POSIX paths.
- Use inclusive final-file line ranges that actually occur in the rendered diff.
- Keep ranges narrow; use separate references for separate hunks.
- Use `kind: "primary"` for the core mechanism, `"secondary"` for supporting integration, and `"test"` for verification code.
- Give every section at least one reference, one explanation paragraph, and one impact item.
- Use risk objects with `severity`, `title`, `description`, and optional `relatedReferences`.
- Put unfinished work in `completion.remainingWork`, not in assumptions.

## 5. Validate and open the review

Run the full flow from the target repository root:

```bash
npx --yes @francescogabrieli/opendiff@latest review --base HEAD --context 6
```

This command validates the document, derives the real Git diff, builds the review data, starts the local renderer, and opens the browser.

If the environment cannot open a browser, run:

```bash
npx --yes @francescogabrieli/opendiff@latest review --base HEAD --context 6 --no-open
```

Repair schema failures, duplicate IDs, unavailable Git bases, missing files, and resolvable line-reference warnings. Never silence a warning by inventing a line range.

If the working tree changes after validation, update the narrative or references and rerun the command.

## Final response

Report:

- the local review URL;
- review title and section count;
- checks executed and skipped;
- completion status;
- remaining validation warnings.

Do not claim the browser opened when `--no-open` was used.
