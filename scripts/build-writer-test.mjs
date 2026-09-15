import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.execPath, ['node_modules/astro/astro.js', 'build', '--outDir', '.fragment-test/writer-site'], {
  cwd: project, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, FRAGMENT_CMS_LOCAL: '0', FRAGMENT_CMS_OAUTH_TEST: '1',
    FRAGMENT_CMS_TEST_REPO: 'avocadosmasher/fragment-cms-auth-test', FRAGMENT_CMS_TEST_BRANCH: 'cms-test',
    FRAGMENT_CMS_OAUTH_ORIGIN: 'https://fragment-oauth-test.rdd0426.workers.dev',
    FRAGMENT_CONTENT_DIR: './src/content/fragments' },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
writeFileSync(new URL('../.fragment-test/writer-site/_headers', import.meta.url), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n');
console.log('Test build ready: .fragment-test/writer-site (no deployment performed).');
