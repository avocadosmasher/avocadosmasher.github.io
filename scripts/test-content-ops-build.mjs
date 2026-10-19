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
  const fragmentSource = (id, relations = []) => `---\nid: ${id}\ntitle: ${id}\nsummary: Fixture summary\ncategory: AI\nrelations: ${JSON.stringify(relations)}\n---\nFixture fragment body\n`;
  const cards = [
    { id: 'fixture-term-a', relations: [] },
    { id: 'fixture-term-b', relations: [{ target: 'fixture-term-a', type: 'related' }] },
  ];
  for (const card of cards) {
    const input = { version: 1, request_id: `create-${card.id}`, resource: 'fragment', operation: 'create',
      target: { path: `src/content/fragments/${card.id}.md`, id: card.id }, baseline: { sha256: null },
      content: { source: fragmentSource(card.id, card.relations) } };
    put(`${card.id}.json`, JSON.stringify(input));
    const proposed = command(['plan', '--request', `${card.id}.json`, '--out', `.content-ops/local/${card.id}.json`]);
    const applyArgs = ['apply', '--request', `${card.id}.json`, '--plan', `.content-ops/local/${card.id}.json`, '--expect-plan', proposed.plan.plan_hash];
    assert.equal(command(applyArgs).status, 'applied');
    const beforeReplay = snapshot();
    assert.equal(command(applyArgs).status, 'unchanged');
    assert.deepEqual(snapshot(), beforeReplay, 'Fragment 생성 재실행에서 추가 쓰기');
  }
  const fragmentUpdate = { version: 1, request_id: 'fixture-fragment-update', resource: 'fragment', operation: 'update',
    target: { path: 'src/content/fragments/fixture-term-a.md', id: 'fixture-term-a' },
    baseline: { sha256: sha256(fragmentSource(cards[0].id, cards[0].relations)) },
    changes: { title: 'fixture-fragment-updated', relations: [{ target: 'fixture-term-b', type: 'prerequisite' }] },
    related_targets: [{ path: 'src/content/fragments/fixture-term-b.md', id: 'fixture-term-b',
      sha256: sha256(fragmentSource(cards[1].id, cards[1].relations)) }] };
  put('fragment-update.json', JSON.stringify(fragmentUpdate));
  const fragmentPlan = command(['plan', '--request', 'fragment-update.json', '--out', '.content-ops/local/fragment-update.json']);
  const fragmentArgs = ['apply', '--request', 'fragment-update.json', '--plan', '.content-ops/local/fragment-update.json', '--expect-plan', fragmentPlan.plan.plan_hash];
  assert.equal(command(fragmentArgs).status, 'applied');
  const afterFragments = snapshot();
  assert.equal(command(fragmentArgs).status, 'unchanged');
  assert.deepEqual(snapshot(), afterFragments, 'Fragment 관계 수정 재실행에서 추가 쓰기');
  const categoryCreate = { version: 1, request_id: 'fixture-category-create', resource: 'category', operation: 'create',
    target: { path: 'src/consts.ts', key: 'Fixture category' },
    baseline: { sha256: sha256(readFileSync(join(root, 'src/consts.ts'))) }, content: { color: '#123456' } };
  put('category-create.json', JSON.stringify(categoryCreate));
  const categoryPlan = command(['plan', '--request', 'category-create.json', '--out', '.content-ops/local/category-create.json']);
  const categoryArgs = ['apply', '--request', 'category-create.json', '--plan', '.content-ops/local/category-create.json', '--expect-plan', categoryPlan.plan.plan_hash];
  assert.equal(command(categoryArgs).status, 'applied');
  const afterCategoryCreate = snapshot();
  assert.equal(command(categoryArgs).status, 'unchanged');
  assert.deepEqual(snapshot(), afterCategoryCreate, '카테고리 생성 재실행에서 추가 쓰기');
  const categoryUpdate = { version: 1, request_id: 'fixture-category-update', resource: 'category', operation: 'update',
    target: categoryCreate.target, baseline: { sha256: sha256(readFileSync(join(root, 'src/consts.ts'))) }, changes: { color: '#654321' } };
  put('category-update.json', JSON.stringify(categoryUpdate));
  const colorPlan = command(['plan', '--request', 'category-update.json', '--out', '.content-ops/local/category-update.json']);
  const colorArgs = ['apply', '--request', 'category-update.json', '--plan', '.content-ops/local/category-update.json', '--expect-plan', colorPlan.plan.plan_hash];
  assert.equal(command(colorArgs).status, 'applied');
  const afterCategoryUpdate = snapshot();
  assert.equal(command(colorArgs).status, 'unchanged');
  assert.deepEqual(snapshot(), afterCategoryUpdate, '카테고리 색 수정 재실행에서 추가 쓰기');
  const blogCategory = { version: 1, request_id: 'fixture-blog-category', resource: 'blog', operation: 'update',
    target: request.target, baseline: { sha256: sha256(readFileSync(join(root, request.target.path))) }, changes: { category: 'Fixture category' } };
  put('blog-category.json', JSON.stringify(blogCategory));
  const blogCategoryPlan = command(['plan', '--request', 'blog-category.json', '--out', '.content-ops/local/blog-category.json']);
  const blogCategoryArgs = ['apply', '--request', 'blog-category.json', '--plan', '.content-ops/local/blog-category.json', '--expect-plan', blogCategoryPlan.plan.plan_hash];
  assert.equal(command(blogCategoryArgs).status, 'applied');
  const afterBlogCategory = snapshot();
  assert.equal(command(blogCategoryArgs).status, 'unchanged');
  assert.deepEqual(snapshot(), afterBlogCategory, '신규 카테고리 글 수정 재실행에서 추가 쓰기');
  assert.equal(readFileSync(join(root, request.target.path), 'utf8'), request.content.source
    .replace('title: fixture-operation-title', 'title: "fixture-updated-title"').replace('category: AI', 'category: "Fixture category"'));
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
  assert.match(html, /Fixture category/);
  assert.match(html, /#654321/);
  const match = html.match(/<img[^>]+src="([^"]*fixture[^"]*)"/);
  assert.ok(match, '생성한 글의 이미지 참조 누락');
  assert.ok(existsSync(join(root, 'dist', decodeURIComponent(match[1]).replace(/^\//, ''))), '이미지 산출물 누락');
  assert.match(readFileSync(join(root, 'dist/search.json'), 'utf8'), /fixture-updated-title/);
  assert.match(readFileSync(join(root, 'dist/search.json'), 'utf8'), /Fixture category/);
  const fragmentHtml = readFileSync(join(root, 'dist/fragments/index.html'), 'utf8');
  const data = fragmentHtml.match(/<script[^>]*id="fragment-data"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(data, 'Fragment 빌드 데이터 누락');
  const fragments = JSON.parse(data[1]);
  assert.equal(fragments.find(card => card.id === 'fixture-term-a').title, 'fixture-fragment-updated');
  assert.deepEqual(fragments.find(card => card.id === 'fixture-term-a').relations, [{ target: 'fixture-term-b', type: 'prerequisite' }]);
  assert.deepEqual(fragments.find(card => card.id === 'fixture-term-b').relations, []);
  console.log('PASS blog-fragment-category-ops: CLI create/update/replay + blog/image/search + Fragment IDs/relations + category key/color in Astro output');
} catch (error) {
  console.error(`FAIL blog-fragment-category-ops: ${error.message}\n격리 작업 폴더: ${root}`);
  process.exitCode = 1;
}
