import { defineConfig } from '@playwright/test';

// The e2e suite drives the demo page with real pointer, touch and wheel input.
// It uses the system Chrome (no browser download) and reuses a dev server that's
// already running on 5173; if there isn't one, it starts (and later stops) its own.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
