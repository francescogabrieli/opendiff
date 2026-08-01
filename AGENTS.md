# OpenDiff contributor notes

## E2E Testing

### Layout

- Specs: `tests/e2e/<feature>.spec.ts`
- Page objects: none — the current suite is intentionally flat.
- Shared fixtures: `examples/fixtures/manifest.json` and query-driven local fixtures.
- Never touch: generated `test-results/`, `playwright-report/`, `dist/`, or `public/data/` artefacts.

### Locator strategy

- Buttons and headings: prefer `getByRole` with the visible name.
- Review-specific states: use the stable `data-testid` hooks on sections, files, references, lines, dialogs, and banners.
- Raw CSS chains, XPath, and positional selectors are forbidden unless a concrete fixture reason is documented.

### Assertions

- Use awaited web-first assertions such as `toBeVisible`, `toHaveURL`, `toHaveText`, `toHaveClass`, and `toHaveCount`.
- Do not use sleeps or one-shot boolean checks.

### Network and auth

- The renderer is local-only. No API writes, credentials, or external services are needed; do not add real-backend calls to fixtures.
- Each test uses a fresh browser context and the explicit `?demo=1` or `?fixture=` route.

### Run

- All E2E: `npm run test:e2e`
- Single spec: `npx playwright test tests/e2e/review.spec.ts`
- Dev server: auto-started and reused through `playwright.config.ts`.

### Adding tests

- Start from [`tests/e2e/review.spec.ts`](tests/e2e/review.spec.ts), add a Given/When/Then scenario, and keep fixtures deterministic.
- Run the e2e-reviewer scanner before handoff.
