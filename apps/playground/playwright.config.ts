import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH points at a preinstalled Chromium; otherwise run `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    ...devices['Desktop Chrome'],
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: 'pnpm exec vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
});
