import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createOperationPlan, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { applyProjectOperation, planProjectOperation } from '../../src/lib/content-project-ops.mjs';
import { inspectProjectSource } from '../../src/lib/content-projects.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const target = 'src/consts.ts';
const alpha = { name: 'Alpha', period: '2025', role: 'Original role', description: 'Original description',
  highlights: ['one', 'two'], stack: ['TS', 'Node'], link: 'https://example.com/alpha' };
const gamma = { name: 'Gamma', description: 'New project', stack: ['TS'] };
const original = '\uFEFF// Original settings\r\nexport const PROFILE = { name: "Keep me" };\r\nexport const CATEGORIES = { AI: \'#007FFF\' };\r\nexport const PROJECTS: ProjectItem[] = [\r\n  {\r\n    name: \'Alpha\',\r\n    period: \'2025\',\r\n    role: \'Original role\', // Keep comment\r\n    description: \'Original description\',\r\n    highlights: [\'one\', \'two\'],\r\n    stack: [\'TS\', \'Node\'],\r\n    link: \'https://example.com/alpha\',\r\n  },\r\n  { name: \'Beta\', description: \'Keep other project\' },\r\n];\r\nexport const FOOTER = "Keep footer";\r\n';
function put(root: string, path: string, source: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source);
}
function fixture(source = original) {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'project-ops-')); roots.push(root);
  mkdirSync(join(root, 'src/content/blog'), { recursive: true }); mkdirSync(join(root, 'src/content/fragments'), { recursive: true });
  put(root, target, source); put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n'); return root;
}
const create = (source = original) => ({ version: 1, request_id: 'project-create-example', resource: 'project', operation: 'create',
  target: { path: target }, baseline: { sha256: sha256(source) }, content: gamma });
const update = (changes: Record<string, unknown> = { role: 'Changed role' }, source = original) => ({ version: 1,
  request_id: 'project-update-example', resource: 'project', operation: 'update', target: { path: target, selector: alpha },
  baseline: { sha256: sha256(source) }, changes });
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
  return run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/project.json']);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('project-ops-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('프로젝트 생성 CLI는 기존 설정과 항목을 보존하며 확정 항목 하나만 추가한다', () => {
  const root = fixture(); const result = cliPlan(root, create());
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: target, before: original,
    source: original.replace('];\r\nexport const FOOTER', '  ' + JSON.stringify(gamma) + ',\r\n];\r\nexport const FOOTER') });
  expect(readFileSync(join(root, target), 'utf8')).toBe(original);
});

it('프로젝트 역할만 수정하면 다른 항목·기간·설명·배열·링크·주석·원문을 보존한다', () => {
  const root = fixture(); const result = cliPlan(root, update());
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: target, before: original, source: original.replace("'Original role'", '"Changed role"') });
});

function planned(root: string, request: unknown) {
  const result = planProjectOperation(root, request);
  if (!('plan' in result) || !result.plan || !result.preview) throw new Error('Expected plan');
  return result;
}
function apply(root: string, request: unknown) {
  const result = planned(root, request); return applyProjectOperation(root, request, result.plan, result.plan.plan_hash);
}
function read(root: string) { return readFileSync(join(root, target), 'utf8'); }
function settings(items: unknown[]) {
  return `export const CATEGORIES={AI:'#007FFF'};\nexport const PROJECTS=${JSON.stringify(items)};\nexport const PROFILE={name:'Keep'};\n`;
}

it.each(['create', 'update'])('%s 적용은 설정 파일과 최소 완료 기록만 변경한다', operation => {
  const root = fixture(); put(root, 'notes.txt', 'Keep notes'); const before = snapshot(root);
  const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  expect(applyProjectOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'applied',
    written: [target, `.content-ops/receipts/${request.request_id}.json`] });
  expect(read(root)).toBe(result.preview[0].source);
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) if (path !== relative(root, join(root, target))) expect(after[path]).toEqual(file);
  const receipt = JSON.parse(readFileSync(join(root, `.content-ops/receipts/${request.request_id}.json`), 'utf8'));
  expect(receipt).toMatchObject({ result: 'applied', plan_hash: result.plan.plan_hash, files: result.plan.files });
  expect(JSON.stringify(receipt)).not.toContain('Original description');
});

it.each(['create', 'update'])('%s의 같은 계획 재적용·재계획은 파일 목록·바이트·mtime을 바꾸지 않는다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  applyProjectOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(applyProjectOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(planProjectOperation(root, request).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('기록 없이 같은 항목이 이미 있으면 새 ID·항목·완료 기록을 만들지 않는다', () => {
  const source = settings([alpha, gamma]); const root = fixture(source); const before = snapshot(root);
  expect(planProjectOperation(root, create()).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
  expect(inspectProjectSource(read(root)).items.map(item => item.data)).toEqual([alpha, gamma]);
});

it('이름·기간·역할·링크가 같은데 설명이 다른 생성 요청은 충돌한다', () => {
  const root = fixture(); const request = { ...create(), content: { ...alpha, description: 'Different description' } }; const before = snapshot(root);
  expect(() => planProjectOperation(root, request)).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('이름만 같고 기간 등이 빠진 생성 요청도 기존 항목을 복제하지 않는다', () => {
  const root = fixture(); const request = { ...create(), content: { name: 'Alpha', description: 'New description' } }; const before = snapshot(root);
  expect(() => planProjectOperation(root, request)).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('동일 이름이라도 명시한 기간이 기존 확정 기간과 다르면 별도 항목으로 추가한다', () => {
  const root = fixture(); const request = { ...create(), content: { ...alpha, period: '2026' } }; apply(root, request);
  expect(inspectProjectSource(read(root)).items.map(item => item.data)).toEqual([alpha, { name: 'Beta', description: 'Keep other project' }, request.content]);
});

it('생성 후보가 여러 개면 하나가 정확히 같아도 자동 선택하지 않는다', () => {
  const source = settings([gamma, { ...gamma, description: 'Another description' }]); const root = fixture(source); const before = snapshot(root);
  expect(() => planProjectOperation(root, create(source))).toThrow('[target.ambiguous]'); expect(snapshot(root)).toEqual(before);
});

it('원래 항목 전체가 같은 수정 후보가 두 개면 배열 첫 항목을 고르지 않는다', () => {
  const source = settings([alpha, alpha]); const root = fixture(source); const before = snapshot(root);
  expect(() => planProjectOperation(root, update({ role: 'Changed role' }, source))).toThrow('[target.ambiguous]'); expect(snapshot(root)).toEqual(before);
});

it('같은 식별 정보라도 원래 전체 값이 유일하면 다른 항목을 보존하며 수정한다', () => {
  const other = { ...alpha, description: 'Other description' }; const source = settings([other, alpha]); const root = fixture(source);
  apply(root, update({ description: 'Changed description' }, source));
  expect(inspectProjectSource(read(root)).items.map(item => item.data)).toEqual([other, { ...alpha, description: 'Changed description' }]);
});

it('항목 순서가 달라도 전체 선택자로 실제 원래 항목을 찾는다', () => {
  const source = settings([gamma, alpha]); const root = fixture(source); apply(root, update({ role: 'Changed role' }, source));
  expect(inspectProjectSource(read(root)).items.map(item => item.data)).toEqual([gamma, { ...alpha, role: 'Changed role' }]);
});

it('수정 결과가 다른 항목 전체와 같아지면 합치거나 중복 생성하지 않는다', () => {
  const source = settings([alpha, { ...alpha, role: 'Changed role' }]); const root = fixture(source); const before = snapshot(root);
  expect(() => planProjectOperation(root, update({ role: 'Changed role' }, source))).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('성과·기술 배열은 명시적 교체·비우기만 수행하고 다른 값은 보존한다', () => {
  const root = fixture(); apply(root, update({ highlights: [], stack: ['Node', 'TS'] }));
  expect(read(root)).toBe(original.replace("['one', 'two']", '[]').replace("['TS', 'Node']", '["Node","TS"]'));
});

it('누락된 선택 필드 여러 개를 추가할 때 기존 문자열·주석·항목을 보존한다', () => {
  const item = { name: 'Alpha', description: 'Description' };
  const source = "export const CATEGORIES={AI:'#fff'};\nexport const PROJECTS=[{name:'Alpha',description:'Description'/* Keep */}];\n";
  const root = fixture(source); const request = { ...update({ role: 'New role', highlights: [], stack: ['TS'] }, source), target: { path: target, selector: item } };
  apply(root, request);
  expect(read(root)).toContain("name:'Alpha',description:'Description',/* Keep */");
  expect(inspectProjectSource(read(root)).items[0].data).toEqual({ ...item, role: 'New role', highlights: [], stack: ['TS'] });
});

it('기존 마지막 필드 수정과 새 필드 삽입을 함께 해도 경계가 겹치지 않는다', () => {
  const item = { name: 'Alpha', description: 'Old' }; const source = settings([item]); const root = fixture(source);
  const request = { ...update({ description: 'New', role: 'Role', stack: [] }, source), target: { path: target, selector: item } };
  apply(root, request);
  expect(inspectProjectSource(read(root)).items[0].data).toEqual({ ...item, description: 'New', role: 'Role', stack: [] });
});

it('선택 필드 생략과 빈 배열은 임의로 같은 값으로 정규화하지 않는다', () => {
  const source = settings([gamma]); const root = fixture(source); const request = { ...create(source), content: { ...gamma, highlights: [] } };
  expect(() => planProjectOperation(root, request)).toThrow('[target.conflict]');
  const edit = { ...update({ highlights: [] }, source), target: { path: target, selector: gamma } }; apply(root, edit);
  expect(inspectProjectSource(read(root)).items[0].data).toEqual({ ...gamma, highlights: [] });
});

it('원래 선택자가 없고 후보가 없으면 신규 생성으로 바꾸지 않는다', () => {
  const root = fixture(); const request = { ...update(), target: { path: target, selector: { name: 'Missing', description: 'Missing' } } }; const before = snapshot(root);
  expect(() => planProjectOperation(root, request)).toThrow('[target.missing]'); expect(snapshot(root)).toEqual(before);
});

it('원래 선택자의 요청 밖 값이 달라졌으면 최신 내용을 옛 원문으로 덮어쓰지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, target, original.replace('Original description', 'Another editor description')); const before = snapshot(root);
  expect(() => applyProjectOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 다른 설정만 바뀌어도 전체 기준 충돌로 중단한다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, target, original.replace('Keep me', 'Another profile')); const before = snapshot(root);
  expect(() => applyProjectOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[baseline.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('이미 요청한 역할이 반영됐고 유일하게 식별되면 최신 설명을 보존하며 쓰기 없이 끝낸다', () => {
  const source = original.replace("'Original role'", "'Changed role'").replace('Original description', 'Another description');
  const root = fixture(source); const before = snapshot(root);
  expect(planProjectOperation(root, update())).toMatchObject({ status: 'unchanged', written: [] }); expect(snapshot(root)).toEqual(before);
});

it('이미 요청 값이 반영됐어도 식별 후보가 여럿이면 완료로 오인하지 않는다', () => {
  const source = settings([{ ...alpha, role: 'Changed role', description: 'First' }, { ...alpha, role: 'Changed role', description: 'Second' }]);
  const root = fixture(source); const before = snapshot(root);
  expect(() => planProjectOperation(root, update())).toThrow('[target.ambiguous]'); expect(snapshot(root)).toEqual(before);
});

it('기록 없이 계획한 결과가 이미 존재하면 적용도 추가 쓰기를 하지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request); put(root, target, result.preview[0].source);
  const before = snapshot(root);
  expect(applyProjectOperation(root, request, result.plan, result.plan.plan_hash).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('완료 기록 뒤 다른 설정이 바뀌면 요청 값이 같아도 상태 불일치다', () => {
  const root = fixture(); const request = update(); apply(root, request); put(root, target, read(root).replace('Keep footer', 'Later footer'));
  expect(() => planProjectOperation(root, request)).toThrow('[receipt.state-mismatch]');
});

it('같은 완료 요청 ID의 입력 변경이나 다른 계획 지문은 거절한다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  expect(() => applyProjectOperation(root, request, result.plan, '0'.repeat(64))).toThrow('[plan.changed]');
  applyProjectOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(() => planProjectOperation(root, update({ role: 'Another role' }))).toThrow('[request.conflict]'); expect(snapshot(root)).toEqual(before);
});

it.each(['create', 'update'])('%s 결과를 변조하고 지문을 다시 만들어도 거절한다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  const forged = createOperationPlan(request, result.plan.files.map((file: { path: string; before_sha256: string | null; after_sha256: string }) => ({ ...file, after_sha256: sha256('Forged') })));
  const before = snapshot(root);
  expect(() => applyProjectOperation(root, request, forged, forged.plan_hash)).toThrow('[plan.changed]'); expect(snapshot(root)).toEqual(before);
});

it.each([
  '[]', '[ /* Keep comment */ ]', '[\n  // Keep comment\n]',
  '[{name:"Other",description:"Other"}]', '[{name:"Other",description:"Other"},]',
  '[\n\t{name:"Other",description:"Other"} // Keep comment\n]',
])('빈 배열·한 줄·쉼표·탭·주석 배치에서 새 항목을 추가한다: %s', array => {
  const source = `export const CATEGORIES={AI:'#fff'};\nexport const PROJECTS=${array};\nexport const PROFILE={name:'Keep'};`;
  const root = fixture(source); const result = planned(root, create(source));
  expect(inspectProjectSource(result.preview[0].source).items.at(-1)?.data).toEqual(gamma);
  expect(result.preview[0].source).toContain('export const PROFILE={name:\'Keep\'};'); expect(read(root)).toBe(source);
});

it.each([
  'export const PROJECTS = buildProjects();', 'export const PROJECTS = [...other];', 'export const PROJECTS = [other];',
  'export const PROJECTS = [,];', 'export const PROJECTS = [] as const;', 'export let PROJECTS = [];',
  'const PROJECTS = [];', 'export const PROJECTS=[]; export const PROJECTS=[];', 'export const PROJECTS = ;',
  'export const PROJECTS=[{name:"A",description:"D",extra:"Keep"}];',
  'export const PROJECTS=[{name:"A",name:"B",description:"D"}];',
  'export const PROJECTS=[{["name"]:"A",description:"D"}];',
  'export const PROJECTS=[{name:"A",description:"D",stack:[...other]}];',
  'export const PROJECTS=[{name:"A",description:"D",highlights:[123]}];',
  'export const PROJECTS=[{name:"A",description:desc}];', 'export const PROJECTS=[{name:"A"}];',
])('지원 밖 프로젝트 구문·필드를 추측하거나 지우지 않는다: %s', projects => {
  const source = `export const CATEGORIES={AI:'#fff'};\n${projects}`; const root = fixture(source); const before = snapshot(root);
  expect(() => planProjectOperation(root, create(source))).toThrow('[registry.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('PROJECTS 변수의 후속 수정은 거절하되 다른 객체 속성 이름은 보존한다', () => {
  const source = settings([]) + 'PROJECTS.push({name:"X",description:"D"});'; const root = fixture(source);
  expect(() => planProjectOperation(root, create(source))).toThrow('[patch.unsupported]');
  const staticSource = settings([]) + 'export const OTHER={PROJECTS:"Keep"}; OTHER.PROJECTS;'; const other = fixture(staticSource);
  expect(planned(other, create(staticSource)).preview[0].source).toContain('OTHER.PROJECTS;');
});

it('설정의 실행문은 평가하지 않고 허용된 문자열만 해석한다', () => {
  const source = "throw new Error('DO NOT EXECUTE');\n" + settings([]); const root = fixture(source);
  expect(planned(root, create(source)).preview[0].source).toContain("throw new Error('DO NOT EXECUTE');");
});

it('중복 후보는 JSON과 사람용 CLI에 실제 항목 값으로 설명한다', () => {
  const source = settings([alpha, alpha]); const root = fixture(source); const request = update({ role: 'Changed role' }, source);
  const result = cliPlan(root, request);
  expect(result.status).toBe(1); expect(result.report).toMatchObject({ diagnostics: [{ rule: 'target.ambiguous' }], candidates: [alpha, alpha], written: [] });
  const human = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), 'plan', '--request', 'request.json',
    '--out', '.content-ops/local/project.json', '--root', root], { cwd: root, encoding: 'utf8', windowsHide: true });
  expect(human.status).toBe(1); expect(human.stdout).toContain('[후보 1]'); expect(human.stdout).toContain('[후보 2]');
});

it('프로젝트 ID·배열 순번·필수값 삭제·경로 변경은 입력 계약에서 거절한다', () => {
  const root = fixture(); const request = update(); const before = snapshot(root);
  for (const input of [{ ...request, target: { ...request.target, index: 0 } }, { ...request, changes: { id: 'new-id' } },
    { ...request, changes: { description: null } }, { ...request, target: { ...request.target, path: 'src/other.ts' } },
    { ...create(), content: { ...gamma, id: 'new-id' } }]) expect(() => planProjectOperation(root, input)).toThrow('[request.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('잘못된 UTF-8이나 없는 설정 파일은 손실된 원문·신규 파일로 바꾸지 않는다', () => {
  const root = fixture(); put(root, target, Buffer.from([0xff, 0xfe]));
  expect(() => planProjectOperation(root, create())).toThrow('[content.invalid]');
  rmSync(join(root, target)); const before = snapshot(root);
  expect(() => planProjectOperation(root, create())).toThrow('[target.missing]'); expect(snapshot(root)).toEqual(before);
});

it('기존 문서·관계 정책 오류는 프로젝트 계획을 막는다', () => {
  const root = fixture(); put(root, 'src/content/fragments/broken.md', '---\nid: broken\ntitle: Broken\nsummary: Desc\ncategory: AI\nrelations: [{target: missing, type: related}]\n---\nBody\n');
  const before = snapshot(root);
  expect(() => planProjectOperation(root, create())).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 문서 정책 오류가 생기면 어떤 설정도 쓰지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, 'src/content/blog/broken/index.md', '---\ntitle: Broken\ncategory: AI\n---\nBody'); const before = snapshot(root);
  expect(() => applyProjectOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('신규 문자열과 배열의 따옴표·개행을 안전하게 인코딩한다', () => {
  const root = fixture(); const item = { ...gamma, description: 'Quoted "value"\nNext', highlights: ['One "quote"', 'Line\nTwo'] };
  apply(root, { ...create(), content: item }); expect(inspectProjectSource(read(root)).items.at(-1)?.data).toEqual(item);
});

it('CLI 계획·적용·재실행은 설정과 최소 기록의 실제 상태를 확인한다', () => {
  const root = fixture(); const result = cliPlan(root, create());
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/project.json', '--expect-plan', result.report.plan.plan_hash];
  expect(run(root, args).report.status).toBe('applied'); const before = snapshot(root);
  expect(run(root, args).report).toMatchObject({ status: 'unchanged', written: [] });
  expect(run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/project.json']).report.status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('같은 계획 재실행은 계획 파일까지 다시 쓰지 않는다', () => {
  const root = fixture(); cliPlan(root, update()); const before = snapshot(root);
  expect(run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/project.json']).report.plan_saved).toBe(false);
  expect(snapshot(root)).toEqual(before);
});
