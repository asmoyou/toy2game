import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.GAME_URL ?? "http://localhost:5187/",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chrome",
      testMatch: ["game.spec.ts", "settings.spec.ts"],
      use: { channel: "chrome" },
    },
    {
      name: "ipad-webkit",
      testMatch: ["ipad.spec.ts", "mechanisms.spec.ts", "weather.spec.ts"],
      use: { browserName: "webkit" },
    },
  ],
  webServer: process.env.GAME_URL ? undefined : {
    command: "npm run dev -- --port 5187 --strictPort",
    url: "http://localhost:5187/",
    reuseExistingServer: true,
  },
});
