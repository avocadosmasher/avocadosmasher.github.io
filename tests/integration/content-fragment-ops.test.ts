import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createOperationPlan, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { applyFragmentOperation, planFragmentOperation } from '../../src/lib/content-fragment-ops.mjs';
import { patchContentSource } from '../../src/lib/content-source-patch.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const target = 'src/content/fragments/old-name.md';
const original = '\uFEFF---\r\n# Original comment\r\nid: alpha\r\ntitle: "Original title" # Keep comment\r\nsummary: Original summary\r\ncategory: AI\r\naliases: [first, second]\r\ntags: [one, two]\r\nrelations: []\r\n---\r\nOriginal body\r\n';
const card = (id: string, relations: { target: string; type: string }[] = []) =>
  `---\nid: ${id}\ntitle: ${id}\nsummary: Summary ${id}\ncategory: AI\nrelations: ${JSON.stringify(relations)}\n---\nBody ${id}\n`;
function put(root: string, path: string, source: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), source);
}
function fixture() {
  mkdirSync(base, { recursive: true }); const root = mkdtempSync(join(base, 'fragment-ops-')); roots.push(root);
  mkdirSync(join(root, 'src/content/blog'), { recursive: true });
  put(root, 'src/consts.ts', "export const CATEGORIES = { AI: '#007FFF' };\n");
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  put(root, target, original);
  put(root, 'src/content/fragments/beta.md', card('beta'));
  put(root, 'src/content/fragments/gamma.md', card('gamma'));
  return root;
}
const create = () => ({ version: 1, request_id: 'fragment-create-example', resource: 'fragment', operation: 'create',
  target: { path: 'src/content/fragments/new-card.md', id: 'new-card' }, baseline: { sha256: null }, content: { source: card('new-card') } });
const update = (changes: Record<string, unknown> = { title: 'Changed title' }, source = original) => ({ version: 1,
  request_id: 'fragment-update-example', resource: 'fragment', operation: 'update', target: { path: target, id: 'alpha' },
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
  return run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/fragment.json']);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('fragment-ops-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('Fragment 생성 CLI는 확정한 ID·원문으로 생성 계획만 준비한다', () => {
  const root = fixture(); const request = create(); const before = snapshot(root);
  const result = cliPlan(root, request);
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: request.target.path, source: request.content.source });
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) expect(after[path]).toEqual(file);
});

it('Fragment 제목 수정은 원래 파일명·ID·별칭·태그·관계·본문 바이트를 보존한다', () => {
  const root = fixture(); const result = cliPlan(root, update());
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ path: target, before: original, source: original.replace('"Original title"', '"Changed title"') });
  expect(readFileSync(join(root, target), 'utf8')).toBe(original);
});

function planned(root: string, request: unknown) {
  const result = planFragmentOperation(root, request);
  if (!('plan' in result) || !result.plan) throw new Error('Expected plan');
  return result;
}
function apply(root: string, request: unknown) {
  const result = planned(root, request);
  return applyFragmentOperation(root, request, result.plan, result.plan.plan_hash);
}
const betaPath = 'src/content/fragments/beta.md';
function relationRequest(root: string, relations: { target: string; type: string }[] = [{ target: 'beta', type: 'prerequisite' }]) {
  const beta = card('beta', [{ target: 'alpha', type: 'related' }, { target: 'gamma', type: 'part-of' }]);
  put(root, betaPath, beta);
  return { ...update({ relations }), related_targets: [{ path: betaPath, id: 'beta', sha256: sha256(beta) }] };
}

it('새 카드는 확정 원문과 최소 기록만 추가하며 다른 파일·ID를 만들지 않는다', () => {
  const root = fixture(); const request = create(); const before = snapshot(root);
  expect(apply(root, request)).toMatchObject({ status: 'applied', written: [request.target.path, '.content-ops/receipts/fragment-create-example.json'] });
  expect(readFileSync(join(root, request.target.path), 'utf8')).toBe(request.content.source);
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) expect(after[path]).toEqual(file);
  const receipt = JSON.parse(readFileSync(join(root, '.content-ops/receipts/fragment-create-example.json'), 'utf8'));
  expect(receipt.result).toBe('applied'); expect(JSON.stringify(receipt)).not.toContain('Summary new-card');
});

it.each(['create', 'update'])('%s 완료 후 같은 계획·재계획은 실제 파일·mtime을 바꾸지 않는다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  applyFragmentOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(planFragmentOperation(root, request).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('기록 없이 의미가 같은 기존 카드는 기본값·YAML 표현을 바꾸지 않는다', () => {
  const root = fixture(); const request = create();
  const source = request.content.source.replace('title: new-card', 'title: "new-card"').replace('relations: []', 'tags: []\naliases: []');
  put(root, request.target.path, source); const before = snapshot(root);
  expect(planFragmentOperation(root, request).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('같은 경로의 다른 내용은 충돌하며 새 접미사나 ID로 우회하지 않는다', () => {
  const root = fixture(); const request = create(); put(root, request.target.path, request.content.source + 'Different body');
  const before = snapshot(root);
  expect(() => planFragmentOperation(root, request)).toThrow('[target.conflict]'); expect(snapshot(root)).toEqual(before);
});

it('파일 경로가 달라도 같은 ID가 있으면 새 카드를 만들지 않는다', () => {
  const root = fixture(); const request = { ...create(), target: { path: 'src/content/fragments/alpha.md', id: 'alpha' }, content: { source: card('alpha') } };
  const before = snapshot(root);
  expect(() => planFragmentOperation(root, request)).toThrow('fragment.duplicate-id'); expect(snapshot(root)).toEqual(before);
});

it.each([
  ['미등록 카테고리', () => ({ ...create(), content: { source: card('new-card').replace('category: AI', 'category: Unknown') } })],
  ['없는 관계 대상', () => ({ ...create(), content: { source: card('new-card', [{ target: 'missing', type: 'related' }]) } })],
  ['자기 관계', () => ({ ...create(), content: { source: card('new-card', [{ target: 'new-card', type: 'related' }]) } })],
])('%s로 생성하면 전체 정책 검사에서 차단한다', (_name, input) => {
  const root = fixture(); const before = snapshot(root);
  expect(() => planFragmentOperation(root, input())).toThrow('[content.invalid]'); expect(snapshot(root)).toEqual(before);
});

it('신규 ID·원문 ID·파일명 불일치와 미지원 메타데이터는 거절한다', () => {
  const root = fixture(); const before = snapshot(root);
  for (const request of [
    { ...create(), target: { path: 'src/content/fragments/other.md', id: 'new-card' } },
    { ...create(), content: { source: card('other') } },
    { ...create(), content: { source: card('new-card').replace('category: AI', 'category: AI\ndraft: true') } },
  ]) expect(() => planFragmentOperation(root, request)).toThrow('[request.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('기존 카드 제목만 적용하면 실제 다른 파일명·ID·배열·본문을 보존한다', () => {
  const root = fixture(); const before = snapshot(root);
  expect(apply(root, update()).written).toEqual([target, '.content-ops/receipts/fragment-update-example.json']);
  expect(readFileSync(join(root, target), 'utf8')).toBe(original.replace('"Original title"', '"Changed title"'));
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) if (path !== relative(root, join(root, target))) expect(after[path]).toEqual(file);
});

it('배열·본문을 명시적으로 비우되 생략한 값은 그대로 둔다', () => {
  const root = fixture(); apply(root, update({ aliases: [], tags: [], body: '' }));
  expect(readFileSync(join(root, target), 'utf8')).toBe(original.replace('[first, second]', '[]').replace('[one, two]', '[]').replace('Original body\r\n', ''));
});

it('별칭·태그 순서는 의미 있는 차이로 취급한다', () => {
  const root = fixture(); apply(root, update({ aliases: ['second', 'first'], tags: ['two', 'one'] }));
  expect(readFileSync(join(root, target), 'utf8')).toBe(original.replace('[first, second]', '["second","first"]').replace('[one, two]', '["two","one"]'));
});

it('빠진 선택 필드에 같은 기본값을 요청하면 필드를 삽입하지 않는다', () => {
  const root = fixture(); const source = card('alpha'); put(root, target, source); const before = snapshot(root);
  expect(planFragmentOperation(root, update({ aliases: [], tags: [] }, source)).status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('요청 ID와 실제 기존 카드 ID가 다르면 경로를 믿고 수정하지 않는다', () => {
  const root = fixture(); const request = { ...update(), target: { path: target, id: 'beta' } }; const before = snapshot(root);
  expect(() => planFragmentOperation(root, request)).toThrow('[target.id-mismatch]'); expect(snapshot(root)).toEqual(before);
});

it('수정 대상 누락이나 ID 변경 요청은 자동 생성·이동으로 바꾸지 않는다', () => {
  const root = fixture(); rmSync(join(root, target)); const before = snapshot(root);
  expect(() => planFragmentOperation(root, update())).toThrow('[target.missing]');
  expect(() => planFragmentOperation(root, update({ id: 'new-id' }))).toThrow('[request.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('기존 Infra 정확한 예외는 제목만 수정할 때 유지한다', () => {
  const root = fixture(); const source = original.replace('category: AI', 'category: Infra'); put(root, target, source);
  put(root, 'config/content-policy-baseline.json', JSON.stringify({ version: 1, exceptions: [{ rule: 'category.unregistered', path: target, value: 'Infra' }] }));
  apply(root, update({ title: 'Changed title' }, source));
  expect(readFileSync(join(root, target), 'utf8')).toBe(source.replace('"Original title"', '"Changed title"'));
});

it('계획 뒤 대상 본문이 바뀌면 다른 편집을 덮어쓰지 않는다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  put(root, target, original + 'Another editor\r\n'); const before = snapshot(root);
  expect(() => applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('기록 없이 이미 요청 필드가 같으면 오래된 기준이어도 최신 본문을 보존한다', () => {
  const root = fixture(); const source = original.replace('"Original title"', "'Changed title'") + 'Another body edit\r\n';
  put(root, target, source); const before = snapshot(root);
  expect(planFragmentOperation(root, update()).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('상대 카드의 역방향 관계 제거와 새 관계를 한 계획에서 검증한다', () => {
  const root = fixture(); const request = relationRequest(root); const result = planned(root, request);
  expect(result.plan.files).toHaveLength(2); expect(result.preview.map(file => file.path)).toEqual([target, betaPath]);
  const betaBefore = readFileSync(join(root, betaPath), 'utf8');
  const betaAfter = betaBefore.replace(JSON.stringify([{ target: 'alpha', type: 'related' }, { target: 'gamma', type: 'part-of' }]),
    JSON.stringify([{ target: 'gamma', type: 'part-of' }]));
  expect(result.preview[1].source).toBe(betaAfter);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash).written).toEqual([target, betaPath, '.content-ops/receipts/fragment-update-example.json']);
  expect(readFileSync(join(root, target), 'utf8')).toBe(original.replace('relations: []', 'relations: [{"target":"beta","type":"prerequisite"}]'));
  expect(readFileSync(join(root, betaPath), 'utf8')).toBe(betaAfter);
});

it('들어오는 연결만 제거하면 주 카드 원문·mtime은 그대로 두고 상대 카드만 쓴다', () => {
  const root = fixture(); const request = relationRequest(root, []); const before = statSync(join(root, target)).mtimeMs;
  const result = planned(root, request);
  const primary = result.plan.files.find((file: { path: string }) => file.path === target);
  expect(primary.before_sha256).toBe(primary.after_sha256);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash).written).toEqual([betaPath, '.content-ops/receipts/fragment-update-example.json']);
  expect(readFileSync(join(root, target), 'utf8')).toBe(original); expect(statSync(join(root, target)).mtimeMs).toBe(before);
});

it('관련 파일을 명시하지 않으면 상대 카드의 들어오는 관계를 자동 삭제하지 않는다', () => {
  const root = fixture(); relationRequest(root, []); const before = snapshot(root);
  expect(planFragmentOperation(root, update({ relations: [] })).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('명시하지 않은 역방향 관계와 겹치는 새 연결은 방향·유형에 무관하게 거절한다', () => {
  const root = fixture(); relationRequest(root); const before = snapshot(root);
  expect(() => planFragmentOperation(root, update({ relations: [{ target: 'beta', type: 'contrasts' }] }))).toThrow('[content.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('관련 파일의 원래 ID·존재·기준 지문을 모두 대조한다', () => {
  const root = fixture(); const request = relationRequest(root); const before = snapshot(root);
  expect(() => planFragmentOperation(root, { ...request, related_targets: [{ ...request.related_targets[0], id: 'gamma' }] })).toThrow('[target.id-mismatch]');
  expect(() => planFragmentOperation(root, { ...request, related_targets: [{ ...request.related_targets[0], path: 'src/content/fragments/missing.md' }] })).toThrow('[target.missing]');
  expect(() => planFragmentOperation(root, { ...request, related_targets: [{ ...request.related_targets[0], sha256: '0'.repeat(64) }] })).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('계획 후 관련 파일 본문이 바뀌면 어떤 카드도 쓰지 않는다', () => {
  const root = fixture(); const request = relationRequest(root); const result = planned(root, request);
  put(root, betaPath, readFileSync(join(root, betaPath), 'utf8') + 'Another editor\n'); const before = snapshot(root);
  expect(() => applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('같은 두 카드의 관계를 여러 개 선언하거나 없는 대상·자기 ID를 지정하면 실패한다', () => {
  const root = fixture(); const before = snapshot(root);
  for (const relations of [[{ target: 'beta', type: 'related' }, { target: 'beta', type: 'part-of' }],
    [{ target: 'missing', type: 'related' }], [{ target: 'alpha', type: 'related' }]]) {
    expect(() => planFragmentOperation(root, update({ relations }))).toThrow('[content.invalid]');
  }
  expect(snapshot(root)).toEqual(before);
});

it('관계 일부만 반영된 상태는 완료로 오인하지 않는다', () => {
  const root = fixture(); const request = relationRequest(root); const result = planned(root, request);
  put(root, target, result.preview[0].source); const before = snapshot(root);
  expect(() => applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('관계 전체가 이미 반영됐고 기록이 없으면 새 기록·추가 쓰기 없이 끝낸다', () => {
  const root = fixture(); const request = relationRequest(root); const result = planned(root, request);
  for (const file of result.preview) put(root, file.path, file.source);
  const before = snapshot(root);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('관계 적용 응답 유실 후 같은 요청을 재시도하면 모든 실제 카드와 기록을 대조한다', () => {
  const root = fixture(); const request = relationRequest(root); const result = planned(root, request);
  applyFragmentOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash).status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
  put(root, betaPath, readFileSync(join(root, betaPath), 'utf8') + 'Later change\n');
  expect(() => planFragmentOperation(root, request)).toThrow('[receipt.state-mismatch]');
});

it('변하지 않은 관련 파일도 계획·기록에 포함하고 재실행 시 상태를 검사한다', () => {
  const root = fixture(); const gammaPath = 'src/content/fragments/gamma.md';
  const request = { ...update({ title: 'Changed title', relations: [] }), related_targets: [{ path: gammaPath, id: 'gamma', sha256: sha256(card('gamma')) }] };
  const result = planned(root, request); const before = statSync(join(root, gammaPath)).mtimeMs;
  const gamma = result.plan.files.find((file: { path: string }) => file.path === gammaPath);
  expect(gamma.before_sha256).toBe(gamma.after_sha256);
  expect(applyFragmentOperation(root, request, result.plan, result.plan.plan_hash).written).not.toContain(gammaPath);
  expect(statSync(join(root, gammaPath)).mtimeMs).toBe(before);
  put(root, gammaPath, card('gamma') + 'Later edit');
  expect(() => planFragmentOperation(root, request)).toThrow('[receipt.state-mismatch]');
});

it('계획 이후 관계 대상이 없어지거나 등록 정책이 바뀌면 적용을 중단한다', () => {
  const root = fixture(); const request = update({ relations: [{ target: 'gamma', type: 'related' }] }); const result = planned(root, request);
  rmSync(join(root, 'src/content/fragments/gamma.md')); const before = snapshot(root);
  expect(() => applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[content.invalid]');
  expect(snapshot(root)).toEqual(before);
  put(root, 'src/content/fragments/gamma.md', card('gamma'));
  put(root, 'src/consts.ts', "export const CATEGORIES = { Other: '#fff' };\n");
  expect(() => applyFragmentOperation(root, request, result.plan, result.plan.plan_hash)).toThrow('[content.invalid]');
});

it.each(['create', 'update'])('%s 결과 지문을 바꾸고 계획 지문까지 다시 계산해도 거절한다', operation => {
  const root = fixture(); const request = operation === 'create' ? create() : update(); const result = planned(root, request);
  const forged = createOperationPlan(request, result.plan.files.map((file: { path: string; before_sha256: string | null; after_sha256: string }) => ({ ...file, after_sha256: sha256('Forged') })));
  const before = snapshot(root);
  expect(() => applyFragmentOperation(root, request, forged, forged.plan_hash)).toThrow('[plan.changed]'); expect(snapshot(root)).toEqual(before);
});

it('같은 요청 ID의 내용 변경·다른 기대 계획 지문은 거절한다', () => {
  const root = fixture(); const request = update(); const result = planned(root, request);
  expect(() => applyFragmentOperation(root, request, result.plan, '0'.repeat(64))).toThrow('[plan.changed]');
  applyFragmentOperation(root, request, result.plan, result.plan.plan_hash); const before = snapshot(root);
  expect(() => planFragmentOperation(root, update({ title: 'Different title' }))).toThrow('[request.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('Fragment의 스키마 밖 필드·앵커 원본 편집은 원문을 지우는 방식으로 처리하지 않는다', () => {
  const root = fixture(); const source = original.replace('category: AI', 'category: AI\r\nextra: keep'); put(root, target, source);
  expect(() => planFragmentOperation(root, update({ title: 'Changed title' }, source))).toThrow('[content.invalid]');
  const anchored = original.replace('"Original title"', '&title "Original title"');
  expect(() => patchContentSource(Buffer.from(anchored), { title: 'Changed title' }, target, 'fragment')).toThrow('[patch.unsupported]');
});

it('CLI의 관계 계획·적용·재실행은 실제 두 카드와 완료 기록까지 처리한다', () => {
  const root = fixture(); const request = relationRequest(root); const result = cliPlan(root, request);
  expect(result.report.status).toBe('planned');
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/fragment.json', '--expect-plan', result.report.plan.plan_hash];
  expect(run(root, args).report).toMatchObject({ status: 'applied', written: [target, betaPath, '.content-ops/receipts/fragment-update-example.json'] });
  const before = snapshot(root);
  expect(run(root, args).report).toMatchObject({ status: 'unchanged', written: [] }); expect(snapshot(root)).toEqual(before);
});

it('같은 CLI 계획을 다시 준비하면 계획 파일까지 다시 쓰지 않는다', () => {
  const root = fixture(); const request = create(); expect(cliPlan(root, request).report.status).toBe('planned');
  const before = snapshot(root);
  const result = run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/fragment.json']);
  expect(result.report.plan_saved).toBe(false); expect(snapshot(root)).toEqual(before);
});
