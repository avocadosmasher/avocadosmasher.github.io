import { linkSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalHash, OperationContractError, parseOperationRequest, sha256, verifyOperationPlan } from './content-operation-contract.mjs';
import { readOperationBytes, resolveOperationPath } from './content-operation-input.mjs';
import { createOperationFile } from './content-operation-write.mjs';
import { withOperationLock } from './content-operation-lock.mjs';

export const journalPath = request => `.content-ops/local/journals/${request.request_id}.json`;
export const stagePath = journal => `.content-ops/local/stages/${journal.stage_id}`;
export function pendingJournals(root) {
  try {
    return readdirSync(resolveOperationPath(root, '.content-ops/local/journals')).sort()
      .map(name => `.content-ops/local/journals/${name}`);
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
export function cleanupTransaction(root, request, journal, files) {
  const pending = [];
  const expectedIntent = Buffer.from(JSON.stringify(journal) + '\n');
  const currentIntent = readOperationBytes(root, journalPath(request), true);
  if (currentIntent !== null && !currentIntent.equals(expectedIntent)) return [journalPath(request)];
  const paths = [journalPath(request), ...files.map((_file, index) => `${stagePath(journal)}/${index}.bin`), `${stagePath(journal)}/intent.json`];
  for (const path of paths) {
    try {
      const bytes = readOperationBytes(root, path, true);
      if (bytes === null) continue;
      const index = paths.indexOf(path) - 1;
      if ((index >= 0 && index < files.length && sha256(bytes) !== files[index].after_sha256)
        || (path.endsWith('/intent.json') && !bytes.equals(expectedIntent))) { pending.push(path); continue; }
      unlinkSync(resolveOperationPath(root, path));
    }
    catch { pending.push(path); }
  }
  try { rmdirSync(resolveOperationPath(root, stagePath(journal))); }
  catch (error) { if (error.code !== 'ENOENT') pending.push(stagePath(journal)); }
  return pending;
}
export function runOperationTransaction(root, input, value, expectedPlanHash, prepare, execute) {
  const request = parseOperationRequest(input);
  const plan = verifyOperationPlan(request, value, expectedPlanHash);
  return withOperationLock(root, () => {
    const pending = pendingJournals(root);
    if (pending.length) throw Object.assign(new OperationContractError('recovery.required', pending[0],
      '완료되지 않은 적용 자료가 있습니다. 같은 확정 요청·계획으로 recover를 실행하세요.'), { recovery: { journal: pending[0] } });
    const prepared = prepare(root, request);
    if (prepared.status === 'unchanged') return execute();
    if (prepared.plan.plan_hash !== plan.plan_hash) throw new OperationContractError('plan.changed', 'files', '현재 원문으로 다시 만든 계획이 다릅니다.');
    const files = plan.files.map(file => {
      const preview = prepared.preview.find(candidate => candidate.path === file.path);
      const asset = request.assets.find(candidate => candidate.target === file.path);
      const bytes = asset ? readOperationBytes(root, asset.source) : Buffer.from(preview.source, 'utf8');
      if (sha256(bytes) !== file.after_sha256) throw new OperationContractError('asset.changed', file.path, '쓸 바이트와 계획 지문이 다릅니다.');
      const actual = readOperationBytes(root, file.path, true);
      if ((actual === null ? null : sha256(actual)) !== file.before_sha256) throw new OperationContractError('baseline.conflict', file.path, '복구 자료 준비 전 기준이 바뀌었습니다.');
      return bytes;
    });
    const journal = { version: 1, request_id: request.request_id, request_hash: canonicalHash(request),
      plan_hash: plan.plan_hash, stage_id: randomUUID() };
    files.forEach((bytes, index) => createOperationFile(root, `${stagePath(journal)}/${index}.bin`, bytes));
    // 완성·fsync한 자료만 배타적으로 게시함. 중단 전 게시되지 않은 임시 자료는 콘텐츠에 영향 없음.
    createOperationFile(root, `${stagePath(journal)}/intent.json`, JSON.stringify(journal) + '\n');
    mkdirSync(dirname(resolveOperationPath(root, journalPath(request))), { recursive: true });
    linkSync(resolveOperationPath(root, `${stagePath(journal)}/intent.json`), resolveOperationPath(root, journalPath(request)));
    try {
      const result = execute();
      const pending = cleanupTransaction(root, request, journal, plan.files);
      return { ...result, ...(pending.length ? { cleanup_pending: pending } : {}) };
    } catch (error) {
      throw Object.assign(error, { recovery: { journal: journalPath(request), request_id: request.request_id, plan_hash: plan.plan_hash } });
    }
  });
}
