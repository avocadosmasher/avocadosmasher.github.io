import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../src/lib/content-operation-contract.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const workspace = join(repository, '.fragment-test');
mkdirSync(workspace, { recursive: true });
const root = mkdtempSync(join(workspace, 'content-ops-build-'));
cpSync(join(repository, 'src'), join(root, 'src'), {
  recursive: true, filter: source => resolve(source) !== resolve(repository, 'src/content'),
});
for (const file of ['astro.config.mjs', 'tsconfig.json', 'package.json', 'public']) {
  if (existsSync(join(repository, file))) cpSync(join(repository, file), join(root, file), { recursive: true });
}
function put(path, source) { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, source); }
for (const directory of ['src/content/blog', 'src/content/fragments']) mkdirSync(join(root, directory), { recursive: true });
put('config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>';
put('input/fixture.svg', image);
const request = { version: 1, request_id: 'fixture-operation-build', resource: 'blog', operation: 'create',
  target: { path: 'src/content/blog/fixture-operation/index.md' }, baseline: { sha256: null },
  content: { source: '---\ntitle: fixture-operation-title\ndescription: fixture-operation-description\ncategory: AI\npubDate: 2026-10-18\ndraft: false\n---\nfixture-operation-body\n\n![fixture-operation-image](./fixture.svg)\n' },
  assets: [{ source: 'input/fixture.svg', target: 'src/content/blog/fixture-operation/fixture.svg', sha256: sha256(image) }] };
put('request.json', JSON.stringify(request));
const cli = join(repository, 'scripts/content-ops.mjs');
function command(args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--root', root, '--json'], { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}
function snapshot() {
  const files = {};
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = { bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs };
    }
  };
  visit(root); return files;
}
try {
  const prepared = command(['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json']);
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/plan.json', '--expect-plan', prepared.plan.plan_hash];
  assert.equal(command(args).status, 'applied');
  const before = snapshot();
  assert.equal(command(args).status, 'unchanged');
  assert.deepEqual(snapshot(), before, '재실행에서 파일 목록·바이트·수정 시각 변경');
  assert.equal(readFileSync(join(root, request.target.path), 'utf8'), request.content.source);
  assert.equal(readFileSync(join(root, request.assets[0].target), 'utf8'), image);
  const update = { version: 1, request_id: 'fixture-operation-update', resource: 'blog', operation: 'update',
    target: request.target, baseline: { sha256: sha256(request.content.source) }, changes: { title: 'fixture-updated-title' } };
  put('update.json', JSON.stringify(update));
  const updatePlan = command(['plan', '--request', 'update.json', '--out', '.content-ops/local/update.json']);
  const updateArgs = ['apply', '--request', 'update.json', '--plan', '.content-ops/local/update.json', '--expect-plan', updatePlan.plan.plan_hash];
  assert.equal(command(updateArgs).status, 'applied');
  const afterUpdate = snapshot();
  assert.equal(command(updateArgs).status, 'unchanged');
  assert.deepEqual(snapshot(), afterUpdate, '수정 재실행에서 파일 목록·바이트·수정 시각 변경');
  assert.equal(readFileSync(join(root, request.target.path), 'utf8'), request.content.source.replace('title: fixture-operation-title', 'title: "fixture-updated-title"'));
  assert.equal(readFileSync(join(root, request.assets[0].target), 'utf8'), image);
  const require = createRequire(import.meta.url);
  const astro = join(require.resolve('astro/package.json'), '..', 'astro.js');
  const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' };
  for (const key of Object.keys(env)) if (key.startsWith('FRAGMENT_')) delete env[key];
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  put('build.log', (built.stdout ?? '') + '\n' + (built.stderr ?? ''));
  assert.equal(built.status, 0, `격리 빌드 실패: ${join(root, 'build.log')}`);
  const html = readFileSync(join(root, 'dist/blog/fixture-operation/index.html'), 'utf8');
  assert.match(html, /fixture-operation-body/);
  assert.match(html, /fixture-updated-title/);
  const match = html.match(/<img[^>]+src="([^"]*fixture[^"]*)"/);
  assert.ok(match, '생성한 글의 이미지 참조 누락');
  assert.ok(existsSync(join(root, 'dist', decodeURIComponent(match[1]).replace(/^\//, ''))), '이미지 산출물 누락');
  assert.match(readFileSync(join(root, 'dist/search.json'), 'utf8'), /fixture-updated-title/);
  console.log('PASS blog-create-update: CLI plan/apply/replay + preserved body/image/date + Astro title/page/image/search');
} catch (error) {
  console.error(`FAIL blog-create-update: ${error.message}\n격리 작업 폴더: ${root}`);
  process.exitCode = 1;
}
