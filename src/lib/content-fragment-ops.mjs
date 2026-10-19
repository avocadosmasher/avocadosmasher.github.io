import { parseDocument } from 'yaml';
import { canonicalHash, createOperationPlan, createOperationReceipt, operationTargets, OperationContractError,
  parseOperationRequest, sha256, verifyOperationPlan } from './content-operation-contract.mjs';
import { inspectOperationRequest, parseOperationJson, readOperationBytes } from './content-operation-input.mjs';
import { createOperationFile, replaceOperationFile } from './content-operation-write.mjs';
import { patchContentSource } from './content-source-patch.mjs';
import { splitFrontmatter } from './content-frontmatter.mjs';
import { fragmentSchema } from './content-schemas.mjs';
import { validateContentSource } from './content-validation.mjs';
import { checkContentProposal } from './content-repository-check.mjs';

function requireFragment(input) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'fragment') throw new OperationContractError('operation.unsupported', 'resource', 'Fragment 요청만 처리합니다.');
  return request;
}
function fragmentDocument(bytes, path, expectedId) {
  if (bytes === null) throw new OperationContractError('target.missing', path, '수정할 기존 Fragment가 없습니다.');
  const source = bytes.toString('utf8');
  const validation = validateContentSource({ kind: 'fragment', path, source });
  if (!Buffer.from(source, 'utf8').equals(bytes) || !validation.ok) {
    throw new OperationContractError('content.invalid', path, validation.diagnostics[0]?.message ?? 'UTF-8 원문이 아닙니다.');
  }
  const { header, body } = splitFrontmatter(source);
  const data = fragmentSchema.parse(parseDocument(header).toJS({ maxAliasCount: 50 }));
  if (expectedId !== undefined && data.id !== expectedId) {
    throw new OperationContractError('target.id-mismatch', path, '실제 원문의 ID와 요청 ID가 다릅니다. 경로·ID를 바꾸지 않습니다.');
  }
  return { source, data, body };
}
function validateProposals(root, proposals) {
  const validation = checkContentProposal(root, proposals.map(file => ({ kind: 'fragment', path: file.path, source: file.source })));
  if (!validation.ok) {
    const issue = validation.diagnostics[0];
    throw new OperationContractError('content.invalid', issue.path, `${issue.rule}: ${issue.message}`);
  }
}

export function planFragmentOperation(root, input) {
  const request = requireFragment(input);
  const path = request.target.path;
  const unchanged = () => ({ status: 'unchanged', request_hash: canonicalHash(request), written: [] });
  if (readOperationBytes(root, `.content-ops/receipts/${request.request_id}.json`, true) !== null) {
    inspectOperationRequest(root, request);
    const actual = [{ ...request.target }, ...request.related_targets].map(target => ({ path: target.path,
      source: fragmentDocument(readOperationBytes(root, target.path, true), target.path, target.id).source }));
    validateProposals(root, actual);
    return unchanged();
  }
  const existing = readOperationBytes(root, path, true);
  let proposals;
  if (request.operation === 'create') {
    if (existing !== null) {
      const actual = fragmentDocument(existing, path, undefined);
      const desired = fragmentDocument(Buffer.from(request.content.source), path, request.target.id);
      if (canonicalHash({ data: actual.data, body: actual.body }) !== canonicalHash({ data: desired.data, body: desired.body })) {
        throw new OperationContractError('target.conflict', path, '같은 경로에 다른 Fragment가 있습니다. 덮어쓰거나 새 ID를 만들지 않습니다.');
      }
      validateProposals(root, [{ path, source: actual.source }]);
      return unchanged();
    }
    proposals = [{ path, source: request.content.source, before: null }];
  } else {
    fragmentDocument(existing, path, request.target.id);
    proposals = [{ path, before: existing.toString('utf8'), source: patchContentSource(existing, request.changes, path, 'fragment') }];
    for (const target of request.related_targets) {
      const bytes = readOperationBytes(root, target.path, true);
      const current = fragmentDocument(bytes, target.path, target.id);
      // 명시한 상대 카드에서 이 카드로 들어오는 관계만 제거함. 다른 관계·필드는 보존함.
      const relations = current.data.relations.filter(relation => relation.target !== request.target.id);
      proposals.push({ path: target.path, before: current.source, source: patchContentSource(bytes, { relations }, target.path, 'fragment') });
    }
    if (proposals.every(file => file.before === file.source)) {
      validateProposals(root, proposals);
      return unchanged();
    }
  }
  inspectOperationRequest(root, request);
  validateProposals(root, proposals);
  const baseline = new Map(operationTargets(request).map(target => [target.path, target.sha256]));
  const plan = createOperationPlan(request, proposals.map(file => ({ path: file.path,
    before_sha256: baseline.get(file.path), after_sha256: sha256(file.source) })));
  return { status: 'planned', plan, preview: proposals.map(file => ({ ...file, kind: 'markdown', operation: file.before === null ? 'create' : 'update' })) };
}

export function applyFragmentOperation(root, input, value, expectedPlanHash) {
  const request = requireFragment(input);
  const plan = verifyOperationPlan(request, value, expectedPlanHash);
  if (request.operation === 'create' && createOperationPlan(request, [{ path: request.target.path,
    before_sha256: null, after_sha256: sha256(request.content.source) }]).plan_hash !== plan.plan_hash) {
    throw new OperationContractError('plan.changed', 'files', '확정한 신규 Fragment와 계획 결과가 다릅니다.');
  }
  const receiptPath = `.content-ops/receipts/${request.request_id}.json`;
  const recorded = readOperationBytes(root, receiptPath, true);
  if (recorded !== null && parseOperationJson(recorded.toString('utf8')).plan_hash !== plan.plan_hash) {
    throw new OperationContractError('plan.changed', 'plan_hash', '완료 기록과 다른 계획입니다.');
  }
  const prepared = planFragmentOperation(root, request);
  if (prepared.status === 'unchanged') return { status: 'unchanged', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written: [] };
  if (prepared.plan.plan_hash !== plan.plan_hash) throw new OperationContractError('plan.changed', 'files', '요청과 현재 원문으로 다시 만든 계획이 다릅니다.');
  const expected = new Map(plan.files.map(file => [file.path, file]));
  for (const file of prepared.preview) {
    const bytes = readOperationBytes(root, file.path, true);
    if ((bytes === null ? null : sha256(bytes)) !== expected.get(file.path).before_sha256) {
      throw new OperationContractError('baseline.conflict', file.path, '적용 직전 대상 또는 관련 파일의 기준이 바뀌었습니다.');
    }
  }
  const receipt = createOperationReceipt(request, plan);
  const written = [];
  try {
    for (const file of prepared.preview) {
      const before = expected.get(file.path).before_sha256;
      if (before === sha256(file.source)) continue;
      if (before === null) createOperationFile(root, file.path, Buffer.from(file.source));
      else replaceOperationFile(root, file.path, Buffer.from(file.source), before);
      written.push(file.path);
    }
    for (const file of plan.files) {
      if (sha256(readOperationBytes(root, file.path)) !== file.after_sha256) {
        throw new OperationContractError('receipt.state-mismatch', file.path, '적용 후 실제 Fragment가 계획과 다릅니다.');
      }
    }
    createOperationFile(root, receiptPath, JSON.stringify(receipt, null, 2) + '\n'); written.push(receiptPath);
  } catch (error) {
    if (error.created && !written.includes(error.field)) written.push(error.field);
    throw Object.assign(error, { written });
  }
  return { status: 'applied', request_hash: plan.request_hash, plan_hash: plan.plan_hash, written };
}
