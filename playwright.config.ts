import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const ci = Boolean(process.env.CI)
// Not 3000, so a development server can stay up while the tests run.
const port = Number(process.env.E2E_PORT ?? 3100)
// Set E2E_BASE_URL to test a server that is already running, such as the container
// image, instead of building and starting one. The tests save and clear manual
// readings on that server, so never point it at real data.
const external = process.env.E2E_BASE_URL
const baseURL = external ?? `http://127.0.0.1:${port}`

/**
 * Readings saved during a run go to a directory made for that run, never to real data.
 * Workers load this file too; they inherit the directory the main process made.
 */
function runDataDir(): string {
  return (process.env.DEMIFY_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'demify-e2e-')))
}

export default defineConfig({
  testDir: 'e2e',
  // Files run side by side; the tests inside one file run in order, which the
  // tests that save readings rely on.
  fullyParallel: false,
  forbidOnly: ci,
  // On CI a retry records a trace, so a failure can be studied from the uploaded report.
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  reporter: ci ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: ci ? 'on-first-retry' : 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: a Chromium binary to use instead of the one `playwright install` downloads.
        launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: external
    ? undefined
    : {
        // The tests exercise what ships: a production build served by `next start`.
        command: `npm run build && npm run start -- --port ${port}`,
        url: `${baseURL}/api/health`,
        // Always our own server: one that happens to be running would write to someone else's data.
        reuseExistingServer: false,
        timeout: 180_000,
        env: { DEMIFY_DATA_DIR: runDataDir(), NEXT_TELEMETRY_DISABLED: '1' },
      },
  globalTeardown: './e2e/support/removeDataDir.ts',
})
