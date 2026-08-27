# Changelog

All notable changes to OpenDiff are documented here. The project follows [Semantic Versioning](https://semver.org/) for package releases and versions the review document contract separately through `schemaVersion`.

## [Unreleased]

## [0.3.1] - 2026-08-27

### Added

- Add a trust layer that checks the review's claims against the real diff, independently of the agent's own self-report: a changed file mentioned in no section, and a `verified` acceptance criterion whose evidence no longer resolves against the current diff, are surfaced with a dedicated summary banner and a distinct "unsupported" badge — separate from the agent's own "unverified" — in both the Design and Evidence views, and as `opendiff validate` warnings.

## [0.3.0] - 2026-08-25

### Added

- Add Level 0: `opendiff` now works in any Git repository with no installed skill, no coding agent, and no `.opendiff/review.json`, showing the real working-tree change on its own. Design and Evidence appear as an upgrade once an agent records them.
- Add `opendiff share`, which writes the whole review into a single self-contained HTML file with every script, style, and syntax grammar inlined, so a shared review opens with no server and no network.
- Add `--gist` to `opendiff share`, which uploads the shared file through the GitHub CLI after an explicit confirmation, because it publishes the source code in the diff.
- Add `npm run release:preflight`, which reproduces the publish workflow's guards locally so a release cannot fail after the tag has been pushed.

### Changed

- Rename the package from `@francescogabrieli/opendiff` to `@opendiff/cli`. The `opendiff` binary is unchanged.
- Running `opendiff` with no command now opens the current change instead of printing help.
- The publish workflow now explains why it refuses a release instead of exiting silently, and smoke-tests the packed tarball in a bare repository before publishing.

### Fixed

- Fix the shared review embedding the previously shared file into its own diff, which doubled the output on every run.
- Fix `$&` and ``$` `` sequences in an embedded payload being expanded by `String.replace`, which spliced the surrounding bundle into the page.
- Fix the renderer refusing to display a review that legitimately has no logical sections.

## [0.2.1] - 2026-08-17

- Improve diff rendering and review interactions.
- Optimize diff collection and stale-state detection.

## [0.2.0] - 2026-08-14

### Added

- Add the backward-compatible review schema `2.0` with explicit problems, outcomes, decisions, alternatives, invariants, acceptance criteria, evidence, and design deviations.
- Add separate Design, Evidence, and Diff views so the mental model, supporting proof, and full implementation remain connected without competing in one document.
- Add `DESIGN.md` as the durable statement of OpenDiff's idea-first product model.

### Changed

- Update the bundled agent workflow to capture the design before implementation and connect executed checks to supported claims.
- Remove the unreachable legacy renderer, its browser-state helper, and its unused virtualization dependency.
- Refocus the package README entirely on installation, usage, troubleshooting, privacy, and support; move release operations to maintainer documentation.

## [0.1.7] - 2026-08-12

### Fixed

- Keep all transient review material under `.opendiff/` so `render` never creates `public/data/` inside the repository being reviewed.
- Make `.opendiff/` self-ignoring without editing the repository's root `.gitignore`, and cover the clean-working-tree invariant with regression tests.
- Use the Windows null device when deriving diffs for untracked files and normalize filesystem URLs in cross-platform tests.
- Replace stale unscoped npm links, badges, commands, and release instructions with the canonical `@francescogabrieli/opendiff` package.

### Changed

- Validate the CLI on Ubuntu, macOS, and Windows in CI.
- Publish version tags through npm Trusted Publishing with OIDC provenance before creating the matching GitHub release.

## [0.1.6] - 2026-08-10

### Changed

- Publish OpenDiff under the npm scope `@francescogabrieli/opendiff` because npm rejects the unscoped `opendiff` name as too similar to an existing package.
- Use a conventional `bin/opendiff.js` executable wrapper so npm preserves the `opendiff` command during publish normalization.
- The canonical installer is now `npx --yes @francescogabrieli/opendiff@latest install`.

## [0.1.5] - 2026-08-10

### Fixed

- Prevent local guided-review data from ever being copied into the production renderer or included in the npm package. Vite no longer copies the local `public/` directory, and npm now packages only `dist/index.html` and `dist/assets/` from the renderer build.
- Added a release-time package isolation check using synthetic local review data so future packages fail validation if `public/data` or `dist/data` leaks into the tarball.

## [0.1.4] - 2026-08-10

### Changed

- Renamed the product to OpenDiff across the repository, npm package, CLI, skill, generated review directory, documentation, schemas, tests, and release metadata.
- The canonical public install command is now `npx --yes opendiff@latest install`, the agent skill is `@opendiff`, and generated review state lives under `.opendiff/`.

## [0.1.3] - 2026-08-08

### Changed

- Guided review narrative now follows the natural language of the user's original task unless another language is explicitly requested.
- The bundled `@opendiff` skill now writes onboarding-style code explanations for readers who are new to the repository, covering surrounding responsibility, data or control flow, implementation reasoning, integration, invariants, trade-offs, and diff references as evidence instead of reducing sections to changelog-style summaries.

## [0.1.2] - 2026-08-08

### Security

- Updated the indirect development dependency `nanoid` to a non-vulnerable version, clearing the npm audit advisory before the public repository launch.

## [0.1.1] - 2026-08-08

### Added

- Added a repository-level default `.opendiff/config.json` aligned with the runtime configuration path.

### Changed

- Expanded the README with clearer installation, usage, release, and development guidance.
- Cleaned up the GitHub release workflow so an existing version is not recreated on later pushes.
- Normalized npm package repository metadata to the canonical lowercase GitHub URL.

## [0.1.0] - 2026-08-05

### Added

- Production-ready local HTTP serving from the bundled renderer.
- Contributor, architecture, review-format, support, security, conduct, and release documentation.
- GitHub issue and pull request templates, continuous integration, and dependency updates.
- Package metadata and tarball validation for the first public npm release.
- On-demand syntax grammar loading to keep the production renderer compact.
- A one-command installer for the bundled `@opendiff` skill in Codex and Claude Code.
- The complete local guided-review workflow: baseline capture, agent-authored narrative, schema validation, Git diff collection, rendering, and browser opening.

### Changed

- Standardized the product, package, CLI, skill, generated review directory, documentation, schemas, examples, and tests on the OpenDiff naming.
- Review risks and verification results now have validated structures across the runtime and public JSON schemas.
- The bundled agent skill now captures baseline ownership, validation repair, and explicit handoff requirements.

Initial pre-release implementation of the local guided-review renderer, Git diff collection, schema validation, agent skill, fixtures, and browser experience.
