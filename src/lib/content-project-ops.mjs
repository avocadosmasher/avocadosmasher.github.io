import { canonicalHash, createOperationPlan, createOperationReceipt, OperationContractError,
  parseOperationRequest, sha256, verifyOperationPlan } from './content-operation-contract.mjs';
import { inspectOperationRequest, parseOperationJson, readOperationBytes } from './content-operation-input.mjs';
import { createOperationFile, replaceOperationFile } from './content-operation-write.mjs';
import { patchProjectSource, ProjectSourceError } from './content-projects.mjs';
import { checkCategoryProposal } from './content-repository-check.mjs';

function requireProject(input) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'project') throw new OperationContractError('operation.unsupported', 'resource', '프로젝트 요청만 처리합니다.');
  return request;
}
function validateProposal(root, source) {
  // PROJECTS는 위 어댑터에서 해석하고, 기존 제안 검사로 보존된 CATEGORIES·전체 문서 정책도 대조함.
  const validation = checkCategoryProposal(root, source);
  if (!validation.ok) {
    const issue = validation.diagnostics[0];
    throw new OperationContractError('content.invalid', issue.path, `${issue.rule}: ${issue.message}`);
  }
}

export function planProjectOperation(root, input) {
  const request = requireProject(input);
  const path = request.target.path;
  const receipt = readOperationBytes(root, `.content-ops/receipts/${request.request_id}.json`, true);
  if (receipt !== null) inspectOperationRequest(root, request);
  const bytes = readOperationBytes(root, path, true);
  if (bytes === null) throw new OperationContractError('target.missing', path, '기존 설정 파일이 없습니다. 새 파일을 만들지 않습니다.');
  const before = bytes.toString('utf8');
  if (!Buffer.from(before).equals(bytes)) throw new OperationContractError('content.invalid', path, 'UTF-8 원문이 아닙니다.');
  let source;
  try { source = patchProjectSource(before, request); }
  catch (error) {
    if (!(error instanceof ProjectSourceError)) throw error;
    throw new OperationContractError('registry.invalid', path, error.message);
  }
  if (source === before) {
    validateProposal(root, source);
    return { status: 'unchanged', request_hash: canonicalHash(request), written: [] };
  }
  if (receipt !== null) throw new OperationContractError('receipt.state-mismatch', path, '기록이 있지만 요청 결과가 반영되지 않았습니다.');
  if (sha256(bytes) !== request.baseline.sha256) throw new OperationContractError('baseline.conflict', path, '확인한 전체 설정 원문과 현재 파일이 다릅니다.');
  inspectOperationRequest(root, request);
  validateProposal(root, source);
  const plan = createOperationPlan(request, [{ path, before_sha256: request.baseline.sha256, after_sha256: sha256(source) }]);
  return { status: 'planned', plan, preview: [{ path, kind: 'typescript', operation: 'update', before, source }] };
}

export function applyProjectOperation(root, input, value, expectedPlanHash) {
  const request = requireProject(input);
  const plan = verifyOperationPlan(request, value, expectedPlanHash);
  const receiptPath = `.content-ops/receipts/${request.request_id}.json`;
  const recorded = readOperationBytes(root, receiptPath, true);
  if (recorded !== null && parseOperationJson(recorded.toString('utf8')).plan_hash !== plan.plan_hash) {
    throw new OperationContractError('plan.changed', 'plan_hash', '완료 기록과 다른 계획입니다.');
  }
  const prepared = planProjectOperation(root, request);
  if (prepared.status === 'unchanged') return { status: 'unchanged', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written: [] };
  if (prepared.plan.plan_hash !== plan.plan_hash) throw new OperationContractError('plan.changed', 'files', '확정 요청과 현재 원문으로 다시 만든 계획이 다릅니다.');
  const path = request.target.path;
  const expected = plan.files[0];
  if (sha256(readOperationBytes(root, path)) !== expected.before_sha256) throw new OperationContractError('baseline.conflict', path, '적용 직전 설정 원문이 바뀌었습니다.');
  const receipt = createOperationReceipt(request, plan);
  const written = [];
  try {
    replaceOperationFile(root, path, Buffer.from(prepared.preview[0].source), expected.before_sha256); written.push(path);
    if (sha256(readOperationBytes(root, path)) !== expected.after_sha256) throw new OperationContractError('receipt.state-mismatch', path, '적용 후 설정 파일이 계획과 다릅니다.');
    createOperationFile(root, receiptPath, JSON.stringify(receipt, null, 2) + '\n'); written.push(receiptPath);
  } catch (error) {
    if (error.created && !written.includes(error.field)) written.push(error.field);
    throw Object.assign(error, { written });
  }
  return { status: 'applied', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written };
}
