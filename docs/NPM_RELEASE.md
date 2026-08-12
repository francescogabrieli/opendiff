# Publishing OpenDiff to npm

OpenDiff is published as the public scoped package `@francescogabrieli/opendiff`. npm publication is performed by `.github/workflows/release.yml` through Trusted Publishing; maintainers must not store a long-lived npm publish token in the repository.

## One-time Trusted Publisher setup

Configure the package on npm with this exact GitHub identity:

- package: `@francescogabrieli/opendiff`;
- organization or user: `francescogabrieli`;
- repository: `opendiff`;
- workflow filename: `release.yml`;
- allowed action: `npm publish`;
- environment: none.

The equivalent npm CLI command with npm 11.15 or newer is:

```bash
npm trust github @francescogabrieli/opendiff \
  --repo francescogabrieli/opendiff \
  --file release.yml \
  --allow-publish
```

After the first successful OIDC publication, restrict or revoke traditional automation tokens in the package settings. Keep account-level two-factor authentication and recovery material outside the repository.

## Prepare a release

1. Confirm the intended commit is on `main`, CI is green, and the working tree is clean.
2. Update `CHANGELOG.md`, `package.json`, and `package-lock.json` to the same semantic version.
3. Run the commands in [RELEASING.md](RELEASING.md).
4. Create and push an annotated tag matching the exact package version:

   ```bash
   git tag -a vX.Y.Z -m "OpenDiff vX.Y.Z"
   git push origin vX.Y.Z
   ```

The tag workflow checks that the tagged commit belongs to `main`, that the tag matches `package.json`, validates the changelog, runs tests and browser checks, builds and smoke-tests the tarball, publishes it with OIDC provenance, and creates the GitHub release from the same tarball.

## Verify publication

```bash
npm view @francescogabrieli/opendiff version
npm view @francescogabrieli/opendiff@X.Y.Z dist.attestations
npx --yes @francescogabrieli/opendiff@X.Y.Z --help
npx --yes @francescogabrieli/opendiff@X.Y.Z doctor
```

Then install the skill and generate a review in a disposable Git repository. Confirm that Git reports only the intentional fixture change and that neither `public/data/` nor `.opendiff/` appears in `git status --short`.

## Recovery

A package name and version cannot be reused after publication. If verification finds a severe regression, deprecate the affected version with a clear message and publish a patch. Prefer deprecation over unpublish except for an immediate security or accidental-disclosure incident.
