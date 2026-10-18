import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyBlogCreate, planBlogCreate } from '../../src/lib/content-blog-create.mjs';
import { createOperationPlan, sha256 } from '../../src/lib/content-operation-contract.mjs';
import { createOperationFile } from '../../src/lib/content-operation-write.mjs';

const base = fileURLToPath(new URL('../../.fragment-test/', import.meta.url));
const roots: string[] = [];
const request = () => ({ version: 1, request_id: 'blog-create-example', resource: 'blog', operation: 'create',
  target: { path: 'src/content/blog/new-post/index.md' }, baseline: { sha256: null },
  content: { source: '---\ntitle: New post\ndescription: Test post\ncategory: AI\npubDate: 2026-10-18\ndraft: true\n---\nBody\n' } });
function put(root: string, path: string, source: string | Buffer) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
}
function fixture() {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'blog-create-'));
  roots.push(root);
  for (const directory of ['src/content/blog', 'src/content/fragments']) mkdirSync(join(root, directory), { recursive: true });
  put(root, 'src/consts.ts', "export const CATEGORIES = { AI: '#007FFF' };\n");
  put(root, 'config/content-policy-baseline.json', '{"version":1,"exceptions":[]}\n');
  return root;
}
function snapshot(root: string) {
  const files: Record<string, { bytes: string; mtime: number }> = {};
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = { bytes: readFileSync(path).toString('base64'), mtime: statSync(path).mtimeMs };
    }
  };
  visit(root);
  return files;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(base, root);
    if (child.startsWith('..') || !child.startsWith('blog-create-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
it('글 생성 계획은 파일을 쓰지 않고 확정 원문의 결과 지문을 반환한다', () => {
  const root = fixture(); const before = snapshot(root);
  const result = planBlogCreate(root, request());
  expect(result).toMatchObject({ status: 'planned', plan: { request_id: request().request_id,
    files: [expect.objectContaining({ path: request().target.path, before_sha256: null })] } });
  expect(snapshot(root)).toEqual(before);
});

it('같은 경로의 다른 글을 신규 생성으로 덮어쓰지 않는다', () => {
  const root = fixture(); const input = request();
  put(root, input.target.path, input.content.source.replace('Body', 'Existing body'));
  const before = snapshot(root);
  expect(() => planBlogCreate(root, input)).toThrow('target.conflict');
  expect(snapshot(root)).toEqual(before);
});

it('등록되지 않은 카테고리의 글을 새 계획으로 허용하지 않는다', () => {
  const input = request(); input.content.source = input.content.source.replace('category: AI', 'category: Unknown');
  expect(() => planBlogCreate(fixture(), input)).toThrow('content.invalid');
});

it('확인한 계획으로 글과 최소 완료 기록만 추가한다', () => {
  const root = fixture(); const input = request(); const result = planBlogCreate(root, input);
  if (!('plan' in result)) throw new Error('Expected plan');
  expect(applyBlogCreate(root, input, result.plan, result.plan.plan_hash)).toMatchObject({ status: 'applied',
    written: [input.target.path, `.content-ops/receipts/${input.request_id}.json`] });
  expect(readFileSync(join(root, input.target.path), 'utf8')).toBe(input.content.source);
});

it('기본값 생략과 YAML 순서만 다른 기존 글은 재직렬화하지 않는다', () => {
  const root = fixture(); const input = request();
  const existing = '---\npubDate: 2026-10-18\ncategory: AI\ndescription: Test post\ntitle: New post\ndraft: true\ntags: []\n---\nBody\n';
  put(root, input.target.path, existing);
  const before = snapshot(root);
  expect(planBlogCreate(root, input)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

const repository = fileURLToPath(new URL('../../', import.meta.url));
function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), ...args, '--root', root, '--json'],
    { cwd: root, encoding: 'utf8', timeout: 20000 });
}
it('plan CLI는 글을 쓰지 않고 지정한 로컬 계획 파일만 만든다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(request()));
  const result = run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json']);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'planned', plan_saved: true });
  expect(Object.keys(snapshot(root)).map(path => path.replaceAll('\\', '/'))).not.toContain(request().target.path);
});

function planned(root: string, input: unknown = request()) {
  const result = planBlogCreate(root, input);
  if (!('plan' in result) || !result.plan) throw new Error('Expected plan');
  return result.plan;
}

it('확정한 글·바이너리 자산·최소 기록만 추가하고 원래 파일을 보존한다', () => {
  const root = fixture(); const image = Buffer.from([0, 255, 1, 2, 128]);
  put(root, 'input/asset.bin', image); put(root, 'notes/preserve.txt', 'User data');
  const input = { ...request(), assets: [{ source: 'input/asset.bin', target: 'src/content/blog/new-post/asset.bin', sha256: sha256(image) }] };
  const before = snapshot(root); const plan = planned(root, input);
  const result = applyBlogCreate(root, input, plan, plan.plan_hash);
  expect(result.status).toBe('applied');
  expect(result.written).toEqual([input.target.path, input.assets[0].target, `.content-ops/receipts/${input.request_id}.json`]);
  expect(readFileSync(join(root, input.assets[0].target))).toEqual(image);
  expect(readFileSync(join(root, input.target.path), 'utf8')).toBe(input.content.source);
  const after = snapshot(root);
  for (const [path, value] of Object.entries(before)) expect(after[path]).toEqual(value);
  expect(Object.keys(after)).toHaveLength(Object.keys(before).length + 3);
  const receipt = JSON.parse(readFileSync(join(root, result.written.at(-1)!), 'utf8'));
  expect(receipt.files).toHaveLength(2);
  expect(receipt.plan_hash).toBe(plan.plan_hash);
  expect(receipt).not.toHaveProperty('content');
});

it('계획·적용 재실행에서 파일 목록·바이트·수정 시각과 기록이 그대로다', () => {
  const root = fixture(); const input = request(); const plan = planned(root, input);
  applyBlogCreate(root, input, plan, plan.plan_hash);
  const before = snapshot(root);
  expect(planBlogCreate(root, input)).toMatchObject({ status: 'unchanged', written: [] });
  expect(applyBlogCreate(root, input, plan, plan.plan_hash)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('기록 없이 이미 같은 글이 있으면 새 ID·파일·기록 없이 변경 없음으로 끝낸다', () => {
  const root = fixture(); const input = request(); put(root, input.target.path, input.content.source);
  const before = snapshot(root);
  expect(planBlogCreate(root, input)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('계획 지문만 다시 계산한 다른 결과 파일도 확정 요청과 대조해 거절한다', () => {
  const root = fixture(); const input = request();
  const forged = createOperationPlan(input, [{ path: input.target.path, before_sha256: null, after_sha256: sha256('Other content') }]);
  const before = snapshot(root);
  expect(() => applyBlogCreate(root, input, forged, forged.plan_hash)).toThrow('plan.changed');
  expect(snapshot(root)).toEqual(before);
});

it('기대 계획 지문이나 확정 요청을 바꾸면 쓰기 전에 거절한다', () => {
  const root = fixture(); const input = request(); const plan = planned(root, input); const before = snapshot(root);
  expect(() => applyBlogCreate(root, input, plan, 'f'.repeat(64))).toThrow('plan.changed');
  expect(() => applyBlogCreate(root, { ...input, content: { source: input.content.source + 'Changed' } }, plan, plan.plan_hash)).toThrow('request.conflict');
  expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 대상이 생기거나 등록 정보가 바뀌면 덮어쓰지 않는다', () => {
  const root = fixture(); const input = request(); const plan = planned(root, input);
  put(root, 'src/consts.ts', "export const CATEGORIES = { Other: '#123456' };\n");
  const changedRegistry = snapshot(root);
  expect(() => applyBlogCreate(root, input, plan, plan.plan_hash)).toThrow('content.invalid');
  expect(snapshot(root)).toEqual(changedRegistry);
  put(root, input.target.path, 'Other editor content'); const changedTarget = snapshot(root);
  expect(() => applyBlogCreate(root, input, plan, plan.plan_hash)).toThrow('target.conflict');
  expect(snapshot(root)).toEqual(changedTarget);
});

it('계획 뒤 자산 입력이 바뀌면 일부 콘텐츠도 추가하지 않는다', () => {
  const root = fixture(); put(root, 'input/asset.bin', 'Original');
  const input = { ...request(), assets: [{ source: 'input/asset.bin', target: 'src/content/blog/new-post/asset.bin', sha256: sha256('Original') }] };
  const plan = planned(root, input); put(root, 'input/asset.bin', 'Changed'); const before = snapshot(root);
  expect(() => applyBlogCreate(root, input, plan, plan.plan_hash)).toThrow('asset.changed');
  expect(snapshot(root)).toEqual(before);
});

it('완료 기록 이후 실제 글이 바뀌면 재실행 완료로 오인하지 않는다', () => {
  const root = fixture(); const input = request(); const plan = planned(root, input);
  applyBlogCreate(root, input, plan, plan.plan_hash);
  put(root, input.target.path, input.content.source + 'External edit'); const before = snapshot(root);
  expect(() => applyBlogCreate(root, input, plan, plan.plan_hash)).toThrow('receipt.state-mismatch');
  expect(snapshot(root)).toEqual(before);
});

it('BOM·CRLF·본문·날짜·초안 값을 받은 바이트 그대로 추가한다', () => {
  const root = fixture(); const input = request(); input.content.source = '\uFEFF' + input.content.source.replaceAll('\n', '\r\n');
  const plan = planned(root, input); applyBlogCreate(root, input, plan, plan.plan_hash);
  expect(readFileSync(join(root, input.target.path))).toEqual(Buffer.from(input.content.source, 'utf8'));
});

it('새 파일 쓰기 경로 자체도 기존 파일 덮어쓰기를 거절한다', () => {
  const root = fixture(); put(root, 'keep.txt', 'Original');
  expect(() => createOperationFile(root, 'keep.txt', 'Other')).toThrow('write.failed');
  expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('Original');
});

it('본문이 같아도 요청 자산 일부가 빠져 있으면 새 생성으로 덮어쓰지 않는다', () => {
  const root = fixture(); const input = { ...request(), assets: [{ source: 'input/a.bin', target: 'src/content/blog/new-post/a.bin', sha256: sha256('A') }] };
  put(root, input.target.path, input.content.source); const before = snapshot(root);
  expect(() => planBlogCreate(root, input)).toThrow('target.conflict');
  expect(snapshot(root)).toEqual(before);
});

it('다른 종류·수정 요청을 이 신규 글 어댑터에서 처리하지 않는다', () => {
  const root = fixture(); const before = snapshot(root);
  const category = { version: 1, request_id: 'category-request', resource: 'category', operation: 'create',
    target: { path: 'src/consts.ts', key: 'New' }, baseline: { sha256: sha256(readFileSync(join(root, 'src/consts.ts'))) }, content: { color: '#123456' } };
  expect(() => planBlogCreate(root, category)).toThrow('operation.unsupported');
  expect(snapshot(root)).toEqual(before);
});

it('CLI 계획의 재실행은 계획 파일까지 다시 쓰지 않는다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(request()));
  const args = ['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json'];
  expect(run(root, args).status).toBe(0); const before = snapshot(root);
  const repeated = run(root, args);
  expect(repeated.status).toBe(0); expect(JSON.parse(repeated.stdout).plan_saved).toBe(false);
  expect(snapshot(root)).toEqual(before);
});

it('CLI에서 계획·적용·재실행을 끝까지 수행한다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(request()));
  const prepared = run(root, ['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json']);
  expect(prepared.status).toBe(0); const hash = JSON.parse(prepared.stdout).plan.plan_hash;
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/plan.json', '--expect-plan', hash];
  const applied = run(root, args); expect(applied.status).toBe(0); expect(JSON.parse(applied.stdout).status).toBe('applied');
  const before = snapshot(root); const repeated = run(root, args);
  expect(repeated.status).toBe(0); expect(JSON.parse(repeated.stdout)).toMatchObject({ status: 'unchanged', written: [] });
  expect(snapshot(root)).toEqual(before);
});

it('CLI는 기존 계획을 다른 입력으로 조용히 교체하지 않는다', () => {
  const root = fixture(); const input = request(); put(root, 'request.json', JSON.stringify(input));
  const args = ['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json'];
  expect(run(root, args).status).toBe(0);
  input.content.source += 'Changed'; put(root, 'request.json', JSON.stringify(input)); const before = snapshot(root);
  const result = run(root, args); expect(result.status).toBe(1);
  expect(JSON.parse(result.stdout).diagnostics[0].rule).toBe('request.conflict');
  expect(snapshot(root)).toEqual(before);
});

it('CLI는 승인 플래그·누락된 계획 지문·미지원 명령을 거절한다', () => {
  const root = fixture();
  for (const args of [['publish'], ['apply', '--request', 'request.json', '--plan', '.content-ops/local/plan.json'],
    ['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json', '--approved']]) {
    const result = run(root, args); expect(result.status).toBe(2);
    expect(result.stderr).toBe(''); expect(JSON.parse(result.stdout).diagnostics[0].rule).toBe('command.invalid');
  }
});

it('새 글을 추가할 때 기존 Fragment의 끊어진 관계도 검사한다', () => {
  const root = fixture();
  put(root, 'src/content/fragments/card.md', '---\nid: card-a\ntitle: Card\nsummary: Summary\ncategory: AI\nrelations:\n  - target: missing-card\n    type: related\n---\nBody\n');
  const before = snapshot(root);
  expect(() => planBlogCreate(root, request())).toThrow('fragment.missing-target');
  expect(snapshot(root)).toEqual(before);
});

it('계획 뒤 생성 폴더가 외부 링크로 바뀌면 밖에 파일을 추가하지 않는다', () => {
  const root = fixture(); const outside = fixture(); const input = request(); const plan = planned(root, input);
  symlinkSync(outside, join(root, 'src/content/blog/new-post'), 'junction');
  const before = snapshot(outside);
  expect(() => applyBlogCreate(root, input, plan, plan.plan_hash)).toThrow('path.symlink');
  expect(snapshot(outside)).toEqual(before);
});

it('사람용 CLI는 계획 원문·파일 경로·적용 단계·추가 쓰기 없음을 설명한다', () => {
  const root = fixture(); put(root, 'request.json', JSON.stringify(request()));
  const execute = (args: string[]) => spawnSync(process.execPath,
    [join(repository, 'scripts/content-ops.mjs'), ...args, '--root', root], { cwd: root, encoding: 'utf8', timeout: 20000 });
  const prepared = execute(['plan', '--request', 'request.json', '--out', '.content-ops/local/plan.json']);
  expect(prepared.status).toBe(0);
  expect(prepared.stdout).toContain('계획 준비'); expect(prepared.stdout).toContain('+ title: New post');
  expect(prepared.stdout).toContain('콘텐츠는 아직 적용하지 않음');
  const plan = JSON.parse(readFileSync(join(root, '.content-ops/local/plan.json'), 'utf8'));
  const args = ['apply', '--request', 'request.json', '--plan', '.content-ops/local/plan.json', '--expect-plan', plan.plan_hash];
  const applied = execute(args); expect(applied.status).toBe(0); expect(applied.stdout).toContain('로컬 적용 완료');
  const repeated = execute(args); expect(repeated.status).toBe(0); expect(repeated.stdout).toContain('추가 쓰기 0건');
});

it('CLI 입력 파일 누락은 스택 추적문 없이 실패하고 도움말은 성공 종료한다', () => {
  const root = fixture();
  const missing = run(root, ['plan', '--request', 'missing.json', '--out', '.content-ops/local/plan.json']);
  expect(missing.status).toBe(1); expect(missing.stderr).toBe('');
  expect(JSON.parse(missing.stdout).diagnostics[0].rule).toBe('input.unreadable');
  const help = spawnSync(process.execPath, [join(repository, 'scripts/content-ops.mjs'), '--help'], { encoding: 'utf8', timeout: 20000 });
  expect(help.status).toBe(0); expect(help.stdout).toContain('--expect-plan');
});
