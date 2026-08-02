# Review format

OpenDiff schema `1.0` separates agent-authored context from Git-derived code. The canonical machine-readable contract is [`schemas/review.schema.json`](../schemas/review.schema.json); the CLI validates the same structure with Zod.

## File location

Place the document at `.agent-diffs/review.json` in the repository being reviewed. It must be strict JSON: comments, trailing commas, and Markdown code fences are invalid.

## Top-level fields

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Contract version; currently exactly `1.0`. |
| `project` | Display name and repository-relative root. |
| `review` | Review identity, task, summary, title, and generation time. |
| `git` | Base/target metadata and included working-tree states. |
| `stats` | Agent-estimated summary, recalculated by the renderer. |
| `sections` | Ordered reading path grouped by implementation intent. |
| `tests` | Checks executed and checks intentionally not executed. |
| `risks` | Evidence-backed limitations or failure modes. |
| `assumptions` | Explicit facts the agent could not independently verify. |
| `completion` | Honest implementation status and remaining work. |

## Sections and references

Every section requires at least one explanation, impact, and reference. Section order is the intended review order; it need not follow the filesystem.

A reference uses repository-relative POSIX paths and inclusive line ranges:

```json
{
  "id": "ref-timeout-parser",
  "file": "src/config.ts",
  "symbol": "requestTimeoutFromEnv",
  "kind": "primary",
  "newLines": { "start": 3, "end": 9 },
  "oldLines": null,
  "description": "Accepts a positive timeout override and otherwise returns the default."
}
```

`kind` is `primary`, `secondary`, or `test`. Use small ranges that intersect the actual diff. Create separate references for separate hunks. IDs must be unique across the document.

For pure additions, set `oldLines` to `null`. For modified lines, include the corresponding old-side range. Deleted-only and binary changes have limited new-side line information; follow the rules in the bundled [agent skill](../skills/agent-diffs/SKILL.md) and disclose unresolved warnings.

## Verification records

Record commands exactly as executed:

```json
{
  "executed": [
    {
      "command": "npm test -- tests/config.test.ts",
      "status": "passed",
      "summary": "2 tests passed.",
      "durationMs": 418
    }
  ],
  "notExecuted": [
    {
      "name": "End-to-end tests",
      "reason": "The change has no browser-visible behavior."
    }
  ]
}
```

Allowed statuses are `passed`, `failed`, and `skipped`. Never represent an unexecuted command as passed.

## Risks and completion

Risks are structured so the renderer can prioritize them:

```json
{
  "severity": "low",
  "title": "Configuration changes require restart",
  "description": "The value is read at module import time.",
  "relatedReferences": ["ref-timeout-parser"]
}
```

Allowed severities are `low`, `medium`, and `high`. Use an empty array when no evidence-backed risk remains.

Completion status is `complete`, `partial`, or `blocked`. Put concrete follow-up work in `remainingWork`; do not hide incomplete scope in notes.

## Validation

From the target repository root:

```bash
agent-diffs validate --base HEAD --context 6
```

Schema violations and duplicate IDs block rendering. Missing files and unresolved line ranges remain visible warnings so the rest of the review can still be inspected, but producers should repair them whenever the final diff is available.

A complete portable example is available at [`examples/small-review/review.json`](../examples/small-review/review.json).
