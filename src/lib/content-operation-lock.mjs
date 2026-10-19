import { mkdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OperationContractError } from './content-operation-contract.mjs';
import { parseOperationJson, readOperationBytes, resolveOperationPath } from './content-operation-input.mjs';
import { createOperationFile } from './content-operation-write.mjs';

const directory = '.content-ops/local/apply.lock';
const ownerPath = `${directory}/owner.json`;
const claimPath = `${directory}/recovery.json`;
const ownerSchema = z.object({ version: z.literal(1), token: z.string().uuid(), pid: z.number().int().positive(), host: z.string().min(1) }).strict();
function assertOwnerExited(bytes) {
  const parsed = ownerSchema.safeParse(parseOperationJson(bytes.toString('utf8')));
  if (!parsed.success || parsed.data.host !== hostname()) throw new OperationContractError('lock.unverified', directory, '소유 정보를 확인할 수 없거나 다른 호스트의 잠금입니다. 자동 해제하지 않습니다.');
  try { process.kill(parsed.data.pid, 0); }
  catch (error) {
    if (error.code === 'ESRCH') return;
    throw new OperationContractError('lock.unverified', directory, '소유 프로세스 종료를 확인할 수 없습니다.');
  }
  throw new OperationContractError('lock.busy', directory, '소유 프로세스가 실행 중입니다. 잠금을 해제하지 않습니다.');
}
export function withOperationLock(root, action, options = {}) {
  const target = resolveOperationPath(root, directory);
  mkdirSync(dirname(target), { recursive: true });
  const owner = Buffer.from(JSON.stringify({ version: 1, token: randomUUID(), pid: process.pid, host: hostname() }) + '\n');
  let abandoned;
  try { mkdirSync(resolveOperationPath(root, directory)); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!options.recover) throw new OperationContractError('lock.busy', directory, '다른 적용 또는 중단된 실행의 잠금이 있습니다. 덮어쓰지 않습니다.');
    abandoned = readOperationBytes(root, ownerPath);
    assertOwnerExited(abandoned);
    if (readOperationBytes(root, claimPath, true) !== null) throw new OperationContractError('lock.recovery-busy', claimPath, '다른 복구 또는 중단된 복구의 점유가 있습니다. 자동 해제하지 않습니다.');
    try { createOperationFile(root, claimPath, owner); }
    catch { throw new OperationContractError('lock.recovery-busy', claimPath, '다른 복구와 점유가 충돌했습니다.'); }
  }
  if (!abandoned) {
    try { createOperationFile(root, ownerPath, owner); }
    catch (error) { try { rmdirSync(target); } catch {} throw error; }
  }
  let failure;
  let result;
  try {
    if (abandoned) {
      if (!readOperationBytes(root, ownerPath).equals(abandoned)) throw new OperationContractError('lock.changed', directory, '복구 점유 중 소유 정보가 바뀌었습니다.');
      assertOwnerExited(abandoned);
    }
    result = action(); return result;
  } catch (error) { failure = error; throw error; }
  finally {
    try {
      if (!readOperationBytes(root, ownerPath).equals(abandoned ?? owner)
        || (abandoned && !readOperationBytes(root, claimPath).equals(owner))) {
        throw new OperationContractError('lock.changed', directory, '잠금 소유 정보가 바뀌어 자동 해제하지 않습니다.');
      }
      // 폴더 제거 전까지 다른 일반 apply는 진입할 수 없음. 복구 점유도 마지막까지 유지함.
      unlinkSync(resolveOperationPath(root, ownerPath));
      if (abandoned) unlinkSync(resolveOperationPath(root, claimPath));
      rmdirSync(resolveOperationPath(root, directory));
    } catch (error) {
      if (failure) failure.lock_release = { code: error.code ?? 'lock.release', path: directory };
      else throw Object.assign(new OperationContractError('lock.release', directory, '적용 후 잠금 해제에 실패했습니다. 실제 결과와 소유 정보를 확인하세요.'),
        { written: result?.written ?? [], lock_release: { code: error.code ?? 'lock.changed', path: directory } });
    }
  }
}
