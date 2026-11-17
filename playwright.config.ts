import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  // All specs share one freshly started app and database.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 360, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    // README's start command; its output goes to a file the specs scan for leaked codes.
    command: `npm run dev -- --port ${port} > e2e/.server.log 2>&1`,
    url: `http://localhost:${port}/logga-in`,
    env: { DATABASE_PATH: "data/e2e.db" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
