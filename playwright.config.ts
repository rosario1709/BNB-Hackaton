import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter @atlas/web dev --port 3100',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    env: { ATLAS_DEMO_MODE: 'true', ATLAS_LIVE_TRADING_ENABLED: 'false', DATABASE_URL: '' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
