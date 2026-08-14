# Review format

OpenDiff schema `2.0` separates the agent-authored design and evidence from Git-derived code. The reader and validator remain compatible with schema `1.0` reviews. The canonical machine-readable contract is [`schemas/review.schema.json`](../schemas/review.schema.json); the CLI validates the same structure with Zod.

## File location

Place the document at `.opendiff/review.json` in the repository being reviewed. It must be strict JSON: comments, trailing commas, and Markdown code fences are invalid.

## Top-level fields

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Contract version; `2.0` is current and `1.0` remains supported. |
| `project` | Display name and repository-relative root. |
| `review` | Review identity, task, summary, title, and generation time. |
| `git` | Base/target metadata and included working-tree states. |
| `stats` | Agent-estimated summary, recalculated by the renderer. |
| `design` | Problem, outcome, decisions, invariants, acceptance criteria, evidence, and deviations. Required in `2.0`. |
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

## Design and evidence

Schema `2.0` makes the review's mental model explicit before its implementation narrative:

- `problem` and `desiredOutcome` define the before/after boundary;
- `decisions` record the chosen model, rationale, alternatives, and whether the decision was revised;
- `invariants` state properties that must or should remain true;
- `acceptanceCriteria` are falsifiable claims with `verified` or `unverified` status;
- `evidence` links a criterion to code, tests, benchmarks, manual observations, or design material;
- `deviations` disclose where the final implementation differs from the initial model.

A `verified` criterion requires at least one evidence record. Executed tests can use `supports` to reference invariant and criterion IDs. Unknown IDs and evidence-free verified criteria fail runtime validation.

For pure additions, set `oldLines` to `null`. For modified lines, include the corresponding old-side range. Deleted-only and binary changes have limited new-side line information; follow the rules in the bundled [agent skill](../skills/opendiff/SKILL.md) and disclose unresolved warnings.

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
opendiff validate --base HEAD --context 6
```

Schema violations and duplicate IDs block rendering. Missing files and unresolved line ranges remain visible warnings so the rest of the review can still be inspected, but producers should repair them whenever the final diff is available.

A complete portable example is available at [`examples/small-review/review.json`](../examples/small-review/review.json).
