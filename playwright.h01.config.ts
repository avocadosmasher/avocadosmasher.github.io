import { defineConfig, devices } from '@playwright/test';

// H01 인수: 페이지네이션까지 확인해야 하므로 12개보다 많은 검증용 카드로 서버를 띄운다.
export default defineConfig({
  reporter: 'dot', testDir: './tests/h01', workers: 1, retries: 0,
  outputDir: '.fragment-test/h01-results',
  use: { baseURL: 'http://127.0.0.1:4402', ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/fragment-fixture.mjs --count 25 --out .fragment-test/h01-content --port 4402 --serve',
    url: 'http://127.0.0.1:4402/fragments/', reuseExistingServer: false, timeout: 60_000,
  },
});
