import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createOperationPlan, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { applyCategoryOperation, planCategoryOperation } from '../../src/lib/content-category-ops.mjs';
import { inspectCategorySource, patchCategorySource } from '../../src/lib/content-categories.mjs';
import { checkCategoryProposal, checkContentRepository } from '../../src/lib/content-repository-check.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const target = 'src/consts.ts';
const original = '\uFEFF// Original settings\r\nexport const PROFILE = { name: "Keep me" };\r\nexport const CATEGORIES: Record<string, string> = {\r\n  AI: \'#007FFF\', // Keep comment\r\n  \'회고/생각\': \'#8B5CF6\',\r\n};\r\nexport const PROJECTS = [{ name: "Keep project", description: "Original" }];\r\n';
function put(root: string, path: string, source: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source);
}
function fixture(source = original) {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'category-ops-')); roots.push(root);
  mkdirSync(join(root, 'src/content/blog'), { recursive: true }); mkdirSync(join(root, 'src/content/fragments'), { recursive: true });
  put(root, target, source); put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  return root;
}
const create = (source = original) => ({ version: 1, request_id: 'category-create-example', resource: 'category', operation: 'create',
  target: { path: target, key: 'New category' }, baseline: { sha256: sha256(source) }, content: { color: '#123456' } });
const update = (source = original) => ({ version: 1, request_id: 'category-update-example', resource: 'category', operation: 'update',
  target: { path: target, key: 'AI' }, baseline: { sha256: sha256(source) }, changes: { color: '#123456' } });
function snapshot(root: string) {
  const files: Record<string, { bytes: string; mtime: number }> = {};
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = { bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs };
    }
  }
  visit(root); return files;
}
function run(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), ...args, '--root', root, '--json'],
    { cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true });
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
}
function cliPlan(root: string, request: unknown) {
  put(root, 'request.json', JSON.stringify(request));
  return run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/category.json']);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('category-ops-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('카테고리 생성 CLI는 지정한 키·색만 추가한 계획을 준비하고 원문을 쓰지 않는다', () => {
  const root = fixture(); const result = cliPlan(root, create());
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: target, before: original,
    source: original.replace("  '회고/생각': '#8B5CF6',\r\n", "  '회고/생각': '#8B5CF6',\r\n  \"New category\": \"#123456\",\r\n") });
  expect(readFileSync(join(root, target), 'utf8')).toBe(original);
});

it('카테고리 수정 CLI는 색 값만 바꾸고 다른 설정·주석·BOM·줄바꿈을 보존한다', () => {
  const root = fixture(); const result = cliPlan(root, update());
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: target, before: original, source: original.replace("'#007FFF'", '"#123456"') });
});

it('쉼표·여백 없는 한 줄 객체에도 기존 값을 보존하며 새 키를 추가한다', () => {
  const source = "export const CATEGORIES={AI:'#fff'};\nexport const PROFILE={name:'Keep'};";
  const root = fixture(source);
  const result = planCategoryOperation(root, create(source));
  expect(result.status).toBe('planned');
  if (!('plan' in result) || !result.preview) throw new Error('Expected plan');
  expect(result.preview[0].source).toBe("export const CATEGORIES={AI:'#fff', \"New category\": \"#123456\" };\nexport const PROFILE={name:'Keep'};");
});

function planned(root: string, request: unknown) {
  const result = planCategoryOperation(root, request);
  if (!('plan' in result) || !result.plan) throw new Error('Expected plan');
  return result;
}
function apply(root: string, request: unknown) {
  const result = planned(root, request);
  return applyCategoryOperation(root, request, result.plan, result.plan.plan_hash);
}
function read(root: string) { return readFileSync(join(root, target), 'utf8'); }

it.each(['create', 'update'])('%s 적용은 설정 파일과 최소 기록만 쓰고 다른 파일은 보존한다', operation => {
  const root = fixture(); put(root, 'notes.txt', 'Keep notes'); const before = snapshot(root);
  const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  expect(applyCategoryOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'applied',
    written: [target, `.content-ops/receipts/${request.request_id}.json`] });
  expect(read(root)).toBe(result.preview[0].source);
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) if (path !== relative(root, join(root, target))) expect(after[path]).toEqual(file);
  const receipt = JSON.parse(readFileSync(join(root, `.content-ops/receipts/${request.request_id}.json`), 'utf8'));
  expect(receipt).toMatchObject({ result: 'applied', files: result.plan.files, plan_hash: result.plan.plan_hash });
  expect(JSON.stringify(receipt)).not.toContain('Keep project');
});

it.each(['create', 'update'])('%s 재계획·같은 계획 재적용은 파일 목록·바이트·mtime을 바꾸지 않는다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  applyCategoryOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(applyCategoryOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(planCategoryOperation(root, request).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('같은 키·다른 색의 생성 요청은 기존 값을 덮어쓰지 않는다', () => {
  const root = fixture(); const request = { ...create(), target: { path: target, key: 'AI' } }; const before = snapshot(root);
  expect(() => planCategoryOperation(root, request)).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('기록 없이 같은 키·같은 색이 있으면 새 등록·완료 기록을 만들지 않는다', () => {
  const root = fixture(); const request = { ...create(), target: { path: target, key: 'AI' }, content: { color: '#007FFF' } };
  const before = snapshot(root);
  expect(planCategoryOperation(root, request)).toMatchObject({ status: 'unchanged', written: [] }); expect(snapshot(root)).toEqual(before);
});

it('수정할 키나 설정 파일이 없으면 임의 신규 생성하지 않는다', () => {
  const root = fixture(); const before = snapshot(root);
  expect(() => planCategoryOperation(root, { ...update(), target: { path: target, key: 'Missing' } })).toThrow('[target.missing]');
  expect(snapshot(root)).toEqual(before);
  rmSync(join(root, target)); const missing = snapshot(root);
  expect(() => planCategoryOperation(root, create())).toThrow('[target.missing]'); expect(snapshot(root)).toEqual(missing);
});

it('계획 뒤 다른 프로젝트 설정이 바뀌어도 전체 기준 불일치로 덮어쓰지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, target, original.replace('Keep project', 'Another editor project')); const before = snapshot(root);
  expect(() => applyCategoryOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('이미 원하는 색이면 오래된 기준이어도 다른 설정의 최신 편집을 보존한다', () => {
  const root = fixture(original.replace("'#007FFF'", "'#123456'").replace('Keep project', 'Another editor project'));
  const before = snapshot(root);
  expect(planCategoryOperation(root, update())).toMatchObject({ status: 'unchanged', written: [] }); expect(snapshot(root)).toEqual(before);
});

it('색이 아직 다르고 기준 파일이 달라졌으면 계획부터 충돌한다', () => {
  const root = fixture(original + '// Another edit\r\n'); const before = snapshot(root);
  expect(() => planCategoryOperation(root, update())).toThrow('[baseline.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('기록 없이 계획한 결과가 이미 반영됐으면 적용도 쓰기 없이 끝낸다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request); put(root, target, result.preview[0].source);
  const before = snapshot(root);
  expect(applyCategoryOperation(root, request, result.plan, result.plan.plan_hash).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('완료 기록 뒤 색이 같아도 다른 설정이 바뀌면 상태 불일치로 보고한다', () => {
  const root = fixture(); const request = update(); apply(root, request); put(root, target, read(root).replace('Keep project', 'Later project'));
  const before = snapshot(root);
  expect(() => planCategoryOperation(root, request)).toThrow('[receipt.state-mismatch]'); expect(snapshot(root)).toEqual(before);
});

it('완료한 요청 ID를 다른 색으로 재사용하면 충돌한다', () => {
  const root = fixture(); const request = update(); apply(root, request); const before = snapshot(root);
  expect(() => planCategoryOperation(root, { ...request, changes: { color: '#abcdef' } })).toThrow('[request.conflict]'); expect(snapshot(root)).toEqual(before);
});

it.each(['create', 'update'])('%s 결과 지문을 바꾸고 계획 지문까지 다시 계산해도 거절한다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  const forged = createOperationPlan(request, result.plan.files.map((file: { path: string; before_sha256: string | null; after_sha256: string }) => ({ ...file, after_sha256: sha256('Forged') })));
  const before = snapshot(root);
  expect(() => applyCategoryOperation(root, request, forged, forged.plan_hash)).toThrow('[plan.changed]'); expect(snapshot(root)).toEqual(before);
});

it('다른 기대 지문이나 계획 후 변경한 요청으로 적용하지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request); const before = snapshot(root);
  expect(() => applyCategoryOperation(root, request, result.plan, '0'.repeat(64))).toThrow('[plan.changed]');
  expect(() => applyCategoryOperation(root, { ...request, changes: { color: '#abcdef' } }, result.plan, result.plan.plan_hash)).toThrow('[request.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it.each([
  'export const CATEGORIES={};',
  'export const CATEGORIES={\n};',
  'export const CATEGORIES={ /* Keep comment */ };',
  'export const CATEGORIES={\n  // Keep comment\n};',
  "export const CATEGORIES={ AI:'#fff' };",
  "export const CATEGORIES={ AI:'#fff', };",
  "export const CATEGORIES={\n\tAI:'#fff' // Keep comment\n};",
])('정적 객체의 빈 값·후행 쉼표·인라인·탭·주석 배치를 처리한다: %s', source => {
  const root = fixture(source); const result = planned(root, create(source)); const proposed = result.preview[0].source;
  expect(inspectCategorySource(proposed).categories).toEqual({ ...inspectCategorySource(source).categories, 'New category': '#123456' });
  expect(proposed).toContain(source.includes('Keep comment') ? 'Keep comment' : 'CATEGORIES');
  expect(read(root)).toBe(source);
});

it('인용·유니코드 이스케이프로 표현한 기존 키와 색도 같은 값으로 읽는다', () => {
  const source = "export const CATEGORIES={ '\\u0041I': '\\x23007FFF' };"; const root = fixture(source);
  const request = { ...create(source), target: { path: target, key: 'AI' }, content: { color: '#007FFF' } }; const before = snapshot(root);
  expect(planCategoryOperation(root, request).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
  apply(root, update(source)); expect(read(root)).toBe(source.replace("'\\x23007FFF'", '"#123456"'));
});

it('신규 키와 색의 따옴표·역슬래시는 문자열로 인코딩하고 기존 영역은 보존한다', () => {
  const key = 'A "quoted" \\ category'; const color = 'var(--theme-color)';
  const result = patchCategorySource(original, key, color, 'create');
  expect(inspectCategorySource(result).categories[key]).toBe(color);
  expect(result).toContain(JSON.stringify(key) + ': ' + JSON.stringify(color));
  expect(result.startsWith(original.slice(0, original.indexOf('};\r\nexport const PROJECTS')))).toBe(true);
});

it.each([
  'export const CATEGORIES = makeCategories();',
  "export const CATEGORIES = { ...other, AI: '#fff' };",
  "export const CATEGORIES = { ['AI']: '#fff' };",
  "export const CATEGORIES = { AI: color };",
  'export const CATEGORIES = { AI: 123 };',
  "export const CATEGORIES = { get AI() { return '#fff'; } };",
  "export const CATEGORIES = { AI: '#fff' } as const;",
  "export const CATEGORIES = { AI: '#fff', 'AI': '#000' };",
  "export const CATEGORIES = { '__proto__': '#fff' };",
  'export const CATEGORIES = {}; export const CATEGORIES = {};',
  'export let CATEGORIES = {};',
  'const CATEGORIES = {};',
  'export const CATEGORIES = ;',
])('지원 밖 구문을 실행·추측·전체 교체하지 않는다: %s', source => {
  const root = fixture(source); const before = snapshot(root);
  expect(() => planCategoryOperation(root, create(source))).toThrow('[registry.invalid]'); expect(snapshot(root)).toEqual(before);
});

it.each([
  "export const CATEGORIES={AI:'#fff'}; Object.assign(CATEGORIES, {AI:'#000'});",
  "export const CATEGORIES={AI:'#fff'}; CATEGORIES.AI='#000';",
  "export const CATEGORIES={AI:'#fff'}; const alias=CATEGORIES; alias.AI='#000';",
])('선언 밖 참조의 영향을 추측해 카테고리를 수정하지 않는다: %s', source => {
  const root = fixture(source); const before = snapshot(root);
  expect(() => planCategoryOperation(root, create(source))).toThrow('[patch.unsupported]'); expect(snapshot(root)).toEqual(before);
});

it('설정의 실행문·다른 필드 표현식을 평가하지 않는다', () => {
  const source = "throw new Error('DO NOT EXECUTE');\nexport const CATEGORIES = { AI: '#fff' };\nexport const PROFILE = getProfile();\n";
  const root = fixture(source); const result = planned(root, create(source));
  expect(result.preview[0].source).toContain("throw new Error('DO NOT EXECUTE');");
  expect(result.preview[0].source).toContain('export const PROFILE = getProfile();');
});

it('CATEGORIES라는 정적 속성 이름을 설정 변수의 외부 참조로 오인하지 않는다', () => {
  const source = "export const CATEGORIES={ CATEGORIES:'#fff', AI:'#007FFF' };\nexport const PROFILE={CATEGORIES:'Keep'};\nPROFILE.CATEGORIES;";
  const root = fixture(source); const result = planned(root, update(source));
  expect(result.preview[0].source).toBe(source.replace("AI:'#007FFF'", 'AI:"#123456"'));
});

it('제안 카테고리로 전체 콘텐츠를 미리 검사하되 설정과 문서는 쓰지 않는다', () => {
  const root = fixture(); put(root, 'src/content/blog/new-post/index.md', '---\ntitle: New\ndescription: Desc\ncategory: New category\npubDate: 2026-10-19\n---\nBody\n');
  expect(checkContentRepository(root).ok).toBe(false); const before = snapshot(root);
  const result = planned(root, create());
  expect(checkCategoryProposal(root, result.preview[0].source).ok).toBe(true); expect(snapshot(root)).toEqual(before);
  applyCategoryOperation(root, create(), result.plan, result.plan.plan_hash);
  expect(checkContentRepository(root).ok).toBe(true);
});

it('기존 전체 관계 오류는 카테고리 계획도 막고 예외를 자동 추가하지 않는다', () => {
  const root = fixture(); put(root, 'src/content/fragments/broken.md', '---\nid: broken\ntitle: Broken\nsummary: Desc\ncategory: AI\nrelations: [{target: missing, type: related}]\n---\nBody\n');
  const before = snapshot(root);
  expect(() => planCategoryOperation(root, create())).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 콘텐츠 정책 오류가 생기면 적용 직전에 다시 검사한다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, 'src/content/blog/broken/index.md', '---\ntitle: Broken\ncategory: AI\n---\nBody'); const before = snapshot(root);
  expect(() => applyCategoryOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('기존 Infra 예외 목록은 카테고리 색 수정 중 그대로 보존한다', () => {
  const root = fixture(); const path = 'src/content/fragments/legacy.md';
  put(root, path, '---\nid: legacy\ntitle: Legacy\nsummary: Desc\ncategory: Infra\n---\nBody\n');
  const baseline = JSON.stringify({ version: 1, exceptions: [{ rule: 'category.unregistered', path, value: 'Infra' }] });
  put(root, 'config/content-policy-baseline.json', baseline); apply(root, update());
  expect(readFileSync(join(root, 'config/content-policy-baseline.json'), 'utf8')).toBe(baseline);
  expect(checkContentRepository(root).knownIssues).toHaveLength(1);
});

it('요청 경로·키·삭제 값·미지원 필드는 계약 오류로 거절한다', () => {
  const root = fixture(); const request = update(); const before = snapshot(root);
  for (const input of [{ ...request, target: { ...request.target, path: 'src/other.ts' } },
    { ...request, target: { ...request.target, key: '__proto__' } }, { ...request, changes: { color: null } },
    { ...request, changes: { color: '#fff', key: 'Renamed' } }, { ...request, changes: { color: ' ' } }]) {
    expect(() => planCategoryOperation(root, input)).toThrow('[request.invalid]');
  }
  expect(snapshot(root)).toEqual(before);
});

it('잘못된 UTF-8 설정은 손실된 문자열로 재저장하지 않는다', () => {
  const root = fixture(); put(root, target, Buffer.from([0xff, 0xfe])); const before = snapshot(root);
  expect(() => planCategoryOperation(root, update())).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('CLI 계획·적용·재실행은 설정과 최소 기록의 실제 상태를 확인한다', () => {
  const root = fixture(); const result = cliPlan(root, create());
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/category.json', '--expect-plan', result.report.plan.plan_hash];
  expect(run(root, args).report.status).toBe('applied'); const before = snapshot(root);
  expect(run(root, args).report).toMatchObject({ status: 'unchanged', written: [] });
  expect(run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/category.json']).report.status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('같은 CLI 계획 재실행은 계획 파일도 다시 쓰지 않는다', () => {
  const root = fixture(); cliPlan(root, update()); const before = snapshot(root);
  const result = run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/category.json']);
  expect(result.report.plan_saved).toBe(false); expect(snapshot(root)).toEqual(before);
});

it('사람용 CLI는 카테고리 수정 전후 TypeScript를 표시한다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(update()));
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), 'plan', '--request', 'request.json',
    '--out', '.content-ops/local/category.json', '--root', root], { cwd: root, encoding: 'utf8', windowsHide: true });
  expect(result.status).toBe(0); expect(result.stdout).toContain(`[수정 예정] ${target}`);
  expect(result.stdout).toContain("-   AI: '#007FFF'"); expect(result.stdout).toContain('+   AI: "#123456"');
});
