import { defineConfig, devices } from '@playwright/test';

// Draft branch behaviour only exists in a production-mode build, so this suite runs its own server.
export default defineConfig({
  testDir: './tests/draft', workers: 1, retries: 0,
  outputDir: '.fragment-test/draft-results',
  use: { baseURL: 'http://127.0.0.1:4404', ...devices['Desktop Chrome'], trace: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4404',
    url: 'http://127.0.0.1:4404/fragments/', reuseExistingServer: false, timeout: 60_000,
    env: { FRAGMENT_CMS_LOCAL: '0', FRAGMENT_WRITER_OAUTH_ORIGIN: 'https://oauth.example' },
  },
});
