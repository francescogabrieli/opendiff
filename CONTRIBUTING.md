# Contributing to OpenDiff

Thank you for helping make agent-authored changes easier to review. OpenDiff welcomes focused contributions that preserve its local-first, deterministic design.

## Before you start

For bugs and small improvements, open an issue or submit a pull request directly. For new commands, schema changes, broad UI changes, or new integrations, open a proposal first so design and compatibility can be agreed before implementation.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Prerequisites:

- Node.js 20.19 or newer; Node.js 22 is recommended;
- npm;
- Git;
- Chrome or Chromium when running Playwright.

```bash
git clone https://github.com/francescogabrieli/OpenDiff.git
cd OpenDiff
npm ci
npm run build
npm test
```

Run the development renderer with `npm run dev` and open `http://localhost:4173/?demo=1`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `cli/` | Git collection, schema validation, rendering, export, and local serving. |
| `src/` | React guided-review interface and browser-side data normalization. |
| `schemas/` | Public, versioned review document contract. |
| `skills/` | Instructions used by coding agents to author reviews. |
| `examples/` | Deterministic examples and browser fixtures. |
| `tests/` | Node integration tests and Playwright browser scenarios. |
| `docs/` | Architecture and format documentation. |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing boundaries between these areas.

## Making a change

1. Create a branch from `main`.
2. Keep the change focused and preserve unrelated working-tree edits.
3. Add or update tests for observable behavior.
4. Update documentation and `CHANGELOG.md` when users or contributors are affected.
5. Run the checks below.
6. Open a pull request using the repository template.

Use clear commit subjects such as `fix(cli): resolve renderer from the installed package`. Conventional Commit syntax is encouraged but not enforced.

## Required checks

```bash
npm test
npm run build
npm run test:e2e
npm run package:check
```

Run the smallest relevant test while iterating, then the complete set before handoff. Do not commit generated `dist/`, `public/data/`, `test-results/`, `playwright-report/`, or `.agent-diffs/` content.

### Unit and integration tests

Node tests live in `tests/*.test.mjs`. Use temporary repositories and deterministic fixtures. Avoid network access and user-specific paths.

### End-to-end tests

Browser specs live in `tests/e2e/`. Follow [AGENTS.md](AGENTS.md): prefer role-based locators, use stable `data-testid` hooks for review state, use web-first assertions, and never add sleeps.

### UI changes

Verify desktop and narrow viewports. Keep the diff readable, keyboard navigation intact, focus states visible, and motion non-essential. New interactions should be covered by Playwright.

### Schema changes

The JSON Schema, Zod runtime schema, TypeScript types, bundled skill, examples, and tests form one public contract. Update them together. Backward-incompatible changes require a new `schemaVersion`; do not silently reinterpret an existing version.

## Pull request expectations

A reviewable pull request explains:

- the user problem and chosen approach;
- behavior that changed;
- exact verification performed;
- compatibility, security, or privacy implications;
- screenshots for visible UI changes.

Maintainers may ask to split unrelated work. Passing CI is required but does not replace design or code review.

## Reporting security issues

Do not open a public issue for a suspected vulnerability or accidental disclosure. Follow [SECURITY.md](SECURITY.md).
