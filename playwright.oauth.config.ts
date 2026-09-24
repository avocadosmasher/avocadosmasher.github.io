import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  reporter: 'dot', testDir: './tests/oauth', workers: 1, retries: 0,
  outputDir: '.fragment-test/oauth-results',
  use: { baseURL: 'http://127.0.0.1:4401', ...devices['Desktop Chrome'], trace: 'off' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4401',
    url: 'http://127.0.0.1:4401/fragments/', reuseExistingServer: false, timeout: 60_000,
    env: { FRAGMENT_CMS_OAUTH_TEST: '1',
      FRAGMENT_CMS_TEST_REPO: 'tester/fragment-cms-auth-test', FRAGMENT_CMS_TEST_BRANCH: 'cms-test',
      FRAGMENT_CMS_OAUTH_ORIGIN: 'https://oauth.example' },
  },
});
