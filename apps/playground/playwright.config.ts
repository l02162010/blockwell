import { defineConfig, devices, type Project } from '@playwright/test';

/**
 * Every demo in every engine: Chromium, Firefox and WebKit (Safari) on desktop, plus Android
 * (Chromium) and iPhone (WebKit) emulation for the phone specs in e2e/mobile.
 *
 * PW_BROWSERS limits the engines (e.g. `chromium` where only Chromium is installed);
 * PW_CHROMIUM_PATH points at a preinstalled Chromium.
 */
const executablePath = process.env.PW_CHROMIUM_PATH;
const wanted = new Set((process.env.PW_BROWSERS ?? 'chromium,firefox,webkit').split(','));
const PLAYGROUND = 'http://localhost:5174';
const SITE = 'http://localhost:5176';

const engines = [
  { name: 'chromium', device: devices['Desktop Chrome'] },
  { name: 'firefox', device: devices['Desktop Firefox'] },
  { name: 'webkit', device: devices['Desktop Safari'] },
] as const;
const launch = (engine: string) => (engine === 'chromium' && executablePath ? { launchOptions: { executablePath } } : {});

const projects: Project[] = [];
for (const { name, device } of engines) {
  if (!wanted.has(name)) continue;
  projects.push(
    { name: `playground-${name}`, testDir: 'e2e', testIgnore: ['site/**', 'mobile/**'], use: { ...device, ...launch(name), baseURL: PLAYGROUND } },
    { name: `site-${name}`, testDir: 'e2e/site', use: { ...device, ...launch(name), baseURL: SITE } },
  );
}
if (wanted.has('chromium')) projects.push({ name: 'android', testDir: 'e2e/mobile', use: { ...devices['Pixel 7'], ...launch('chromium'), baseURL: PLAYGROUND } });
if (wanted.has('webkit')) projects.push({ name: 'iphone', testDir: 'e2e/mobile', use: { ...devices['iPhone 14'], baseURL: PLAYGROUND } });

export default defineConfig({
  timeout: 30_000,
  fullyParallel: true,
  // On GitHub, failures show up as annotations on the PR.
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  projects,
  webServer: [
    { command: 'pnpm exec vite --port 5174 --strictPort', url: PLAYGROUND, reuseExistingServer: !process.env.CI },
    { command: 'pnpm exec vite --port 5176 --strictPort', cwd: '../site', url: SITE, reuseExistingServer: !process.env.CI },
  ],
});
