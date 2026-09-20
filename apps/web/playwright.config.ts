import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end coverage of the critical role flows (§38).
 *
 * These run against a real stack: `npm run dev` in `apps/web` plus the FastAPI service with a
 * seeded database. Start both (see the README) or let the webServer block below start the web
 * app for you, then run `npm run e2e`.
 */
const WEB = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  // Generous on purpose: run against the in-process development store, the analytics endpoints
  // (HOD assessments, attendance, trainer dashboard) take several seconds because that fallback
  // has no indexes. Against real MongoDB they answer in milliseconds.
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      // The sandbox image ships Chromium at a fixed path.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: WEB,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
