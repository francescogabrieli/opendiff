# Architecture

This document describes OpenDiff's current system boundaries and the constraints contributors should preserve.

## Design goals

OpenDiff is:

- **local-first**: repository content stays on the developer's machine;
- **deterministic**: the renderer presents supplied facts and never calls a model;
- **working-tree native**: reviews can include staged, unstaged, and untracked changes;
- **agent-authored**: the implementing agent owns the narrative and reading order;
- **schema-driven**: producers and consumers share a versioned document contract;
- **degradable**: unresolved references are visible warnings, not hidden failures.

## Runtime flow

```text
target repository                         installed OpenDiff package
┌──────────────────────────────┐          ┌────────────────────────────┐
│ .git/                        │          │ cli/                       │
│ .opendiff/review.json        │─────────▶│ validation + Git adapter   │
│ .opendiff/config.json        │          │ local HTTP server          │
│ .opendiff/render/*.json      │          │                            │
└──────────────────────────────┘          ├────────────────────────────┤
                                          │ dist/                      │
                                          │ bundled React renderer     │
                                          └──────────────┬─────────────┘
                                                         │ 127.0.0.1
                                                         ▼
                                                   local browser
```

The CLI resolves the target repository from `process.cwd()`. It resolves the renderer, schema, and skill from the installed package directory. Keeping those roots separate is required for global installs and `npx` usage.

## Components

### Git adapter — `cli/git.mjs`

Collects tracked and untracked changes, detects file status and metadata, applies configured ignore/generated patterns, calculates statistics, and creates a stable fingerprint. Git commands are invoked with argument arrays rather than a shell.

### Diff parser — `cli/diff.mjs`

Transforms unified Git output into file and line records while retaining old and new line numbers. It handles additions, modifications, deletions, renames, and binary markers.

### Review contract — `cli/schema.mjs` and `schemas/review.schema.json`

The Zod schema is the runtime validator. The JSON Schema is the public editor/tooling contract. `src/types.ts`, examples, the agent skill, and tests mirror the same version. A breaking semantic or structural change requires a new schema version.

### CLI orchestration — `cli/index.mjs`

Owns initialization, skill installation, validation, materialization, export, browser launch, and process-level error reporting. Transient materialization stays under `.opendiff/`; the CLI must not write generated data into application directories, or stage, commit, reset, or rewrite source files in the target repository.

### Local data server — `cli/server.mjs`

Serves the bundled static renderer and three dynamic endpoints:

- `/__opendiff/data/review` returns the agent-authored review;
- `/__opendiff/data/diff` returns the current parsed Git diff;
- `/__opendiff/status` compares the rendered and current fingerprints.

The HTTP server binds to loopback only. Static file resolution must stay within the bundled `dist/` directory.

### Browser renderer — `src/`

Loads review and diff data, resolves references, normalizes incomplete fixture data, restores local UI state, and renders the guided reading experience. Demo and fixture data are available only through explicit query parameters; production paths never silently substitute examples.

## Data ownership

| Data | Authoritative owner |
| --- | --- |
| Source changes and line contents | Git working tree |
| Narrative, intent, risks, and test claims | Implementing agent via `review.json` |
| File counts, additions, deletions, fingerprint | CLI Git adapter |
| Reference resolution and warnings | CLI/browser validation |
| Expanded files, visited sections, display preferences | Browser local storage |

The renderer may enrich or normalize data for display, but must not overwrite the agent's source document automatically.

## Generated data

`.opendiff/`, `dist/`, Playwright reports, and test results are generated and ignored. `.opendiff/.gitignore` keeps the complete local review directory out of Git without changing the repository's root `.gitignore`. `render` materializes local data only under `.opendiff/render/`; `export` copies the bundled production renderer and current review data into an explicit standalone output folder.

## Extension rules

When adding functionality:

1. keep Git access and filesystem writes in the CLI layer;
2. keep presentation state in the browser layer;
3. add schema fields rather than embedding opaque prose conventions;
4. preserve older schema versions or explicitly migrate them;
5. design integrations as adapters around the core review contract;
6. avoid mandatory accounts, remote services, or platform-specific assumptions;
7. cover parsing and orchestration with Node tests and user-visible flows with Playwright.

## Trust boundaries

Repository paths, Git output, `review.json`, and exported review content are untrusted inputs. Path resolution must remain repository- or renderer-scoped, browser output must remain escaped by React, and commands must not be constructed through a shell. See [SECURITY.md](../SECURITY.md) for reporting.
