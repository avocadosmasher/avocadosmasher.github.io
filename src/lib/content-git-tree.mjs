import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationContractError } from './content-operation-contract.mjs';
import { resolveOperationPath } from './content-operation-input.mjs';
import { createOperationFile } from './content-operation-write.mjs';
import { checkContentRepository } from './content-repository-check.mjs';

const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const git = (root, args, input) => execFileSync('git', ['--no-replace-objects', ...args],
  { cwd: root, input, maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const fail = (field, message) => { throw new OperationContractError('git.snapshot', field, message); };
function relevant(path) {
  const lower = path.toLowerCase();
  return ['src/consts.ts', 'config/content-policy-baseline.json', 'src/content/blog', 'src/content/fragments'].includes(lower)
    || lower.startsWith('src/content/blog/') || lower.startsWith('src/content/fragments/');
}
function needsBytes(path) {
  return path === 'src/consts.ts' || path === 'config/content-policy-baseline.json'
    || (path.startsWith('src/content/blog/') && path.endsWith('/index.md'))
    || (path.startsWith('src/content/fragments/') && path.endsWith('.md'));
}
function entriesForTree(root, tree) {
  if (!oidPattern.test(tree)) fail('tree', '명확한 Git tree 지문이 필요합니다.');
  const listing = new TextDecoder('utf-8', { fatal: true }).decode(git(root, ['ls-tree', '-r', '-z', '--full-tree', tree]));
  return listing.split('\0').filter(Boolean).map(line => {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(line);
    if (!match || !oidPattern.test(match[3])) fail('tree', 'Git 항목을 해석할 수 없습니다.');
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  }).filter(entry => relevant(entry.path));
}
function readBlobs(root, entries) {
  const oids = [...new Set(entries.filter(entry => needsBytes(entry.path)).map(entry => entry.oid))];
  if (!oids.length) return new Map();
  const output = git(root, ['cat-file', '--batch'], oids.join('\n') + '\n');
  const blobs = new Map(); let offset = 0;
  for (const oid of oids) {
    const end = output.indexOf(10, offset);
    const header = output.subarray(offset, end).toString('ascii');
    const match = /^([a-f0-9]+) blob (\d+)$/.exec(header);
    if (end < 0 || !match || match[1] !== oid) fail('blob', 'Git 파일 바이트를 읽을 수 없습니다.');
    const size = Number(match[2]); const start = end + 1; const next = start + size;
    if (!Number.isSafeInteger(size) || next >= output.length || output[next] !== 10) fail('blob', 'Git 파일 바이트 길이가 다릅니다.');
    blobs.set(oid, output.subarray(start, next)); offset = next + 1;
  }
  if (offset !== output.length) fail('blob', '예상하지 않은 Git 파일 응답입니다.');
  return blobs;
}
export function checkContentGitTree(root, tree) {
  const entries = entriesForTree(root, tree);
  for (const entry of entries) {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      fail(entry.path, '콘텐츠 검사 경로의 Git 링크·submodule은 지원하지 않습니다.');
    }
  }
  const blobs = readBlobs(root, entries);
  const temporaryRoot = resolve(tmpdir());
  const snapshot = mkdtempSync(join(temporaryRoot, 'blog-content-gate-'));
  try {
    for (const entry of entries) {
      const target = resolveOperationPath(snapshot, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      if (needsBytes(entry.path)) createOperationFile(snapshot, entry.path, blobs.get(entry.oid));
    }
    return { ...checkContentRepository(snapshot), tree };
  } finally {
    // 이 호출이 만든 임시 디렉터리 하나만 제거함. 실제 저장소·인덱스·사용자 파일은 수정하지 않음.
    if (dirname(resolve(snapshot)) !== temporaryRoot || !basename(snapshot).startsWith('blog-content-gate-')) {
      fail('snapshot', '임시 폴더 경계가 다릅니다. 자동 정리하지 않습니다.');
    }
    rmSync(snapshot, { recursive: true, force: true });
  }
}
