import { join, resolve } from 'node:path';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { OperationContractError, repositoryPath, assertOperationBaseline, checkOperationReceipt,
  operationTargets, parseOperationRequest, canonicalHash, sha256 } from './content-operation-contract.mjs';

export function resolveOperationPath(root, path) {
  if (!repositoryPath.safeParse(path).success) throw new OperationContractError('path.invalid', 'path', '정확한 저장소 상대 경로가 필요합니다.');
  const fail = (code, message) => { throw new OperationContractError(code, path, message); };
  let current = resolve(root);
  try {
    const rootInfo = lstatSync(current);
    if (rootInfo.isSymbolicLink()) fail('path.symlink', '저장소 루트의 링크는 지원하지 않습니다.');
    if (!rootInfo.isDirectory()) fail('path.kind', '저장소 루트는 실제 폴더여야 합니다.');
    const parts = path.split('/');
    for (const [index, part] of parts.entries()) {
      const names = readdirSync(current);
      if (names.some(name => name !== part && name.toLowerCase() === part.toLowerCase())) fail('path.alias', '대소문자만 다른 경로는 지원하지 않습니다.');
      current = join(current, part);
      let info;
      try { info = lstatSync(current); }
      catch (error) { if (error.code === 'ENOENT') return resolve(root, path); throw error; }
      if (info.isSymbolicLink()) fail('path.symlink', '링크나 junction을 경유할 수 없습니다.');
      if (index < parts.length - 1 && !info.isDirectory()) fail('path.kind', '중간 경로가 폴더가 아닙니다.');
    }
    return current;
  } catch (error) {
    if (error instanceof OperationContractError) throw error;
    fail('input.unreadable', `경로를 확인할 수 없습니다 (${error.code ?? 'UNKNOWN'}).`);
  }
}

function readBytes(root, path, missing = false) {
  const target = resolveOperationPath(root, path);
  try {
    if (!lstatSync(target).isFile()) throw new OperationContractError('path.kind', path, '일반 파일만 읽을 수 있습니다.');
    return readFileSync(target);
  } catch (error) {
    if (error instanceof OperationContractError) throw error;
    if (missing && error.code === 'ENOENT') return null;
    throw new OperationContractError('input.unreadable', path, `파일을 읽을 수 없습니다 (${error.code ?? 'UNKNOWN'}).`);
  }
}

export function parseOperationJson(source) {
  try {
    const value = JSON.parse(source);
    if (parseDocument(source, { uniqueKeys: true }).errors.length) throw new Error('Duplicate keys');
    return value;
  } catch { throw new OperationContractError('input.json', 'source', '중복 키 없는 JSON이 필요합니다.'); }
}

export function inspectOperationRequest(root, input) {
  const request = parseOperationRequest(input);
  const observed = Object.fromEntries(operationTargets(request).map(target => {
    const bytes = readBytes(root, target.path, true);
    return [target.path, bytes === null ? null : sha256(bytes)];
  }));
  const receipt = readBytes(root, `.content-ops/receipts/${request.request_id}.json`, true);
  if (receipt !== null) {
    checkOperationReceipt(request, parseOperationJson(receipt.toString('utf8')), observed);
    return { status: 'already-applied', request_hash: canonicalHash(request), observed };
  }
  assertOperationBaseline(request, observed);
  for (const asset of request.assets) {
    if (sha256(readBytes(root, asset.source)) !== asset.sha256) {
      throw new OperationContractError('asset.changed', asset.source, '확정한 자산 바이트와 현재 입력이 다릅니다.');
    }
  }
  return { status: 'ready', request_hash: canonicalHash(request), observed };
}

export { readBytes as readOperationBytes };
