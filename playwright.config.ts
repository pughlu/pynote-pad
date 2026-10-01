import { defineConfig, devices } from '@playwright/test';

// Use the preview URL if provided via environment variable, otherwise fallback to local dev server
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only boot up the local Vite server if we are NOT testing against a deployed Cloudflare preview URL
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
