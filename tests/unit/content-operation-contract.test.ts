import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertOperationBaseline, canonicalHash, checkOperationReceipt, createOperationPlan, createOperationReceipt,
  parseOperationCommand, parseOperationRequest, verifyOperationPlan } from '../../src/lib/content-operation-contract.mjs';

it('기계 요청 예시 모음은 네 대상의 생성·수정 계약과 고정된 서로 다른 요청 ID를 유지한다', () => {
  const catalog: { examples: { request: unknown }[] } = JSON.parse(readFileSync(
    new URL('../../templates/ai-content/operation-requests.example.json', import.meta.url), 'utf8'));
  // 기존 동작의 예시 호환성 검사임. 작동하던 계약에 가짜 Red를 만들지 않음.
  const requests = catalog.examples.map(entry => parseOperationRequest(entry.request));
  expect(requests.map(request => `${request.resource}:${request.operation}`).sort()).toEqual([
    'blog:create', 'blog:update', 'category:create', 'category:update',
    'fragment:create', 'fragment:update', 'project:create', 'project:update',
  ]);
  expect(new Set(requests.map(request => request.request_id)).size).toBe(8);
});

const request = () => ({ version: 1, request_id: 'example-create-01', resource: 'blog', operation: 'create',
  target: { path: 'src/content/blog/example/index.md' }, baseline: { sha256: null },
  content: { source: '---\ntitle: Example\ndescription: Example\ncategory: AI\npubDate: 2026-10-18\n---\nBody\n' } });

it('요청서의 승인 문자열과 알 수 없는 필드를 조용히 버리지 않고 거절한다', () => {
  expect(() => parseOperationRequest({ ...request(), approval: { state: 'approved' } })).toThrow('request.invalid');
});

it('자산만 기록하고 본문 대상의 최종 상태를 빠뜨린 계획은 거절한다', () => {
  const input = { ...request(), assets: [{ source: 'input/image.png', target: 'src/content/blog/example/image.png', sha256: 'a'.repeat(64) }] };
  expect(() => createOperationPlan(input, [{ path: input.assets[0].target, before_sha256: null, after_sha256: 'a'.repeat(64) }])).toThrow('plan.invalid');
});

it('같은 요청 ID라도 확정 본문이 달라지면 재실행으로 허용하지 않는다', () => {
  const original = request();
  const receipt = { version: 1, request_id: original.request_id, request_hash: canonicalHash(parseOperationRequest(original)),
    plan_hash: 'a'.repeat(64), result: 'applied', files: [{ path: original.target.path, before_sha256: null, after_sha256: 'b'.repeat(64) }] };
  const changed = { ...original, content: { source: original.content.source + 'Changed\n' } };
  expect(() => checkOperationReceipt(changed, receipt, {})).toThrow('request.conflict');
});

const digest = 'a'.repeat(64);
const update = () => ({ version: 1, request_id: 'example-update-01', resource: 'blog', operation: 'update',
  target: request().target, baseline: { sha256: digest }, changes: { title: 'New title' } });
const files = () => [{ path: request().target.path, before_sha256: null, after_sha256: digest }];

it('유효한 생성 요청을 보존하고 생략한 목록을 명시적 빈 목록으로 정규화한다', () => {
  const input = Object.freeze(request());
  const result = parseOperationRequest(input);
  expect(result).toMatchObject({ ...input, assets: [], related_targets: [] });
  expect(input).not.toHaveProperty('assets');
});

it('정규화 요청은 키 순서와 관계없이 같고 본문·배열 순서는 구별한다', () => {
  expect(canonicalHash(parseOperationRequest(request()))).toBe(canonicalHash(parseOperationRequest({ ...request(), assets: [] })));
  expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
  expect(canonicalHash(['A', 'B'])).not.toBe(canonicalHash(['B', 'A']));
  expect(canonicalHash('Body\n')).not.toBe(canonicalHash('Body\r\n'));
});

it.each([undefined, new Date(), Number.NaN, BigInt(1), { field: undefined }])('JSON 밖의 입력을 지문 계산에서 묵인하지 않는다: %s', value => {
  expect(() => canonicalHash(value)).toThrow('value.invalid');
});
it('순환 참조를 거절한다', () => {
  const value: { self?: unknown } = {}; value.self = value;
  expect(() => canonicalHash(value)).toThrow('value.invalid');
});

it.each([
  { version: 2 }, { resource: 'career' }, { resource: 'profile' }, { operation: 'delete' }, { operation: 'publish' },
  { access: 'web' }, { baseline: { file_sha: 'a'.repeat(40) } }, { changes: { title: 'Other' } },
  { target: { path: '../index.md' } }, { target: { path: 'src/content/blog/.hidden/index.md' } },
  { target: { path: 'src/content/blog/flat.md' } }, { request_id: '../receipt' },
])('지원하지 않는 요청·인계 필드를 거절한다: %j', change => {
  expect(() => parseOperationRequest({ ...request(), ...change })).toThrow();
});
it.each([{ id: 'new-id' }, { path: 'new-path' }, { title: null }, {}, { draft: null }, { pubDate: '2026-02-30' }])('부분 수정의 미지원·누락 값을 거절한다: %j', changes => {
  expect(() => parseOperationRequest({ ...update(), changes })).toThrow('request.invalid');
});
it('생략과 명시적 비우기를 구별하고 요청하지 않은 변경 필드를 만들지 않는다', () => {
  expect(parseOperationRequest({ ...update(), changes: { body: '', tags: [] } }).changes).toEqual({ body: '', tags: [] });
  expect(parseOperationRequest(update()).changes).toEqual({ title: 'New title' });
});

it('Fragment 신규 ID·원문·경로의 불일치를 거절하고 기존 경로는 임의 변경하지 않는다', () => {
  const fragment = { ...request(), resource: 'fragment', target: { path: 'src/content/fragments/card-a.md', id: 'card-a' },
    content: { source: '---\nid: card-a\ntitle: Card\nsummary: Summary\ncategory: AI\n---\nBody\n' } };
  expect(parseOperationRequest(fragment).target).toEqual(fragment.target);
  expect(() => parseOperationRequest({ ...fragment, target: { ...fragment.target, id: 'card-b' } })).toThrow('request.invalid');
  const existing = { version: 1, request_id: 'card-update', resource: 'fragment', operation: 'update',
    target: { path: 'src/content/fragments/original-name.md', id: 'card-a' }, baseline: { sha256: digest }, changes: { title: 'Edited' } };
  expect(parseOperationRequest(existing).target).toEqual(existing.target);
});
it('카테고리는 키·색을, 프로젝트 수정은 원래 항목 전체를 대상으로 삼는다', () => {
  const common = { version: 1, request_id: 'config-update', operation: 'update', baseline: { sha256: digest } };
  expect(parseOperationRequest({ ...common, resource: 'category', target: { path: 'src/consts.ts', key: 'AI' }, changes: { color: '#123456' } }).changes).toEqual({ color: '#123456' });
  const selector = { name: 'Project', description: 'Original', period: '2026', role: 'Engineer', link: 'https://example.com' };
  const input = { ...common, resource: 'project', target: { path: 'src/consts.ts', selector }, changes: { highlights: [] } };
  expect(parseOperationRequest(input).target.selector).toEqual(selector);
  expect(() => parseOperationRequest({ ...input, target: { path: 'src/consts.ts', selector: { index: 0 } } })).toThrow('request.invalid');
  expect(() => parseOperationRequest({ ...input, changes: { id: 'new-id' } })).toThrow('request.invalid');
});

it('허용된 계획을 지문으로 확인하고 본문과 파일 결과가 바뀌면 거절한다', () => {
  const input = request(); const plan = createOperationPlan(input, files());
  expect(verifyOperationPlan(input, plan, plan.plan_hash)).toEqual(plan);
  expect(() => verifyOperationPlan(input, { ...plan, files: [{ ...files()[0], after_sha256: 'b'.repeat(64) }] }, plan.plan_hash)).toThrow('plan.changed');
  expect(() => verifyOperationPlan({ ...input, content: { source: input.content.source + 'Changed' } }, plan, plan.plan_hash)).toThrow('request.conflict');
  expect(() => verifyOperationPlan(input, plan, 'c'.repeat(64))).toThrow('plan.changed');
});
it.each([
  [{ ...files()[0], path: 'src/content/blog/other/index.md' }],
  [files()[0], files()[0]],
  [{ ...files()[0], before_sha256: digest }],
  [{ ...files()[0], after_sha256: null }],
])('요청 밖·중복·기준 불일치·삭제 계획을 거절한다: %j', (...changes) => {
  expect(() => createOperationPlan(request(), changes)).toThrow('plan.invalid');
});
it('계획 입력 순서가 달라도 지문은 같고 입력 배열은 변경하지 않는다', () => {
  const input = { ...request(), assets: [{ source: 'input/image', target: 'src/content/blog/example/a.png', sha256: digest }] };
  const changes = Object.freeze([Object.freeze(files()[0]), Object.freeze({ path: input.assets[0].target, before_sha256: null, after_sha256: digest })]);
  expect(createOperationPlan(input, changes).plan_hash).toBe(createOperationPlan(input, [...changes].reverse()).plan_hash);
});

it('완료 기록만 믿지 않고 현재 파일 지문을 다시 확인한다', () => {
  const input = request(); const receipt = createOperationReceipt(input, createOperationPlan(input, files()));
  expect(checkOperationReceipt(input, receipt, { [input.target.path]: digest })).toBe('already-applied');
  expect(() => checkOperationReceipt(input, receipt, { [input.target.path]: 'b'.repeat(64) })).toThrow('receipt.state-mismatch');
  expect(() => checkOperationReceipt(input, receipt, { [input.target.path]: null })).toThrow('receipt.state-mismatch');
  expect(receipt).not.toHaveProperty('content');
  expect(JSON.stringify(receipt)).not.toContain('Body');
  expect(() => checkOperationReceipt(input, { ...receipt, token: 'secret' }, {})).toThrow('receipt.invalid');
});
it('변경 없는 대상도 재실행 시 검증하고 변경 없음에는 새 기록을 만들지 않는다', () => {
  const input = { ...update(), assets: [{ source: 'input/image', target: 'src/content/blog/example/a.png', sha256: digest }] };
  const plan = createOperationPlan(input, [{ path: input.target.path, before_sha256: digest, after_sha256: digest },
    { path: input.assets[0].target, before_sha256: null, after_sha256: digest }]);
  const receipt = createOperationReceipt(input, plan);
  expect(() => checkOperationReceipt(input, receipt, { [input.target.path]: 'b'.repeat(64), [input.assets[0].target]: digest })).toThrow('receipt.state-mismatch');
  const noop = createOperationPlan(update(), [{ path: update().target.path, before_sha256: digest, after_sha256: digest }]);
  expect(() => createOperationReceipt(update(), noop)).toThrow('receipt.invalid');
});
it('기준은 Git SHA가 아닌 현재 파일 바이트의 SHA-256과 부재를 구별한다', () => {
  expect(() => assertOperationBaseline(request(), { [request().target.path]: null })).not.toThrow();
  expect(() => assertOperationBaseline(update(), { [request().target.path]: 'b'.repeat(64) })).toThrow('baseline.conflict');
  expect(() => assertOperationBaseline(request(), {})).toThrow('baseline.conflict');
});

it('대소문자만 다른 자산 대상 두 개를 별도 파일로 허용하지 않는다', () => {
  const asset = { source: 'input/image', sha256: digest };
  expect(() => parseOperationRequest({ ...request(), assets: [
    { ...asset, target: 'src/content/blog/example/Image.png' }, { ...asset, target: 'src/content/blog/example/image.png' },
  ] })).toThrow('request.invalid');
});

it('계획·적용 인자 계약에서 승인 플래그를 받지 않는다', () => {
  expect(() => parseOperationCommand(['apply', '--request', 'request.json', '--plan', '.content-ops/local/plan.json',
    '--expect-plan', digest, '--approved'])).toThrow('command.invalid');
});

it('계획·적용의 필수 인자와 로컬 계획 경로를 고정한다', () => {
  const common = ['--request', 'input/request.json'];
  expect(parseOperationCommand(['plan', ...common, '--out', '.content-ops/local/plan.json', '--json']))
    .toEqual({ command: 'plan', request_file: 'input/request.json', plan_file: '.content-ops/local/plan.json', json: true });
  expect(parseOperationCommand(['apply', ...common, '--plan', '.content-ops/local/plan.json', '--expect-plan', digest]))
    .toMatchObject({ command: 'apply', expected_plan_hash: digest });
});
it.each([
  [], ['publish'], ['plan', '--request', 'input.json'],
  ['apply', '--request', 'input.json', '--plan', '.content-ops/local/plan.json'],
  ['plan', '--request', 'input.json', '--out', 'src/content/blog/new/index.md'],
  ['plan', '--request', 'input.json', '--out', '.content-ops/local/plan.json', '--json', '--json'],
])('미지원·누락·중복 명령 인자를 거절한다: %j', (...args) => {
  expect(() => parseOperationCommand(args)).toThrow('command.invalid');
});
