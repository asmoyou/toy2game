import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 12000 },
  workers: 1,
  use: {
    baseURL: process.env.SITE_URL ?? 'http://localhost:5173/',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: process.env.SITE_URL ? undefined : {
    command: 'npm run preview',
    url: 'http://localhost:5173/',
    reuseExistingServer: false,
  },
});
