import { defineConfig, devices } from '@playwright/test';

// H02 인수: 500개 카드/1,500개 관계 규모에서 검색·그래프 성능을 측정한다.
export default defineConfig({
  testDir: './tests/h02', workers: 1, retries: 0,
  outputDir: '.fragment-test/h02-results',
  use: { baseURL: 'http://127.0.0.1:4403', ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/fragment-fixture.mjs --count 500 --edges 1500 --out .fragment-test/h02-content --port 4403 --serve',
    url: 'http://127.0.0.1:4403/fragments/', reuseExistingServer: false, timeout: 60_000,
  },
});
