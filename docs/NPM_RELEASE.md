# Publishing OpenDiff to npm

This document separates repository preparation from the package-owner steps required for the first npm release.

The first npm-published version is `0.1.4`. GitHub `v0.1.0`, `v0.1.1`, `v0.1.2`, and `v0.1.3` were private prepublish validation releases; they remain immutable rather than being rewritten.

## Maintainer preparation

Before asking the npm package owner to publish:

1. merge the UI and npm-distribution pull requests into `main`;
2. ensure `package.json` uses the public package name `opendiff`;
3. run CI, unit tests, typecheck, and the production build;
4. verify `npm pack --dry-run` includes `cli/`, `dist/`, `skills/`, and `schemas/`;
5. test the generated tarball in temporary Codex and Claude Code homes;
6. update the version and changelog.

The first release must not be published until the production UI intended for users is on `main`.

## Package-owner steps

The npm package owner is `francescogabrieli`. Authentication secrets, passwords, one-time codes, recovery codes, and npm tokens must never be committed or shared.

From a clean checkout of the final `main` branch:

```bash
git checkout main
git pull --ff-only
npm ci
npm run check
npm run package:check
```

Create and inspect the exact tarball:

```bash
npm pack
npm exec --yes --package ./opendiff-0.1.4.tgz -- opendiff --help
```

Test installation without touching the real agent configuration by using temporary homes:

```bash
TEST_HOME="$(mktemp -d)"
CODEX_HOME="$TEST_HOME/codex" \
CLAUDE_CONFIG_DIR="$TEST_HOME/claude" \
npx --yes ./opendiff-0.1.4.tgz install --agent all

find "$TEST_HOME" -path '*/skills/opendiff/SKILL.md' -print
rm -rf "$TEST_HOME"
```

Authenticate to npm:

```bash
npm login
npm whoami
```

`npm whoami` must print:

```text
francescogabrieli
```

Confirm the package name is still unclaimed immediately before publishing:

```bash
npm view opendiff version
```

A `404 Not Found` means no published package currently owns that name. Availability is not reserved until the publish succeeds.

Publish version `0.1.4`:

```bash
npm publish
```

Enter the two-factor authentication code only in npm's own prompt.

Verify the registry and the real installation path:

```bash
npm view opendiff version
npx --yes opendiff@0.1.4 doctor
npx --yes opendiff@0.1.4 install
```

Restart Codex or Claude Code if it was already open, then invoke the installed OpenDiff skill from chat.

## Scoped fallback

Use the scoped name only when the unscoped `opendiff` name becomes unavailable before the first publish:

```json
{
  "name": "@francescogabrieli/opendiff"
}
```

Publish a scoped public package with:

```bash
npm publish --access public
```

The corresponding installation command becomes:

```bash
npx --yes @francescogabrieli/opendiff@latest install
```

## Future releases

After the first package exists, configure npm Trusted Publishing for this GitHub repository and a dedicated GitHub Actions workflow. Future releases can then be triggered by a version tag without storing a long-lived npm token.
