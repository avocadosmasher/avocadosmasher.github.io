import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
let contentDir = './src/content/fragments';
// Read-only snapshot of the acceptance repository; never overwrite local public cards.
if (process.argv.includes('--remote')) {
  const apiRoot = 'https://api.github.com/repos/avocadosmasher/fragment-cms-auth-test';
  const request = async path => {
    const response = await fetch(`${apiRoot}${path}`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(`Test content read failed: HTTP ${response.status}`);
    return response.json();
  };
  const branch = await request('/branches/cms-test');
  const revision = branch.commit?.sha;
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Missing snapshot revision');
  const files = await request(`/contents/src/content/fragments?ref=${revision}`);
  if (!Array.isArray(files) || files.length === 0 || files.some(file => file.type !== 'file' || !/^[A-Za-z0-9_-]+\.md$/.test(file.name))) throw new Error('Unexpected test content layout');
  mkdirSync(join(project, '.fragment-test'), { recursive: true });
  const snapshot = mkdtempSync(join(project, '.fragment-test', 'writer-snapshot-'));
  const directory = join(snapshot, 'src', 'content', 'fragments');
  mkdirSync(directory, { recursive: true });
  for (const file of files) {
    const data = await request(`/contents/src/content/fragments/${file.name}?ref=${revision}`);
    if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('Missing file content');
    writeFileSync(join(directory, file.name), Buffer.from(data.content, 'base64'));
  }
  contentDir = `./${relative(project, directory).replaceAll('\\', '/')}`;
  console.log(`Read-only test snapshot: ${files.length} cards at ${revision}`);
}
const build = spawnSync(process.execPath, ['node_modules/astro/astro.js', 'build', '--outDir', '.fragment-test/writer-site'], {
  cwd: project, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, FRAGMENT_CMS_OAUTH_TEST: '1',
    FRAGMENT_CMS_TEST_REPO: 'avocadosmasher/fragment-cms-auth-test', FRAGMENT_CMS_TEST_BRANCH: 'cms-test',
    FRAGMENT_CMS_OAUTH_ORIGIN: 'https://fragment-oauth-test.rdd0426.workers.dev',
    FRAGMENT_CONTENT_DIR: contentDir },
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
writeFileSync(new URL('../.fragment-test/writer-site/_headers', import.meta.url), '/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n');
console.log('Test build ready: .fragment-test/writer-site (no deployment performed).');
