import { chmodSync, closeSync, constants, fsyncSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { OperationContractError, sha256 } from './content-operation-contract.mjs';
import { readOperationBytes, resolveOperationPath } from './content-operation-input.mjs';

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

// 기준 재확인 후 완성된 임시 파일로 교체함. 외부 편집과의 원자적 비교·교체는 보장하지 않음.
export function replaceOperationFile(root, path, bytes, expectedHash) {
  const temporaryPath = `.content-ops/local/writes/${randomUUID()}.tmp`;
  let temporary;
  try {
    const target = resolveOperationPath(root, path);
    if (sha256(readOperationBytes(root, path)) !== expectedHash) {
      throw new OperationContractError('baseline.conflict', path, '교체 직전 파일이 확인한 기준과 다릅니다.');
    }
    const mode = statSync(target).mode;
    createOperationFile(root, temporaryPath, bytes);
    temporary = resolveOperationPath(root, temporaryPath);
    chmodSync(temporary, mode);
    const checked = resolveOperationPath(root, path);
    if (sha256(readOperationBytes(root, path)) !== expectedHash) {
      throw new OperationContractError('baseline.conflict', path, '임시 파일 준비 중 다른 편집이 발생했습니다.');
    }
    renameSync(resolveOperationPath(root, temporaryPath), checked);
    temporary = undefined;
  } catch (error) {
    if (error instanceof OperationContractError) throw error;
    throw new OperationContractError('write.failed', path, `기존 파일 교체에 실패했습니다 (${error.code ?? 'UNKNOWN'}).`);
  } finally {
    // 이 호출이 배타적으로 만든 임시 파일만 정리함. 사용자 파일을 되돌리지 않음.
    if (temporary) unlinkSync(temporary);
  }
}
