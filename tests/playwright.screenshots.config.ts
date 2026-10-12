import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  outputDir: './playwright/results',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  reporter: [['list']],
  retries: 0,
  testDir: './screenshots',
  testMatch: '**/*.screenshots.ts',
  timeout: 180 * 1000,
  use: { baseURL: 'http://localhost:3104', screenshot: 'off', trace: 'off', video: 'off' },
  webServer: {
    command:
      'pnpm exec cross-env PAYLOAD_CONFIG_PATH=./tests/payload.config.ts DATABASE_URL=file::memory: next dev tests --port 3104',
    cwd: '..',
    reuseExistingServer: false,
    timeout: 300 * 1000,
    url: 'http://localhost:3104/admin',
  },
  workers: 1,
})
