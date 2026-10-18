import { canonicalHash, createOperationPlan, createOperationReceipt, OperationContractError, parseOperationRequest,
  sha256, verifyOperationPlan } from './content-operation-contract.mjs';
import { inspectOperationRequest, parseOperationJson, readOperationBytes } from './content-operation-input.mjs';
import { createOperationFile, replaceOperationFile } from './content-operation-write.mjs';
import { patchBlogSource } from './content-blog-patch.mjs';
import { checkContentProposal } from './content-repository-check.mjs';

function requireBlogUpdate(input) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'blog' || request.operation !== 'update') {
    throw new OperationContractError('operation.unsupported', 'resource', '이 어댑터는 기존 글 수정 요청을 처리합니다.');
  }
  return request;
}
function validateProposal(root, path, source) {
  const validation = checkContentProposal(root, [{ kind: 'blog', path, source }]);
  if (!validation.ok) {
    const issue = validation.diagnostics[0];
    throw new OperationContractError('content.invalid', issue.path, `${issue.rule}: ${issue.message}`);
  }
}

export function planBlogUpdate(root, input) {
  const request = requireBlogUpdate(input);
  const path = request.target.path;
  const unchanged = () => ({ status: 'unchanged', request_hash: canonicalHash(request), written: [] });
  if (readOperationBytes(root, `.content-ops/receipts/${request.request_id}.json`, true) !== null) {
    inspectOperationRequest(root, request);
    const source = readOperationBytes(root, path).toString('utf8');
    validateProposal(root, path, source);
    return unchanged();
  }
  const existing = readOperationBytes(root, path, true);
  if (existing === null) throw new OperationContractError('target.missing', path, '수정할 기존 글이 없습니다. 신규 생성으로 전환하지 않습니다.');
  const source = patchBlogSource(existing, request.changes, path);
  const assetsMatch = request.assets.every(asset => {
    const bytes = readOperationBytes(root, asset.target, true);
    return bytes !== null && sha256(bytes) === asset.sha256;
  });
  if (source === existing.toString('utf8') && assetsMatch) {
    validateProposal(root, path, source);
    return unchanged();
  }
  inspectOperationRequest(root, request);
  validateProposal(root, path, source);
  const plan = createOperationPlan(request, [{ path, before_sha256: request.baseline.sha256, after_sha256: sha256(source) },
    ...request.assets.map(asset => ({ path: asset.target, before_sha256: null, after_sha256: asset.sha256 }))]);
  return { status: 'planned', plan, preview: [{ path, kind: 'markdown', operation: 'update', before: existing.toString('utf8'), source },
    ...request.assets.map(asset => ({ path: asset.target, kind: 'asset', operation: 'create', sha256: asset.sha256 }))] };
}

export function applyBlogUpdate(root, input, value, expectedPlanHash) {
  const request = requireBlogUpdate(input);
  const plan = verifyOperationPlan(request, value, expectedPlanHash);
  const receiptPath = `.content-ops/receipts/${request.request_id}.json`;
  const recorded = readOperationBytes(root, receiptPath, true);
  if (recorded !== null && parseOperationJson(recorded.toString('utf8')).plan_hash !== plan.plan_hash) {
    throw new OperationContractError('plan.changed', 'plan_hash', '완료 기록과 다른 계획입니다.');
  }
  const prepared = planBlogUpdate(root, request);
  if (prepared.status === 'unchanged') return { status: 'unchanged', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written: [] };
  if (prepared.plan.plan_hash !== plan.plan_hash) throw new OperationContractError('plan.changed', 'files', '확정 요청으로 다시 만든 결과와 계획이 다릅니다.');
  const writes = [{ path: request.target.path, bytes: Buffer.from(prepared.preview[0].source, 'utf8') },
    ...request.assets.map(asset => ({ path: asset.target, bytes: readOperationBytes(root, asset.source) }))];
  const expected = new Map(plan.files.map(file => [file.path, file]));
  for (const file of writes) {
    const baseline = readOperationBytes(root, file.path, true);
    const current = baseline === null ? null : sha256(baseline);
    if (current !== expected.get(file.path).before_sha256) throw new OperationContractError('baseline.conflict', file.path, '적용 직전 기준이 바뀌었습니다.');
    if (sha256(file.bytes) !== expected.get(file.path).after_sha256) throw new OperationContractError('asset.changed', file.path, '쓸 바이트가 계획과 다릅니다.');
  }
  const receipt = createOperationReceipt(request, plan);
  const written = [];
  try {
    for (const file of writes) {
      const before = expected.get(file.path).before_sha256;
      if (before === sha256(file.bytes)) continue;
      if (before === null) createOperationFile(root, file.path, file.bytes);
      else replaceOperationFile(root, file.path, file.bytes, before);
      written.push(file.path);
    }
    for (const file of plan.files) {
      if (sha256(readOperationBytes(root, file.path)) !== file.after_sha256) {
        throw new OperationContractError('receipt.state-mismatch', file.path, '적용 후 실제 파일이 계획과 다릅니다.');
      }
    }
    createOperationFile(root, receiptPath, JSON.stringify(receipt, null, 2) + '\n'); written.push(receiptPath);
  } catch (error) {
    if (error.created && !written.includes(error.field)) written.push(error.field);
    throw Object.assign(error, { written });
  }
  return { status: 'applied', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written };
}
