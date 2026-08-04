# Changelog

All notable changes to OpenDiffs are documented here. The project follows [Semantic Versioning](https://semver.org/) for package releases and versions the review document contract separately through `schemaVersion`.

## [Unreleased]

### Added

- Production-ready local HTTP serving from the bundled renderer.
- Contributor, architecture, review-format, support, security, conduct, and release documentation.
- GitHub issue and pull request templates, continuous integration, and dependency updates.
- Package metadata and tarball validation for future npm releases.
- On-demand syntax grammar loading to keep the production renderer compact.

### Changed

- Review risks and verification results now have validated structures across the runtime and public JSON schemas.
- The bundled agent skill now captures baseline ownership, validation repair, and explicit handoff requirements.

## [0.1.0] - 2026-08-05

Initial pre-release implementation of the local guided-review renderer, Git diff collection, schema validation, agent skill, fixtures, and browser experience.
