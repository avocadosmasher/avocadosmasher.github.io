import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createOperationPlan, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { applyBlogUpdate, planBlogUpdate } from '../../src/lib/content-blog-update.mjs';
import { patchBlogSource } from '../../src/lib/content-blog-patch.mjs';
import { replaceOperationFile } from '../../src/lib/content-operation-write.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const base = join(repository, '.fragment-test');
const roots: string[] = [];
const target = 'src/content/blog/original-post/index.md';
const original = '\uFEFF---\r\n# Original comment\r\ntitle: "Original title" # Keep comment\r\ndescription: Original description\r\ncategory: AI\r\npubDate: 2020-02-29\r\ntags:\r\n  - first\r\n  - second\r\ndraft: true\r\nextra: keep-me\r\n---\r\nOriginal body ![image](./old.svg)\r\n';
function put(root: string, path: string, source: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source);
}
function fixture(source = original) {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'blog-update-')); roots.push(root);
  mkdirSync(join(root, 'src/content/fragments'), { recursive: true });
  put(root, 'src/consts.ts', "export const CATEGORIES = { AI: '#007FFF' };\n");
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  put(root, target, source); put(root, 'src/content/blog/original-post/old.svg', '<svg/>');
  return root;
}
function request(changes: Record<string, unknown> = { title: 'Changed title' }, source = original) {
  return { version: 1, request_id: 'blog-update-example', resource: 'blog', operation: 'update',
    target: { path: target }, baseline: { sha256: sha256(source) }, changes };
}
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
    { cwd: root, encoding: 'utf8', timeout: 20000 });
  return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null };
}
function plan(root: string, input = request()) {
  put(root, 'request.json', JSON.stringify(input));
  return run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/update.json']);
}
function apply(root: string, hash: string) {
  return run(root, ['apply', '--request', 'request.json', '--plan', '.content-ops/local/update.json', '--expect-plan', hash]);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('blog-update-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

it('제목만 수정하는 계획은 BOM·CRLF·주석·다른 필드·본문의 원래 바이트를 보존한다', () => {
  const root = fixture();
  const result = plan(root);
  expect(result.report).toMatchObject({ ok: true, status: 'planned' });
  expect(result.report.preview[0]).toMatchObject({ source: original.replace('"Original title"', '"Changed title"'), before: original });
  expect(readFileSync(join(root, target), 'utf8')).toBe(original);
});

it('계획 뒤 본문이 바뀌면 제목만 요청했어도 덮어쓰지 않는다', () => {
  const root = fixture(); const result = plan(root);
  expect(result.report.status).toBe('planned');
  put(root, target, original + 'Another editor\r\n');
  const before = snapshot(root);
  const applied = apply(root, result.report.plan.plan_hash);
  expect(applied.report).toMatchObject({ ok: false, diagnostics: [{ rule: 'baseline.conflict' }], written: [] });
  expect(snapshot(root)).toEqual(before);
});

function planned(root: string, input: unknown = request()) {
  const result = planBlogUpdate(root, input);
  if (!('plan' in result) || !result.plan) throw new Error('Expected plan');
  return result.plan;
}
function read(root: string) { return readFileSync(join(root, target), 'utf8'); }

it('부분 수정 적용은 제목과 최소 완료 기록만 쓰고 기존 이미지·입력 파일을 보존한다', () => {
  const root = fixture(); put(root, 'notes.txt', 'User notes');
  const before = snapshot(root); const input = request(); const proposal = planned(root, input);
  expect(applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toMatchObject({ status: 'applied',
    written: [target, '.content-ops/receipts/blog-update-example.json'] });
  expect(read(root)).toBe(original.replace('"Original title"', '"Changed title"'));
  const after = snapshot(root);
  for (const [path, file] of Object.entries(before)) if (path !== relative(root, join(root, target))) expect(after[path]).toEqual(file);
  const receipt = JSON.parse(readFileSync(join(root, '.content-ops/receipts/blog-update-example.json'), 'utf8'));
  expect(receipt).toMatchObject({ plan_hash: proposal.plan_hash, result: 'applied', files: proposal.files });
  expect(JSON.stringify(receipt)).not.toContain('Changed title');
});

it('같은 계획 적용·재계획은 파일 목록·바이트·mtime을 바꾸지 않는다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  applyBlogUpdate(root, input, proposal, proposal.plan_hash);
  const before = snapshot(root);
  expect(applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(planBlogUpdate(root, input)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('기록이 없어도 원하는 제목이 반영됐으면 오래된 기준과 다른 본문을 그대로 두고 쓰기 없이 끝낸다', () => {
  const source = original.replace('"Original title"', "'Changed title'") + 'Another edit\r\n';
  const root = fixture(source); const before = snapshot(root);
  expect(planBlogUpdate(root, request())).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('기록 없이 이미 반영된 계획을 적용해도 추가 쓰기·완료 기록을 만들지 않는다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  put(root, target, original.replace('"Original title"', '"Changed title"'));
  const before = snapshot(root);
  expect(applyBlogUpdate(root, input, proposal, proposal.plan_hash).status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('기준이 다른데 아직 요청 값이 적용되지 않았으면 계획 단계부터 실패한다', () => {
  const root = fixture(original + 'External change\r\n'); const before = snapshot(root);
  expect(() => planBlogUpdate(root, request())).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('기존 대상이 없으면 신규 생성으로 바꾸지 않는다', () => {
  const root = fixture(); rmSync(join(root, target)); const before = snapshot(root);
  expect(() => planBlogUpdate(root, request())).toThrow('[target.missing]');
  expect(snapshot(root)).toEqual(before);
});

it('완료 기록 뒤 요청 밖 본문만 바뀌어도 성공으로 오인하지 않는다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  applyBlogUpdate(root, input, proposal, proposal.plan_hash);
  put(root, target, read(root) + 'External edit\r\n'); const before = snapshot(root);
  expect(() => planBlogUpdate(root, input)).toThrow('[receipt.state-mismatch]');
  expect(snapshot(root)).toEqual(before);
});

it('완료한 요청 ID를 다른 수정 내용으로 재사용하면 충돌한다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  applyBlogUpdate(root, input, proposal, proposal.plan_hash); const before = snapshot(root);
  expect(() => planBlogUpdate(root, request({ title: 'Another title' }))).toThrow('[request.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('변조 후 지문을 다시 만든 계획도 실제 요청 결과와 대조해 거절한다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  const forged = createOperationPlan(input, proposal.files.map((file: { path: string; before_sha256: string | null; after_sha256: string }) => ({ ...file, after_sha256: sha256('forged') })));
  const before = snapshot(root);
  expect(() => applyBlogUpdate(root, input, forged, forged.plan_hash)).toThrow('[plan.changed]');
  expect(snapshot(root)).toEqual(before);
});

it('다른 기대 지문이나 계획 이후 바꾼 입력으로 적용하지 않는다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input); const before = snapshot(root);
  expect(() => applyBlogUpdate(root, input, proposal, '0'.repeat(64))).toThrow('[plan.changed]');
  expect(() => applyBlogUpdate(root, request({ title: 'Another title' }), proposal, proposal.plan_hash)).toThrow('[request.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('태그·본문의 명시적 빈 값은 교체하고 생략 필드는 보존한다', () => {
  const source = patchBlogSource(Buffer.from(original), { tags: [], body: '' }, target);
  expect(source).toBe(original.replace('  - first\r\n  - second\r\n', '  []\r\n').replace('Original body ![image](./old.svg)\r\n', ''));
});

it('태그 순서는 의미 있는 차이로 취급하고 다른 값은 그대로 둔다', () => {
  const source = patchBlogSource(Buffer.from(original), { tags: ['second', 'first'] }, target);
  expect(source).toBe(original.replace('  - first\r\n  - second\r\n', '  ["second","first"]\r\n'));
});

it('날짜·초안·선택 필드의 명시적 수정은 지정한 값만 반영한다', () => {
  const source = patchBlogSource(Buffer.from(original), { pubDate: '2024-02-29', draft: false, readingTime: '5 min' }, target);
  expect(source).toBe(original.replace('2020-02-29', '"2024-02-29"').replace('draft: true', 'draft: false').replace('extra: keep-me', 'extra: keep-me\r\nreadingTime: "5 min"'));
});

it('생략된 기본값과 같은 요청은 선택 필드를 삽입하지 않는다', () => {
  const source = original.replace('draft: true\r\n', '').replace('tags:\r\n  - first\r\n  - second\r\n', '');
  const root = fixture(source); const input = request({ draft: false, tags: [] }, source); const before = snapshot(root);
  expect(planBlogUpdate(root, input).status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('인용된 키·블록 문자열·인라인 주석을 값 범위에 맞춰 수정한다', () => {
  const source = original.replace('title: "Original title" # Keep comment', '"title": >-\r\n  Original title');
  expect(patchBlogSource(Buffer.from(source), { title: 'Changed title' }, target))
    .toBe(original.replace('title: "Original title" # Keep comment', '"title": "Changed title"'));
});

it('새 제목의 따옴표·콜론·개행은 YAML 문자열로 안전하게 인코딩한다', () => {
  const title = 'Title: "quote"\nNext';
  expect(patchBlogSource(Buffer.from(original), { title }, target))
    .toBe(original.replace('"Original title"', JSON.stringify(title)));
});

it('요청 밖 앵커·별칭은 보존하고 앵커 원본의 변경은 추측하지 않는다', () => {
  const anchored = original.replace('title: "Original title"', 'title: &heading "Original title"').replace('description: Original description', 'description: *heading');
  expect(() => patchBlogSource(Buffer.from(anchored), { title: 'Changed title' }, target)).toThrow('[patch.unsupported]');
  expect(patchBlogSource(Buffer.from(anchored), { draft: false }, target)).toBe(anchored.replace('draft: true', 'draft: false'));
});

it('별칭을 가리키는 필드 자체 수정은 앵커 원본을 바꾸지 않는다', () => {
  const aliased = original.replace('title: "Original title" # Keep comment\r\ndescription: Original description',
    'description: &description Original description\r\ntitle: *description # Keep comment');
  expect(patchBlogSource(Buffer.from(aliased), { title: 'Changed title' }, target)).toBe(aliased.replace('*description', '"Changed title"'));
});

it('흐름 매핑은 본문 수정만 허용하고 메타데이터 재작성은 거절한다', () => {
  const source = '---\n{title: Old, description: Desc, category: AI, pubDate: 2020-01-01}\n---\nBody';
  expect(patchBlogSource(Buffer.from(source), { body: 'New body' }, target)).toBe(source.replace('Body', 'New body'));
  expect(() => patchBlogSource(Buffer.from(source), { title: 'New title' }, target)).toThrow('[patch.unsupported]');
});

it('잘못된 원문·UTF-8·요청 값은 쓰기 전에 실패한다', () => {
  const root = fixture(); const before = snapshot(root);
  for (const changes of [{ title: '' }, { pubDate: '2023-02-29' }, { tags: null }, { unknown: true }]) {
    expect(() => planBlogUpdate(root, request(changes))).toThrow();
  }
  expect(snapshot(root)).toEqual(before);
  expect(() => patchBlogSource(Buffer.from([0xff, 0xfe]), { title: 'New' }, target)).toThrow('[content.invalid]');
});

it('미등록 카테고리 또는 남은 치환 표시로 바꾸면 파일을 쓰지 않는다', () => {
  const root = fixture(); const before = snapshot(root);
  expect(() => planBlogUpdate(root, request({ category: 'Unknown' }))).toThrow('[content.invalid]');
  expect(() => planBlogUpdate(root, request({ body: '{{PENDING}}' }))).toThrow('[content.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 정책 설정이 바뀌어도 적용 직전에 다시 검사한다', () => {
  const root = fixture(); const input = request(); const proposal = planned(root, input);
  put(root, 'src/consts.ts', "export const CATEGORIES = { Other: '#fff' };\n"); const before = snapshot(root);
  expect(() => applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toThrow('[content.invalid]');
  expect(snapshot(root)).toEqual(before);
});

it('기존 미등록 카테고리의 정확한 예외는 제목 수정 중 보존한다', () => {
  const source = original.replace('category: AI', 'category: Infra'); const root = fixture(source);
  put(root, 'config/content-policy-baseline.json', JSON.stringify({ version: 1, exceptions: [{ rule: 'category.unregistered', path: target, value: 'Infra' }] }));
  const input = request({ title: 'Changed title' }, source); const proposal = planned(root, input);
  applyBlogUpdate(root, input, proposal, proposal.plan_hash);
  expect(read(root)).toBe(source.replace('"Original title"', '"Changed title"'));
});

it('기존 글 수정과 명시한 새 자산 추가를 같은 계획·완료 기록으로 묶는다', () => {
  const root = fixture(); const bytes = Buffer.from([0, 255, 1, 8]); put(root, 'input/new.bin', bytes);
  const input = { ...request({ body: 'New body ![new](./new.bin)\n' }), assets: [{ source: 'input/new.bin', target: 'src/content/blog/original-post/new.bin', sha256: sha256(bytes) }] };
  const proposal = planned(root, input); expect(proposal.files).toHaveLength(2);
  expect(applyBlogUpdate(root, input, proposal, proposal.plan_hash).written).toHaveLength(3);
  expect(readFileSync(join(root, input.assets[0].target))).toEqual(bytes);
  expect(read(root)).toBe(original.replace('Original body ![image](./old.svg)\r\n', 'New body ![new](./new.bin)\n'));
  rmSync(join(root, 'input/new.bin')); const before = snapshot(root);
  expect(planBlogUpdate(root, input).status).toBe('unchanged'); expect(snapshot(root)).toEqual(before);
});

it('본문이 같고 새 자산만 추가할 때는 기존 글의 mtime도 보존한다', () => {
  const root = fixture(); put(root, 'input/new.svg', '<svg/>'); const input = { ...request({ title: 'Original title' }),
    assets: [{ source: 'input/new.svg', target: 'src/content/blog/original-post/new.svg', sha256: sha256('<svg/>') }] };
  const before = statSync(join(root, target)).mtimeMs; const proposal = planned(root, input);
  expect(applyBlogUpdate(root, input, proposal, proposal.plan_hash).written).not.toContain(target);
  expect(statSync(join(root, target)).mtimeMs).toBe(before);
});

it('추가 자산이 이미 다른 내용이거나 계획 후 입력 바이트가 바뀌면 기존 글을 쓰지 않는다', () => {
  const root = fixture(); put(root, 'input/new.svg', '<svg/>'); const input = { ...request(),
    assets: [{ source: 'input/new.svg', target: 'src/content/blog/original-post/new.svg', sha256: sha256('<svg/>') }] };
  const proposal = planned(root, input); put(root, 'input/new.svg', 'Changed'); const before = snapshot(root);
  expect(() => applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toThrow('[asset.changed]');
  expect(snapshot(root)).toEqual(before);
  put(root, input.assets[0].target, 'Existing');
  expect(() => planBlogUpdate(root, input)).toThrow('[baseline.conflict]');
});

it('파일 교체 함수도 실제 바이트 기준을 확인해 오래된 쓰기를 거절한다', () => {
  const root = fixture(); const before = snapshot(root);
  expect(() => replaceOperationFile(root, target, Buffer.from('Changed'), sha256('Old'))).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('CLI의 수정 계획·적용·재실행은 실제 파일까지 같은 결과를 확인한다', () => {
  const root = fixture(); const result = plan(root);
  expect(result.report.status).toBe('planned');
  const applied = apply(root, result.report.plan.plan_hash);
  expect(applied.status).toBe(0); expect(applied.report.status).toBe('applied');
  const before = snapshot(root);
  expect(apply(root, result.report.plan.plan_hash).report).toMatchObject({ status: 'unchanged', written: [] });
  expect(run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/update.json']).report.status).toBe('unchanged');
  expect(snapshot(root)).toEqual(before);
});

it('같은 원문에서 준비한 두 수정 계획 중 먼저 적용된 결과를 후속 계획이 덮어쓰지 않는다', () => {
  const root = fixture(); const first = request();
  const second = { ...request({ description: 'Second editor description' }), request_id: 'second-editor' };
  const firstPlan = planned(root, first); const secondPlan = planned(root, second);
  applyBlogUpdate(root, first, firstPlan, firstPlan.plan_hash); const before = snapshot(root);
  expect(() => applyBlogUpdate(root, second, secondPlan, secondPlan.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('제목만 원하는 값이어도 요청한 자산이 빠진 부분 결과는 완료로 오인하지 않는다', () => {
  const root = fixture(); put(root, 'input/new.svg', '<svg/>'); const input = { ...request(),
    assets: [{ source: 'input/new.svg', target: 'src/content/blog/original-post/new.svg', sha256: sha256('<svg/>') }] };
  const proposal = planned(root, input); put(root, target, original.replace('"Original title"', '"Changed title"'));
  const before = snapshot(root);
  expect(() => applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toThrow('[baseline.conflict]');
  expect(snapshot(root)).toEqual(before);
});

it('계획 이후 대상 폴더가 링크로 바뀌면 저장소 밖 원문을 교체하지 않는다', () => {
  const root = fixture(); const outside = fixture(); const input = request(); const proposal = planned(root, input);
  const folder = dirname(join(root, target)); renameSync(folder, join(root, 'held-post'));
  symlinkSync(dirname(join(outside, target)), folder, process.platform === 'win32' ? 'junction' : 'dir');
  const before = snapshot(outside);
  expect(() => applyBlogUpdate(root, input, proposal, proposal.plan_hash)).toThrow('[path.symlink]');
  expect(snapshot(outside)).toEqual(before);
});

it('사람용 CLI는 수정 전후 원문과 수정 대상 경로를 표시한다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(request()));
  const result = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), 'plan', '--request', 'request.json',
    '--out', '.content-ops/local/update.json', '--root', root], { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(`[수정 예정] ${target}`);
  expect(result.stdout).toContain('- title: "Original title"');
  expect(result.stdout).toContain('+ title: "Changed title"');
});
