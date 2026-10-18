import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const temporaryRoot = join(repository, '.fragment-test');
const roots: string[] = [];
const blog = `---\ntitle: CLI example\ndescription: Read only example\ncategory: AI\npubDate: 2026-10-16\n---\nBody\n`;
const fragment = (id: string, relations = '[]') => `---\nid: ${id}\ntitle: Example\nsummary: Example card\ncategory: AI\nrelations: ${relations}\n---\nBody\n`;
function put(root: string, path: string, source: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}
function fixture(prefix = 'content-check-') {
  mkdirSync(temporaryRoot, { recursive: true });
  const root = mkdtempSync(join(temporaryRoot, prefix));
  roots.push(root);
  mkdirSync(join(root, 'src/content/fragments'), { recursive: true });
  put(root, 'src/consts.ts', "export const CATEGORIES: Record<string, string> = { AI: '#007FFF' };\n");
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  put(root, 'src/content/blog/example/index.md', blog);
  return root;
}
function run(root: string, args: string[] = ['--json']) {
  return spawnSync(process.execPath, [join(repository, 'scripts/content-check.mjs'), '--root', root, ...args],
    { cwd: repository, encoding: 'utf8', timeout: 20000 });
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(temporaryRoot, resolve(root));
    if (child.startsWith('..') || !child.startsWith('content-check-')) throw new Error('Unsafe cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});

it('실제 임시 저장소를 검사해 JSON과 성공 종료 코드를 반환한다', () => {
  const root = fixture();
  put(root, 'src/content/fragments/example.md', fragment('card-a'));
  const result = run(root);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, diagnostics: [], graphChecked: true,
    summary: { blogs: 1, fragments: 1 }, knownIssues: [], unusedExceptions: [] });
});

it('오류 입력은 실패 종료하고 사람이 읽는 경로·필드·이유를 표시한다', () => {
  const root = fixture();
  put(root, 'src/content/blog/example/index.md', blog.replace('category: AI', 'category: Unknown'));
  const result = run(root, []);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('검사 실패');
  expect(result.stdout).toContain('src/content/blog/example/index.md');
  expect(result.stdout).toContain('category.unregistered');
  expect(result.stdout).toContain('category');
  expect(result.stdout).toContain('Unknown');
});

it('JSON 예외 파일의 중복 키를 덮어쓰지 않고 설정 오류로 반환한다', () => {
  const root = fixture();
  put(root, 'config/content-policy-baseline.json', '{"version":2,"version":1,"exceptions":[]}');
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, graphChecked: false,
    diagnostics: [expect.objectContaining({ path: 'config/content-policy-baseline.json', rule: 'baseline.invalid' })] });
});

it('알 수 없는 명령 옵션을 조용히 무시하지 않는다', () => {
  const result = run(fixture(), ['--json', '--fix']);
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false,
    diagnostics: [expect.objectContaining({ rule: 'cli.arguments' })] });
});

it('필수 설정 파일이 없으면 JSON 진단으로 실패하고 추적문을 출력하지 않는다', () => {
  const root = fixture();
  rmSync(join(root, 'src/consts.ts'));
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, graphChecked: false, collectionComplete: false,
    diagnostics: [expect.objectContaining({ path: 'src/consts.ts', rule: 'input.unreadable' })] });
});

it('CATEGORIES의 중복 키를 마지막 값으로 덮어쓰지 않는다', () => {
  const root = fixture();
  put(root, 'src/consts.ts', "export const CATEGORIES = { AI: '#111111', 'AI': '#222222' };\n");
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, graphChecked: false,
    diagnostics: [expect.objectContaining({ path: 'src/consts.ts', rule: 'registry.invalid', field: 'CATEGORIES' })] });
});

it('콘텐츠 폴더의 링크를 따라가거나 조용히 누락시키지 않는다', () => {
  const root = fixture();
  const outside = fixture();
  put(outside, 'src/content/fragments/card.md', fragment('linked-card'));
  symlinkSync(join(outside, 'src/content/fragments'), join(root, 'src/content/fragments/linked'), 'junction');
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, collectionComplete: false, graphChecked: false,
    diagnostics: [expect.objectContaining({ path: 'src/content/fragments/linked', rule: 'input.symlink' })] });
});

it('실제 글 glob처럼 평면 글·숨김 파일·숨김 폴더를 수집하지 않는다', () => {
  const root = fixture();
  put(root, 'src/content/blog/flat.md', 'invalid');
  put(root, 'src/content/blog/.hidden/index.md', 'invalid');
  put(root, 'src/content/fragments/.hidden.md', 'invalid');
  put(root, 'src/content/fragments/.hidden/card.md', 'invalid');
  const result = run(root);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).summary).toEqual({ blogs: 1, fragments: 0 });
});

it.each([
  'export const CATEGORIES = buildCategories();',
  'export const CATEGORIES = { ...otherCategories };',
  "export const CATEGORIES = { ['AI']: '#007FFF' };",
  'export const CATEGORIES = { AI: 123 };',
  'export const CATEGORIES = { AI: color };',
  'export const CATEGORIES = ;',
  'export const CATEGORIES = {}; export const CATEGORIES = {};',
  "const CATEGORIES = { AI: '#007FFF' };",
  "export let CATEGORIES = { AI: '#007FFF' };",
  "export const CATEGORIES = { '__proto__': '#007FFF' };",
])('지원하지 않는 설정을 실행·추측하지 않고 거절한다: %s', source => {
  const root = fixture();
  put(root, 'src/consts.ts', source);
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout).diagnostics).toEqual([
    expect.objectContaining({ path: 'src/consts.ts', rule: 'registry.invalid' }),
  ]);
});

it('설정의 실행문을 평가하지 않고 정적 문자열 키와 값만 읽는다', () => {
  const root = fixture('content-check-공백 경로-');
  put(root, 'src/consts.ts', "throw new Error('DO NOT EXECUTE');\nexport const CATEGORIES = { 'AI': '#007FFF' };\n");
  expect(run(root).status).toBe(0);
});

it.each(['{', '{"version":1,"exceptions":[],}', '{"version":2,"exceptions":[]}', 'null'])('잘못된 예외 파일을 거절한다: %s', source => {
  const root = fixture();
  put(root, 'config/content-policy-baseline.json', source);
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, graphChecked: false,
    diagnostics: [expect.objectContaining({ rule: 'baseline.invalid' })] });
});

it.each(['config/content-policy-baseline.json', 'src/content/blog', 'src/content/fragments'])('필수 입력 누락을 오류로 반환한다: %s', path => {
  const root = fixture();
  rmSync(join(root, path), { recursive: true });
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({ collectionComplete: false, graphChecked: false,
    diagnostics: [expect.objectContaining({ path, rule: 'input.unreadable' })] });
});

it('하위 폴더와 draft 글도 수집하고 YAML 위치를 JSON에 보존한다', () => {
  const root = fixture();
  put(root, 'src/content/blog/nested/초안/index.md', blog.replace('title: CLI example', 'title: One\ntitle: Two\ndraft: true'));
  put(root, 'src/content/fragments/nested/card.md', fragment('nested-card'));
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({ collectionComplete: true, summary: { blogs: 2, fragments: 1 },
    diagnostics: [expect.objectContaining({ path: 'src/content/blog/nested/초안/index.md', rule: 'yaml.invalid', line: 3, column: 1 })] });
});

it('중복 ID와 없는 관계 대상을 실제 파일에서 검사한다', () => {
  const root = fixture();
  put(root, 'src/content/fragments/a.md', fragment('card-a', '[{target: missing-card, type: related}]'));
  const missing = run(root);
  expect(missing.status).toBe(1);
  expect(JSON.parse(missing.stdout).diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.missing-target' }));
  put(root, 'src/content/fragments/b.md', fragment('card-a'));
  const duplicate = run(root);
  expect(duplicate.status).toBe(1);
  expect(JSON.parse(duplicate.stdout)).toMatchObject({ graphChecked: false });
  expect(JSON.parse(duplicate.stdout).diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.duplicate-id' }));
});

it('기존 예외와 미사용 예외를 실패와 구별해 사람이 읽을 수 있게 보고한다', () => {
  const root = fixture();
  put(root, 'src/content/fragments/legacy.md', fragment('legacy-card').replace('category: AI', 'category: Legacy'));
  put(root, 'config/content-policy-baseline.json', JSON.stringify({ version: 1, exceptions: [
    { rule: 'category.unregistered', path: 'src/content/fragments/legacy.md', value: 'Legacy' },
    { rule: 'category.unregistered', path: 'src/content/fragments/resolved.md', value: 'OldCategory' },
  ] }));
  const result = run(root, []);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('기존 예외 1건');
  expect(result.stdout).toContain('[기존 예외] src/content/fragments/legacy.md');
  expect(result.stdout).toContain('[미사용 예외] src/content/fragments/resolved.md');
});

it.each([['--root'], ['--root', '--json'], ['--json', '--json'], ['--root', '.', '--root', '.'], ['--apply']])('잘못된 인자를 사용 오류로 종료한다: %j', (...args) => {
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-check.mjs'), ...args], { encoding: 'utf8', timeout: 20000 });
  expect(result.status).toBe(2);
  expect(result.stderr).toBe('');
});

it('도움말은 사용법과 종료 코드를 보여주고 성공 종료한다', () => {
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-check.mjs'), '--help'], { encoding: 'utf8', timeout: 20000 });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('--root');
  expect(result.stdout).toContain('종료 코드: 0');
});

function snapshot(root: string) {
  const files: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = readFileSync(path).toString('base64');
    }
  };
  visit(root);
  return files;
}

it('같은 입력의 반복 실행에서 결과와 파일 목록·바이트가 바뀌지 않는다', () => {
  const root = fixture();
  put(root, 'src/content/fragments/a.md', fragment('card-a'));
  const before = snapshot(root);
  const first = run(root);
  const second = run(root);
  expect(first.status).toBe(0);
  expect(second.stdout).toBe(first.stdout);
  expect(snapshot(root)).toEqual(before);
});

it('설정 경로 중간의 junction도 따라 읽지 않는다', () => {
  const root = fixture();
  const outside = fixture();
  const before = snapshot(outside);
  rmSync(join(root, 'src'), { recursive: true });
  symlinkSync(join(outside, 'src'), join(root, 'src'), 'junction');
  const result = run(root);
  expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics).toContainEqual(expect.objectContaining({ path: 'src', rule: 'input.symlink' }));
  expect(snapshot(outside)).toEqual(before);
});

it('수집 중단을 사람이 읽는 요약에 명시한다', () => {
  const root = fixture();
  rmSync(join(root, 'src/content/fragments'), { recursive: true });
  const result = run(root, []);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('콘텐츠 수집: 미완료');
  expect(result.stdout).toContain('중단 전 읽은 문서만 포함');
  expect(result.stdout).toContain('관계 검사: 미수행');
});

it('다른 작업 폴더에서 실행해도 기본 대상은 스크립트 소속 저장소다', () => {
  const other = fixture();
  const before = snapshot(join(repository, 'src/content'));
  const baselinePath = join(repository, 'config/content-policy-baseline.json');
  const baseline = readFileSync(baselinePath);
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-check.mjs'), '--json'],
    { cwd: other, encoding: 'utf8', timeout: 20000 });
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ ok: true, collectionComplete: true, graphChecked: true, diagnostics: [] });
  expect(report.knownIssues.map(({ rule, path, value }: { rule: string; path: string; value?: string }) => ({ rule, path, value })))
    .toEqual(expect.arrayContaining(JSON.parse(baseline.toString('utf8')).exceptions));
  expect(snapshot(join(repository, 'src/content'))).toEqual(before);
  expect(readFileSync(baselinePath)).toEqual(baseline);
});
