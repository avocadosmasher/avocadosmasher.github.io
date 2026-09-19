import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/admin', workers: 1, retries: 0,
  outputDir: '.fragment-test/admin-results',
  use: { baseURL: 'http://127.0.0.1:4400', ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/admin-local.mjs --test', url: 'http://127.0.0.1:4400/',
    reuseExistingServer: false, timeout: 60000,
  },
});
