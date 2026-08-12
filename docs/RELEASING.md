# Releasing

This checklist prepares a public OpenDiff release for the tag-driven npm and GitHub workflow.

## Before tagging

1. Confirm `main` is green and the working tree is clean.
2. Update `CHANGELOG.md`, `package.json`, and `package-lock.json` to the same semantic version.
3. Confirm npm Trusted Publishing targets `francescogabrieli/opendiff` and `release.yml` as documented in [NPM_RELEASE.md](NPM_RELEASE.md).
4. Run:

   ```bash
   npm ci
   npm audit --omit=dev
   npm test
   npm run build
   npm run test:e2e
   npm run package:check
   ```

5. Inspect the tarball listing. It must include `cli/`, `dist/`, `schemas/`, `skills/`, documentation media, `README.md`, and `LICENSE`; it must exclude `.opendiff/`, `public/data/`, test artifacts, and repository source files not listed in `package.json#files`.
6. Smoke-test the exact tarball with `opendiff --help`, an isolated skill installation, and `render` in a temporary Git repository.
7. Confirm the smoke repository contains only the intentional source change after rendering.

## Publish

Create and push an annotated `vX.Y.Z` tag. Do not run `npm publish` locally.

```bash
git tag -a vX.Y.Z -m "OpenDiff vX.Y.Z"
git push origin vX.Y.Z
```

The release workflow requires the tagged commit to belong to `main`, validates the release, publishes with OIDC provenance, and creates the GitHub release. It is safe to rerun after npm publication only when the registry version's `gitHead` matches the tagged commit.

## After publication

1. Confirm the npm version and provenance attestation.
2. Run `--help`, `doctor`, skill installation, and one complete review from the registry package.
3. Confirm the GitHub release contains the tarball built by the same workflow.
4. Start the five-user protocol in [BETA_TESTING.md](BETA_TESTING.md) before broad promotion.

If a severe regression is discovered, deprecate the affected version and ship a patch. Do not reuse, rewrite, or silently replace a published version.
