# Trade Blotter QA

A Playwright + TypeScript test framework for a small mock trading app ("Trade Blotter"). Traders sign in, place FX and rates orders, amend them and cancel them.

The suite tests what matters most on a transaction-heavy system:

- **Order lifecycle:** create, amend and cancel orders, with status and version checks.
- **Transaction integrity:** idempotent retries never create duplicate orders, and simultaneous amends can't overwrite each other (optimistic locking).
- **Validation:** data-driven negative tests and boundary values for quantity, price precision and instruments.
- **Access control:** unauthenticated requests are rejected, and traders can't see each other's orders.
- **UI and API agreement:** UI tests confirm against the API what was actually saved.

## Quick start

```bash
npm install
npx playwright install        # downloads Chromium, Firefox and WebKit
npm test                      # starts the app automatically and runs everything
npm run report                # opens the HTML report
```

Other useful commands:

| Command | What it runs |
| --- | --- |
| `npm run test:smoke` | Only tests tagged `@smoke` |
| `npm run test:api` | API tests only (no browser, a few seconds) |
| `npm run test:ui` | UI tests in Chromium |
| `npx playwright test --ui` | Interactive UI mode, good for debugging |
| `npx playwright show-trace <trace.zip>` | Step-by-step replay of a failed test |
| `npm start` | Runs the app on http://localhost:3000 to explore by hand |

Demo logins: `trader1` / `password123` and `trader2` / `password123`.

## Project structure

```
app/                     The system under test (Express + plain JS). Not part of the framework.
tests/
  auth.setup.ts          Signs in once via the UI and saves the session (storageState)
  api/                   API tests: lifecycle, validation, idempotency, concurrency, access control
  ui/                    UI tests: sign-in, session, place/amend/cancel, stale-amend conflict
  pages/                 Page objects (LoginPage, BlotterPage)
  support/
    fixtures.ts          Custom fixtures: api, apiAs, anonymousApi, loginPage, blotter
    trade-api.ts         API client, also used to set up data for UI tests
    test-data.ts         Test users, order builder, idempotency keys
playwright.config.ts     Projects (setup, api, chromium, firefox, webkit), web server, reporters
.github/workflows/       CI: type-check, run on push/PR, shard across 2 machines, upload reports
```

## Design choices

- **The test pyramid.** Most rules are checked at API level, because those tests are fast and stable. UI tests cover the journeys a trader actually takes.
- **API-first test data.** UI tests create their orders through the API, then test only the UI step under test. That's faster and less flaky than clicking through set-up screens.
- **Sign in once.** `auth.setup.ts` saves the signed-in state, so UI tests start already logged in. Sign-in tests opt out with an empty `storageState`.
- **User-facing locators.** Locators use `getByRole`, `getByLabel` and `getByTestId` rather than CSS or XPath chains, so tests survive layout changes.
- **Parallel-safe tests.** Tests never depend on each other or on total counts. They find their own data by ID or by a unique value, so they can run in any order across workers and CI shards.
- **No hard waits.** Playwright's auto-waiting and web-first assertions (`await expect(locator).toHaveText(...)`) handle timing.
- **Flakiness made visible.** CI retries a failed test once and records a trace. A test that passes on retry shows as "flaky" in the report, so it gets fixed rather than hidden.

## CI

The workflow in `.github/workflows/playwright.yml` runs on every push to `main` and on every pull request. It type-checks the tests, installs browsers, splits the run across two machines with `--shard`, and uploads the HTML report on every run. Traces and screenshots are uploaded too when a run fails.

## What I'd add next

- Visual regression checks on the blotter (`toHaveScreenshot`).
- Contract tests on the API responses, using a JSON schema.
- Accessibility checks with `@axe-core/playwright`.
- Seeded test data per worker, plus a reset hook, for larger suites.
- A performance smoke test on order placement latency.
