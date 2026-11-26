import { defineConfig, devices } from "@playwright/test";

// Browser tests. First time: `npx playwright install chromium`, then `npm run test:e2e`.
// To use a browser that is already installed instead, set CHROMIUM_PATH (for example /usr/bin/chromium).
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // A few workers at most: on a busy laptop, many browsers at once make timing-based tests flaky.
  workers: process.env.CI ? 2 : 3,
  reporter: "list",
  use: { baseURL: "http://localhost:5179", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5179 --strictPort",
    url: "http://localhost:5179",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
});
