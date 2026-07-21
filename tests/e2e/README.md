# E2E tests (opt-in)

The app repo intentionally ships **no test framework** (see `CLAUDE.md`). These
Playwright specs are an **opt-in** QA layer added during a production-readiness
review — they are NOT installed by default and NOT wired into `npm test`.

## Prerequisites

1. Postgres running (`docker compose up -d`), migrated + seeded
   (`npm run db:migrate && npm run db:seed`). Demo users share password
   `demo1234`.
2. Dev server on `http://127.0.0.1:3001` (`npm run dev`) — or let Playwright
   start it (config has a `webServer` block).

## Run

```bash
npm i -D @playwright/test
npx playwright install chromium
npx playwright test --config tests/e2e/playwright.config.ts
```

Traces/screenshots for failures land in `tests/e2e/.output/`.

## What is covered

`app.spec.ts` mirrors the manually-verified critical flows:

- landing page loads, no fatal console errors
- protected route redirects to `/login` when unauthenticated
- invalid login shows the Czech error; valid login reaches the dashboard
- subject create → edit → persistence (reload)
- duplicate-IČO create surfaces an error (documents the current 500 behavior)
- logout clears the session

Selectors use roles/labels (the UI is Czech). Adding `data-testid`s to the
shared inputs in `src/components/ui/` would harden them further.
