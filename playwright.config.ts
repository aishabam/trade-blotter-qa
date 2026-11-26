import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Optional: run against a locally installed browser instead of Playwright's own
// download, e.g. PW_CHANNEL=chrome npx playwright test
const channel = process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // fail CI if someone leaves test.only in
  retries: process.env.CI ? 1 : 0, // one retry in CI, so flaky tests show up as "flaky" in the report
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // 1. Signs in once and saves the session to disk (storageState).
    { name: 'setup', testMatch: /.*\.setup\.ts/, use: { ...channel } },

    // 2. API tests: no browser needed, so they are fast.
    { name: 'api', testDir: './tests/api' },

    // 3. UI tests, reusing the saved session.
    {
      name: 'chromium',
      testDir: './tests/ui',
      use: { ...devices['Desktop Chrome'], ...channel, storageState: 'playwright/.auth/trader1.json' },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testDir: './tests/ui',
      use: { ...devices['Desktop Firefox'], storageState: 'playwright/.auth/trader1.json' },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      testDir: './tests/ui',
      use: { ...devices['Desktop Safari'], storageState: 'playwright/.auth/trader1.json' },
      dependencies: ['setup'],
    },
  ],

  // Starts the app under test before the run and stops it afterwards.
  webServer: {
    command: 'npm start',
    url: `${BASE_URL}/api/instruments`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT) },
  },
});
