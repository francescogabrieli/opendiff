# OpenDiffs

[![CI](https://github.com/francescogabrieli/OpenDiffs/actions/workflows/ci.yml/badge.svg)](https://github.com/francescogabrieli/OpenDiffs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js 20.19+](https://img.shields.io/badge/node-%3E%3D20.19-339933.svg)](package.json)
[![npm](https://img.shields.io/npm/v/opendiffs.svg)](https://www.npmjs.com/package/opendiffs)

OpenDiffs turns a coding agent's working-tree changes into a local, guided code review. The same agent that implements the work explains it; OpenDiffs validates those explanations against the real Git diff and presents the review by intent instead of filename.

![OpenDiffs guided review](docs/opendiffs-demo.gif)

OpenDiffs is **local-first** and **deterministic**. It does not upload source code, call an additional model, create a pull request, or modify the repository being reviewed. Everything runs on your machine, against your own Git history.

## Why OpenDiffs?

Agent-generated changes are often easier to produce than to understand. A raw diff tells you what changed, but not the intended reading order, why several files belong together, which checks ran, or where uncertainty remains.

OpenDiffs adds that missing presentation layer:

- a **guided path** organized by implementation intent, not filename order;
- **explanations anchored** to exact files and lines, validated against the real diff;
- the **real staged, unstaged, and untracked** changes, with Git-computed statistics;
- executed and skipped **checks**, risks, assumptions, and completion state;
- **stale-review detection** when the working tree changes afterward;
- a polished local UI **bundled with the npm package**.

## Requirements

- **Node.js 20.19 or newer**
- **Git**
- **Codex and/or Claude Code** (the agents that invoke the skill)

No accounts, no remote services, no API keys.

## Getting started

OpenDiffs is installed once from npm as a package plus an agent skill. No repository clone or manual file copy is required.

### 1. Install the agent skill

```bash
npx --yes opendiffs@latest install
```

The installer detects Codex and Claude Code and writes the bundled skill to the appropriate local skill directories:

```text
~/.codex/skills/opendiffs/SKILL.md
~/.claude/skills/opendiffs/SKILL.md
```

When both agents are present, both are configured. To choose explicitly:

```bash
npx --yes opendiffs@latest install --agent codex
npx --yes opendiffs@latest install --agent claude
npx --yes opendiffs@latest install --agent all
```

### 2. Invoke the skill

Restart an agent that was already open, then invoke the skill from chat:

```text
@opendiffs implementa questa modifica e mostrami la guided review
```

The coding agent implements the task, records the final narrative and references, validates them against the actual Git diff, starts the bundled local renderer, and opens the complete OpenDiffs interface in your browser.

### 3. Read the review

The browser opens on `http://localhost:4173` with a Linear-style guided review: a table of contents organized by intent, sections with anchored code references, per-file diffs, verification results, risks, and completion state.

### Maintenance

```bash
npx --yes opendiffs@latest doctor
npx --yes opendiffs@latest install --force
npx --yes opendiffs@latest uninstall
```

`doctor` checks Node, Git, the bundled renderer, and the agent installation paths.

## How it works

```text
user invokes @opendiffs
   │
   ▼
coding agent captures the Git baseline
   │
   ├── implements and verifies the requested change
   ├── reads the complete final diff
   └── writes .opendiffs/review.json
   │
   ▼
npx opendiffs review
   │
   ├── validates the authored references
   ├── derives the real staged, unstaged, and untracked Git diff
   ├── starts the bundled local renderer
   └── opens the guided review in the browser
```

The user does not need to run `init`, `validate`, `render`, or `open`. Those lower-level commands remain available for maintainers and debugging, while the installed skill owns the normal end-to-end workflow.

## Runtime commands

The skill normally invokes these automatically. They are documented for development and troubleshooting.

| Command | Purpose |
| --- | --- |
| `opendiffs install` | Install the `@opendiffs` skill for Codex and/or Claude Code. |
| `opendiffs uninstall` | Remove the installed skill. |
| `opendiffs doctor` | Check Node, Git, the bundled renderer, and agent installation paths. |
| `opendiffs validate` | Validate the review schema, Git base, IDs, files, and line references. |
| `opendiffs render` | Materialize the review against the current working tree. |
| `opendiffs open` | Start the bundled local renderer. |
| `opendiffs review` | Validate, render, and open in one command. |
| `opendiffs export --output PATH` | Create a portable static review folder. |

Common runtime options are `--base REF`, `--context N`, `--port PORT`, `--no-open`, and `--force`.

## The npm package contains the full app

The npm package is a distribution of this repository, not a reduced installer. It includes:

```text
cli/       installer and local runtime
skills/    the agent-authored review workflow
dist/      the built HTML, JavaScript, CSS, and UI assets
schemas/   the machine-readable review schema
docs/      format and architecture documentation
```

The `prepack` script runs tests and creates the production renderer before npm assembles the package. The interface opened by `npx opendiffs review` is therefore built from the same frontend source as the repository.

## Review format

The agent-owned `.opendiffs/review.json` contains metadata, ordered sections, explanations, impacts, precise code references, verification results, risks, assumptions, and completion state. OpenDiffs separately derives the diff contents and statistics from Git.

```json
{
  "id": "ref-refresh-coordinator",
  "file": "src/auth/refreshCoordinator.ts",
  "symbol": "createRefreshCoordinator",
  "kind": "primary",
  "newLines": { "start": 12, "end": 58 },
  "oldLines": null,
  "description": "Owns the shared refresh operation."
}
```

See the [review format guide](docs/REVIEW_FORMAT.md), the machine-readable [JSON Schema](schemas/review.schema.json), and the bundled [OpenDiffs skill](skills/opendiffs/SKILL.md).

## Publishing to npm

OpenDiffs is published to the npm registry as the `opendiffs` package. Releases follow [Semantic Versioning](https://semver.org/); the review document contract is versioned separately through `schemaVersion`.

### Before you publish

1. Confirm `main` is green and the working tree is clean.
2. Update [CHANGELOG.md](CHANGELOG.md) and the version in `package.json` (and `package-lock.json`).
3. Run the full validation suite:

```bash
npm ci
npm run check
npm run test:e2e
npm run package:check
```

### Publish

Authenticate once, then publish:

```bash
npm login
npm whoami
npm publish
```

For a new release, bump the version and publish in one step:

```bash
npm version patch   # or minor / major
npm publish
```

### Verify the release

```bash
npm view opendiffs version
npx --yes opendiffs@latest doctor
npx --yes opendiffs@latest install
```

Then invoke `@opendiffs` from a coding agent in a fresh repository to confirm the end-to-end flow.

### Notes

- `npm publish` runs the `prepack` script (tests + production build) automatically before assembling the tarball.
- The package is published with `"access": "public"`; no scoped name or special flag is needed.
- Future releases can use [npm Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements) from GitHub Actions without storing a long-lived npm token.

See [docs/RELEASING.md](docs/RELEASING.md) and [docs/NPM_RELEASE.md](docs/NPM_RELEASE.md) for the full release checklist and first-publish procedure.

## Development

Requirements:

- Node.js 20.19 or newer;
- npm;
- Git;
- Chrome or Chromium for end-to-end tests.

```bash
git clone https://github.com/francescogabrieli/OpenDiffs.git
cd OpenDiffs
npm ci
npm run dev
npm test
npm run build
npm run test:e2e
```

Use `npm run check` for the fast CI-equivalent checks. Browser fixtures are documented in [examples/README.md](examples/README.md).

## Project status

OpenDiffs is pre-1.0. The review schema is versioned independently and currently at `1.0`; CLI and UI behavior may evolve between minor releases. Compatibility-impacting changes must be documented in [CHANGELOG.md](CHANGELOG.md).

## Security and privacy

The server binds to `127.0.0.1`, generated review artifacts are Git-ignored, and no telemetry or remote source-code transport is included. Review narratives can still contain sensitive repository context, so inspect exported folders before sharing them.

Report vulnerabilities privately using [SECURITY.md](SECURITY.md). For usage questions, see [SUPPORT.md](SUPPORT.md).

## Contributing

Bug reports, focused feature proposals, documentation improvements, fixtures, and code changes are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

OpenDiffs is released under the MIT License.

OpenDiffs is an independent project and is not affiliated with or endorsed by Linear. Linear is used only as a product-experience reference; no proprietary source code or assets are included.
