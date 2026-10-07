import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM_PATH points at a preinstalled Chromium; otherwise run `npx playwright install chromium`.
const executablePath = process.env.PW_CHROMIUM_PATH;
const use = { ...devices['Desktop Chrome'], launchOptions: executablePath ? { executablePath } : {} };

// Two apps: the playground (e2e/*.spec.ts) and the website (e2e/site/*.spec.ts).
export default defineConfig({
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  projects: [
    { name: 'playground', testDir: 'e2e', testIgnore: 'site/**', use: { ...use, baseURL: 'http://localhost:5174' } },
    { name: 'site', testDir: 'e2e/site', use: { ...use, baseURL: 'http://localhost:5176' } },
  ],
  webServer: [
    { command: 'pnpm exec vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite --port 5176 --strictPort', cwd: '../site', url: 'http://localhost:5176', reuseExistingServer: !process.env.CI },
  ],
});
