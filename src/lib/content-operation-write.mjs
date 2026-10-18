import { closeSync, constants, fsyncSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { OperationContractError } from './content-operation-contract.mjs';
import { resolveOperationPath } from './content-operation-input.mjs';

// 새 파일만 생성함. 실패 시 만들어진 파일을 자동 삭제하거나 덮어쓰지 않음.
export function createOperationFile(root, path, bytes) {
  let descriptor;
  let created = false;
  try {
    const target = resolveOperationPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    const checked = resolveOperationPath(root, path);
    descriptor = openSync(checked, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0));
    created = true;
    try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
  } catch (error) {
    if (error instanceof OperationContractError) throw error;
    throw Object.assign(new OperationContractError('write.failed', path,
      `새 파일 추가에 실패했습니다 (${error.code ?? 'UNKNOWN'}). 기존 파일은 덮어쓰지 않습니다.`), { created });
  }
}
