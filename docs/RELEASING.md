# Releasing

This checklist is for maintainers preparing a public OpenDiffs release.

## Before tagging

1. Confirm `main` is green and the working tree is clean.
2. Update `CHANGELOG.md` and remove the `Unreleased` placeholder for shipped changes.
3. Update the version in `package.json` and `package-lock.json` using semantic versioning.
4. Run:

   ```bash
   npm ci
   npm audit --omit=dev
   npm test
   npm run build
   npm run test:e2e
   npm run package:check
   ```

5. Inspect the tarball listing. It must include `cli/`, `dist/`, `schemas/`, `skills/`, documentation media, `README.md`, and `LICENSE`, and must exclude local review data and test artifacts.
6. Install the packed tarball into a temporary directory and smoke-test `opendiffs --help`, `skill install`, and a small review against a temporary Git repository.

## Publish

Create an annotated `vX.Y.Z` tag and a GitHub release from the changelog entry. Publish through npm trusted publishing with provenance when configured; do not store long-lived npm tokens in the repository.

After publication, install from the registry in a clean environment and repeat the CLI smoke test. If a severe regression is discovered, deprecate the affected version before considering unpublish.
