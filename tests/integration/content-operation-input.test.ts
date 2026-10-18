import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectOperationRequest, parseOperationJson, resolveOperationPath } from '../../src/lib/content-operation-input.mjs';
import { createOperationPlan, createOperationReceipt, sha256 } from '../../src/lib/content-operation-contract.mjs';

const sandbox = fileURLToPath(new URL('../../.fragment-test/', import.meta.url));
const roots: string[] = [];
function fixture() {
  mkdirSync(sandbox, { recursive: true });
  const root = mkdtempSync(join(sandbox, 'operation-contract-'));
  roots.push(root);
  return root;
}
function put(root: string, path: string, value: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const child = relative(sandbox, root);
    if (child.startsWith('..') || !child.startsWith('operation-contract-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
it('대상 경로의 상위 폴더 탈출을 거절한다', () => {
  expect(() => resolveOperationPath(fixture(), '../outside.md')).toThrow('path.invalid');
});

it('기존 폴더의 junction을 통해 저장소 밖으로 접근하는 것을 거절한다', () => {
  const root = fixture();
  const outside = fixture();
  symlinkSync(outside, join(root, 'linked'), 'junction');
  expect(() => resolveOperationPath(root, 'linked/new.md')).toThrow('path.symlink');
});

const request = () => ({ version: 1, request_id: 'inspect-create', resource: 'blog', operation: 'create',
  target: { path: 'src/content/blog/example/index.md' }, baseline: { sha256: null },
  content: { source: '---\ntitle: Example\ndescription: Example\ncategory: AI\npubDate: 2026-10-18\n---\nBody\n' } });

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

it.each(['/outside.md', 'C:/outside.md', 'C:\\outside.md', '//server/share', 'a/../b', 'a/./b', 'a//b',
  'a/NUL.txt', 'a/CON', 'a/name.', 'a/name ', 'a/file:stream', 'a/*.md', 'a/file\u0000.md'])('모호하거나 안전하지 않은 경로를 거절한다: %s', path => {
  expect(() => resolveOperationPath(fixture(), path)).toThrow('path.invalid');
});
it('없는 신규 대상 경로는 폴더를 만들지 않고 확인한다', () => {
  const root = fixture(); const input = request();
  const before = snapshot(root);
  expect(resolveOperationPath(root, input.target.path)).toBe(join(root, input.target.path));
  const result = inspectOperationRequest(root, input);
  expect(result).toMatchObject({ status: 'ready', observed: { [input.target.path]: null } });
  expect(inspectOperationRequest(root, input)).toEqual(result);
  expect(snapshot(root)).toEqual(before);
});
it('파일을 경유한 하위 경로와 대소문자 별칭을 거절한다', () => {
  const root = fixture();
  put(root, 'Input/value.txt', 'data');
  expect(() => resolveOperationPath(root, 'Input/value.txt/child')).toThrow('path.kind');
  expect(() => resolveOperationPath(root, 'input/value.txt')).toThrow('path.alias');
});
it('루트 자체가 링크인 경우도 거절한다', () => {
  const root = fixture(); const outside = fixture();
  symlinkSync(outside, join(root, 'alias'), 'junction');
  expect(() => resolveOperationPath(join(root, 'alias'), 'new.md')).toThrow('path.symlink');
});
it('현재 파일이 확정 기준과 다르면 로컬 변경을 덮어쓰지 않고 충돌로 반환한다', () => {
  const root = fixture(); const target = request().target;
  put(root, target.path, 'Other editor content');
  const input = { ...request(), operation: 'update', baseline: { sha256: sha256('Original') },
    changes: { title: 'Edited' } } as Record<string, unknown>;
  delete input.content;
  const before = snapshot(root);
  expect(() => inspectOperationRequest(root, input)).toThrow('baseline.conflict');
  expect(snapshot(root)).toEqual(before);
});
it('기존 대상과 새 자산의 기준을 바이트로 확인한다', () => {
  const root = fixture(); const input = { ...request(), assets: [{ source: 'input/image.bin',
    target: 'src/content/blog/example/image.bin', sha256: sha256('Image') }] };
  put(root, 'input/image.bin', 'Image');
  expect(inspectOperationRequest(root, input).status).toBe('ready');
  put(root, 'input/image.bin', 'Changed image');
  expect(() => inspectOperationRequest(root, input)).toThrow('asset.changed');
});
it('이미 있는 자산을 신규 추가로 덮어쓰지 않는다', () => {
  const root = fixture(); const input = { ...request(), assets: [{ source: 'input/image.bin',
    target: 'src/content/blog/example/image.bin', sha256: sha256('Image') }] };
  put(root, input.assets[0].source, 'Image');
  put(root, input.assets[0].target, 'Existing asset');
  expect(() => inspectOperationRequest(root, input)).toThrow('baseline.conflict');
  expect(readFileSync(join(root, input.assets[0].target), 'utf8')).toBe('Existing asset');
});
it('완료 기록과 실제 최종 바이트가 모두 맞아야 재실행을 인정한다', () => {
  const root = fixture(); const input = request(); const after = input.content.source;
  const plan = createOperationPlan(input, [{ path: input.target.path, before_sha256: null, after_sha256: sha256(after) }]);
  const receipt = createOperationReceipt(input, plan);
  put(root, input.target.path, after);
  put(root, `.content-ops/receipts/${input.request_id}.json`, JSON.stringify(receipt));
  const before = snapshot(root);
  expect(inspectOperationRequest(root, input).status).toBe('already-applied');
  expect(snapshot(root)).toEqual(before);
  expect(() => inspectOperationRequest(root, { ...input, content: { source: after + 'Changed' } })).toThrow('request.conflict');
  put(root, input.target.path, 'External change');
  expect(() => inspectOperationRequest(root, input)).toThrow('receipt.state-mismatch');
});
it('기록 폴더가 외부 링크이면 기록도 따라 읽지 않는다', () => {
  const root = fixture(); const outside = fixture();
  symlinkSync(outside, join(root, '.content-ops'), 'junction');
  expect(() => inspectOperationRequest(root, request())).toThrow('path.symlink');
});
it('설정 항목 생성도 기존 consts.ts 바이트를 기준으로 삼는다', () => {
  const root = fixture(); put(root, 'src/consts.ts', 'Original settings');
  const input = { version: 1, request_id: 'category-create', resource: 'category', operation: 'create',
    target: { path: 'src/consts.ts', key: 'NewCategory' }, baseline: { sha256: sha256('Original settings') }, content: { color: '#123456' } };
  expect(inspectOperationRequest(root, input).status).toBe('ready');
  put(root, 'src/consts.ts', 'Changed settings');
  expect(() => inspectOperationRequest(root, input)).toThrow('baseline.conflict');
});
it.each(['{', '{"version":1,"version":2}', '---\nversion: 1'])('요청·기록 JSON의 잘못된 문법과 중복 키를 거절한다: %s', source => {
  expect(() => parseOperationJson(source)).toThrow('input.json');
});

it('배포 경로 밖의 실제 요청 예시가 현재 계약을 통과한다', () => {
  const source = readFileSync(new URL('../../templates/ai-content/operation-request.example.json', import.meta.url), 'utf8');
  expect(inspectOperationRequest(fixture(), parseOperationJson(source)).status).toBe('ready');
});
