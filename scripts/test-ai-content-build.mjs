import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixtureRoot, markdownFixtures, parseMarkdown, serializeMarkdown, jsonFixtures } from './ai-content-fixtures.mjs';

// 앱 소스의 사본을 빌드한다. 운영 콘텐츠·Git·인증 정보는 복사하지 않는다.
const require = createRequire(import.meta.url);
const astro = join(require.resolve('astro/package.json'), '..', 'astro.js');
const workspace = join(fixtureRoot, '.fragment-test');
mkdirSync(workspace, { recursive: true });
const runRoot = mkdtempSync(join(workspace, 'ai-content-'));
const examples = markdownFixtures();
const blog = parseMarkdown(examples.blog);
const fragment = parseMarkdown(examples.fragment);
const { category, project } = jsonFixtures();
const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' };
for (const key of Object.keys(env)) if (key.startsWith('FRAGMENT_')) delete env[key];

function prepare(name) {
  const root = join(runRoot, name);
  mkdirSync(root, { recursive: true });
  cpSync(join(fixtureRoot, 'src'), join(root, 'src'), {
    recursive: true, filter: source => resolve(source) !== resolve(fixtureRoot, 'src/content'),
  });
  for (const path of ['templates', 'astro.config.mjs', 'tsconfig.json', 'package.json']) {
    cpSync(join(fixtureRoot, path), join(root, path), { recursive: true });
  }
  if (existsSync(join(fixtureRoot, 'public'))) cpSync(join(fixtureRoot, 'public'), join(root, 'public'), { recursive: true });
  // 신규 JSON 값은 현행 데이터 파일의 해당 변수에만 추가한다. 사본만 바뀐다.
  const consts = join(root, 'src/consts.ts');
  writeFileSync(consts, `${readFileSync(consts, 'utf8')}\nObject.assign(CATEGORIES, ${JSON.stringify(category)});\nPROJECTS.push(${JSON.stringify(project)});\n`);
  const blogDir = join(root, 'src/content/blog/fixture-public');
  const cardDir = join(root, 'src/content/fragments');
  mkdirSync(blogDir, { recursive: true });
  mkdirSync(cardDir, { recursive: true });
  writeFileSync(join(blogDir, 'index.md'), serializeMarkdown({ ...blog.data, category: Object.keys(category)[0], draft: false },
    `${blog.body}\n![격리 이미지](./fixture.svg)\n`));
  writeFileSync(join(blogDir, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>');
  mkdirSync(join(root, 'src/content/blog/fixture-draft'), { recursive: true });
  writeFileSync(join(root, 'src/content/blog/fixture-draft/index.md'),
    serializeMarkdown({ ...blog.data, title: 'fixture-draft-only' }, 'fixture-draft-body'));
  writeFileSync(join(cardDir, 'alpha.md'), serializeMarkdown({ ...fragment.data,
    relations: [{ target: 'fixture-beta', type: 'related' }] }, fragment.body));
  writeFileSync(join(cardDir, 'beta.md'), serializeMarkdown({ ...fragment.data, id: 'fixture-beta', title: 'fixture-beta-title' }, fragment.body));
  return root;
}

const cases = [
  { name: 'valid', change: () => {}, error: null },
  { name: 'missing-title', change: root => {
    const path = join(root, 'src/content/blog/fixture-public/index.md');
    const { data, body } = parseMarkdown(readFileSync(path, 'utf8'));
    delete data.title;
    writeFileSync(path, serializeMarkdown(data, body));
  }, error: /title/ },
  { name: 'duplicate-id', change: root => {
    writeFileSync(join(root, 'src/content/fragments/beta.md'), examples.fragment);
  }, error: /중복 ID.*fixture-alpha/ },
  { name: 'missing-target', change: root => {
    writeFileSync(join(root, 'src/content/fragments/alpha.md'), serializeMarkdown({ ...fragment.data,
      relations: [{ target: 'missing-card', type: 'related' }] }, fragment.body));
  }, error: /잘못된 관계 대상 missing-card/ },
];

for (const scenario of cases) {
  const root = prepare(scenario.name);
  scenario.change(root);
  const result = spawnSync(process.execPath, [astro, 'build'], {
    cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(root, 'build.log'), output);
  try {
    if (result.error) throw result.error;
    if (scenario.error) {
      assert.notEqual(result.status, 0, `${scenario.name}: 무효 콘텐츠가 빌드에 통과했습니다.`);
      assert.match(output, scenario.error);
    } else {
      assert.equal(result.status, 0, '유효 예시 빌드 실패');
      const html = readFileSync(join(root, 'dist/blog/fixture-public/index.html'), 'utf8');
      assert.match(html, /fixture-public-body/);
      assert.match(html, /FixtureCategory/);
      assert.match(html, /<img[^>]+fixture[^>]+>/);
      const image = html.match(/<img[^>]+src="([^"]*fixture[^"]*)"/);
      assert.ok(image, '격리 이미지 경로 누락');
      assert.ok(existsSync(join(root, 'dist', decodeURIComponent(image[1]).replace(/^\//, ''))), '이미지 산출물 누락');
      assert.equal(existsSync(join(root, 'dist/blog/fixture-draft/index.html')), false);
      assert.equal(existsSync(join(root, 'dist/blog/templates/index.html')), false);
      const cards = readFileSync(join(root, 'dist/fragments/index.html'), 'utf8');
      assert.match(cards, /fixture-alpha/);
      assert.match(cards, /fixture-beta/);
      assert.match(cards, /fixture-card-body/);
      const home = readFileSync(join(root, 'dist/index.html'), 'utf8');
      assert.doesNotMatch(home, /fixture-draft-only/);
      const search = readFileSync(join(root, 'dist/search.json'), 'utf8');
      assert.match(search, /fixture-public/);
      assert.doesNotMatch(search, /fixture-draft/);
      const about = readFileSync(join(root, 'dist/about/index.html'), 'utf8');
      assert.match(about, /합성 프로젝트/);
      for (const page of [html, cards, home, about]) assert.doesNotMatch(page, /\{\{[A-Z_]+\}\}/);
    }
    console.log(`PASS ${scenario.name}`);
  } catch (error) {
    console.error(output);
    throw error;
  }
}
console.log(`AI 콘텐츠 실제 빌드: ${cases.length}개 시나리오 통과. 진단: ${runRoot}`);
