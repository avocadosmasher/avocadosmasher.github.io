import { OperationContractError, parseOperationRequest, verifyOperationPlan } from './content-operation-contract.mjs';
import { parseOperationJson, readOperationBytes, resolveOperationPath } from './content-operation-input.mjs';
import { createOperationFile } from './content-operation-write.mjs';

export function saveOperationPlan(root, input, planFile, value) {
  const request = parseOperationRequest(input);
  if (typeof planFile !== 'string' || !planFile.startsWith('.content-ops/local/')) {
    throw new OperationContractError('path.invalid', 'plan_file', '계획 파일은 로컬 상태 폴더에만 저장합니다.');
  }
  resolveOperationPath(root, planFile);
  const plan = verifyOperationPlan(request, value, value.plan_hash);
  const existing = readOperationBytes(root, planFile, true);
  if (existing !== null) {
    verifyOperationPlan(request, parseOperationJson(existing.toString('utf8')), plan.plan_hash);
    return false;
  }
  createOperationFile(root, planFile, JSON.stringify(plan, null, 2) + '\n');
  return true;
}
