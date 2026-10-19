import { z } from 'zod';
import { createOperationReceipt, OperationContractError, parseOperationRequest, sha256, verifyOperationPlan, canonicalHash } from './content-operation-contract.mjs';
import { parseOperationJson, readOperationBytes } from './content-operation-input.mjs';
import { createOperationFile, replaceOperationFile } from './content-operation-write.mjs';
import { withOperationLock } from './content-operation-lock.mjs';
import { cleanupTransaction, journalPath, pendingJournals, stagePath } from './content-operation-transaction.mjs';
import { checkCategoryProposal, checkContentProposal } from './content-repository-check.mjs';
import { inspectProjectSource } from './content-projects.mjs';

const journalSchema = z.object({ version: z.literal(1), request_id: z.string(),
  request_hash: z.string().regex(/^[a-f0-9]{64}$/), plan_hash: z.string().regex(/^[a-f0-9]{64}$/), stage_id: z.string().uuid() }).strict();
const fail = (code, field, message) => { throw new OperationContractError(code, field, message); };
export function recoverOperation(root, input, value, expectedPlanHash) {
  const request = parseOperationRequest(input);
  const plan = verifyOperationPlan(request, value, expectedPlanHash);
  return withOperationLock(root, () => {
    const path = journalPath(request);
    const pending = pendingJournals(root);
    if (pending.some(candidate => candidate !== path)) fail('recovery.required', pending.find(candidate => candidate !== path), '다른 미완료 작업을 먼저 확인하세요.');
    const bytes = readOperationBytes(root, path, true);
    if (bytes === null) fail('recovery.missing', path, '이 요청의 복구 자료가 없습니다. 일반 apply 상태를 확인하세요.');
    const parsed = journalSchema.safeParse(parseOperationJson(bytes.toString('utf8')));
    if (!parsed.success) fail('recovery.invalid', path, '복구 자료 형식이 다릅니다. 자동 수정하지 않습니다.');
    const journal = parsed.data;
    if (journal.request_id !== request.request_id || journal.request_hash !== canonicalHash(request) || journal.plan_hash !== plan.plan_hash) {
      fail('recovery.conflict', path, '확정 요청·계획과 복구 자료가 다릅니다.');
    }
    const observed = plan.files.map(file => {
      const current = readOperationBytes(root, file.path, true);
      const hash = current === null ? null : sha256(current);
      if (hash !== file.before_sha256 && hash !== file.after_sha256) fail('recovery.conflict', file.path, '계획 전후 어느 상태도 아닙니다. 외부 편집을 덮어쓰지 않습니다.');
      return hash;
    });
    const receiptPath = `.content-ops/receipts/${request.request_id}.json`;
    const receipt = createOperationReceipt(request, plan);
    const recorded = readOperationBytes(root, receiptPath, true);
    if (recorded !== null && (canonicalHash(parseOperationJson(recorded.toString('utf8'))) !== canonicalHash(receipt)
      || observed.some((hash, index) => hash !== plan.files[index].after_sha256))) fail('receipt.state-mismatch', receiptPath, '완료 기록과 실제 결과가 다릅니다.');
    const written = [];
    try {
      // 완료 기록까지 일치하면 임시 자료 손실 여부와 무관하게 정리만 수행함.
      if (recorded === null) {
        const files = plan.files.map((file, index) => {
          const bytes = readOperationBytes(root, `${stagePath(journal)}/${index}.bin`, true);
          if (bytes === null || sha256(bytes) !== file.after_sha256) fail('recovery.staging', file.path, '준비한 최종 바이트가 없거나 다릅니다. 자동 복구하지 않습니다.');
          return { ...file, bytes };
        });
        let validation;
        if (['project', 'category'].includes(request.resource)) {
          const source = files[0].bytes.toString('utf8');
          if (request.resource === 'project') inspectProjectSource(source);
          validation = checkCategoryProposal(root, source);
        } else validation = checkContentProposal(root, files.filter(file => file.path === request.target.path
          || request.related_targets.some(target => target.path === file.path))
          .map(file => ({ kind: request.resource, path: file.path, source: file.bytes.toString('utf8') })));
        if (!validation.ok) fail('content.invalid', validation.diagnostics[0].path, validation.diagnostics[0].message);
        // 모든 상태·준비 바이트·정책 검사가 끝난 뒤 아직 반영되지 않은 파일만 씀.
        for (const file of files) {
          const current = readOperationBytes(root, file.path, true);
          const hash = current === null ? null : sha256(current);
          if (hash === file.after_sha256) continue;
          if (hash !== file.before_sha256) fail('recovery.conflict', file.path, '복구 중 다른 편집이 발생했습니다.');
          if (hash === null) createOperationFile(root, file.path, file.bytes);
          else replaceOperationFile(root, file.path, file.bytes, hash);
          written.push(file.path);
        }
        for (const file of files) if (sha256(readOperationBytes(root, file.path)) !== file.after_sha256) fail('receipt.state-mismatch', file.path, '복구 후 실제 파일이 계획과 다릅니다.');
        createOperationFile(root, receiptPath, JSON.stringify(receipt, null, 2) + '\n'); written.push(receiptPath);
      }
      const pending = cleanupTransaction(root, request, journal, plan.files);
      return { status: written.length ? 'applied' : 'unchanged', recovered: true, request_hash: plan.request_hash,
        plan_hash: plan.plan_hash, written, ...(pending.length ? { cleanup_pending: pending } : {}) };
    } catch (error) {
      if (error.created && !written.includes(error.field)) written.push(error.field);
      throw Object.assign(error, { written, recovery: { journal: path } });
    }
  }, { recover: true });
}
