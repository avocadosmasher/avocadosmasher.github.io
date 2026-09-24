import { defineConfig, devices } from '@playwright/test';

const preview = process.env.TEST_PREVIEW === '1';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['dot'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4399', trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: {
    command: preview ? 'npm run preview -- --host 127.0.0.1 --port 4399' : 'npm run dev -- --host 127.0.0.1 --port 4399',
    url: 'http://127.0.0.1:4399', reuseExistingServer: false, timeout: 60000,
  },
});
