import { defineConfig } from '@playwright/test';

// The e2e suite drives the test page (tests/fixture) and the docs site with real pointer, touch and wheel input.
// It uses the system Chrome (no browser download). The servers run on their own ports (5175 for the test page, 5174 for
// the docs), away from the usual 5173, so a dev server already running there is never mistaken for one of them. A
// server already running on those ports is reused; otherwise each is started (and later stopped) here.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    channel: 'chrome',
    headless: true,
  },
  // The test page (the sheet and controls specs) and the documentation site (docs.spec.js), each reusing a running server.
  webServer: [
    {
      command: 'npm run dev:test -- --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
