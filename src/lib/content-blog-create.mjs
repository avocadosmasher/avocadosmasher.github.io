import { canonicalHash, createOperationPlan, createOperationReceipt, OperationContractError, parseOperationRequest,
  sha256, verifyOperationPlan } from './content-operation-contract.mjs';
import { inspectOperationRequest, parseOperationJson, readOperationBytes, resolveOperationPath } from './content-operation-input.mjs';
import { checkContentProposal } from './content-repository-check.mjs';
import { createOperationFile } from './content-operation-write.mjs';
import { parseDocument } from 'yaml';
import { splitFrontmatter } from './content-frontmatter.mjs';
import { blogSchema } from './content-schemas.mjs';
import { validateContentSource } from './content-validation.mjs';

function requireBlogCreate(input) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'blog' || request.operation !== 'create') {
    throw new OperationContractError('operation.unsupported', 'resource', '이 어댑터는 글 신규 생성만 지원합니다.');
  }
  return request;
}

function desiredFiles(request) {
  return [{ path: request.target.path, before_sha256: null, after_sha256: sha256(request.content.source) },
    ...request.assets.map(asset => ({ path: asset.target, before_sha256: null, after_sha256: asset.sha256 }))];
}

function sameBlog(existing, source, path) {
  const original = existing.toString('utf8');
  if (!Buffer.from(original, 'utf8').equals(existing) || !validateContentSource({ kind: 'blog', path, source: original }).ok) return false;
  const normalize = value => {
    const { header, body } = splitFrontmatter(value);
    const data = blogSchema.parse(parseDocument(header).toJS({ maxAliasCount: 50 }));
    return { data: { ...data, pubDate: data.pubDate.toISOString() }, body };
  };
  return canonicalHash(normalize(original)) === canonicalHash(normalize(source));
}

function validateProposal(root, request) {
  const validation = checkContentProposal(root, [{ kind: 'blog', path: request.target.path, source: request.content.source }]);
  if (!validation.ok) {
    const issue = validation.diagnostics[0];
    throw new OperationContractError('content.invalid', issue.path, `${issue.rule}: ${issue.message}`);
  }
}

export function planBlogCreate(root, input) {
  const request = requireBlogCreate(input);
  const unchanged = () => ({ status: 'unchanged', request_hash: canonicalHash(request), written: [] });
  if (readOperationBytes(root, `.content-ops/receipts/${request.request_id}.json`, true) !== null) {
    inspectOperationRequest(root, request);
    validateProposal(root, request);
    return unchanged();
  }
  const existing = readOperationBytes(root, request.target.path, true);
  if (existing !== null) {
    const assetsMatch = request.assets.every(asset => {
      const bytes = readOperationBytes(root, asset.target, true);
      return bytes !== null && sha256(bytes) === asset.sha256;
    });
    if (sameBlog(existing, request.content.source, request.target.path) && assetsMatch) {
      validateProposal(root, request);
      return unchanged();
    }
    throw new OperationContractError('target.conflict', request.target.path, '같은 생성 대상에 다른 내용이나 일부만 반영된 상태가 있습니다.');
  }
  inspectOperationRequest(root, request);
  validateProposal(root, request);
  return { status: 'planned', plan: createOperationPlan(request, desiredFiles(request)),
    preview: [{ path: request.target.path, kind: 'markdown', source: request.content.source },
      ...request.assets.map(asset => ({ path: asset.target, kind: 'asset', sha256: asset.sha256 }))] };
}

export function applyBlogCreate(root, input, plan, expectedPlanHash) {
  const request = requireBlogCreate(input);
  const verified = verifyOperationPlan(request, plan, expectedPlanHash);
  if (createOperationPlan(request, desiredFiles(request)).plan_hash !== verified.plan_hash) {
    throw new OperationContractError('plan.changed', 'files', '계획의 결과가 확정한 글·자산과 다릅니다.');
  }
  const prepared = planBlogCreate(root, request);
  if (prepared.status === 'unchanged') return { status: 'unchanged', request_hash: verified.request_hash, plan_hash: verified.plan_hash, written: [] };
  if (prepared.plan.plan_hash !== verified.plan_hash) {
    throw new OperationContractError('plan.changed', 'plan_hash', '현재 입력으로 다시 만든 계획이 다릅니다.');
  }
  const writes = [{ path: request.target.path, bytes: Buffer.from(request.content.source, 'utf8') },
    ...request.assets.map(asset => ({ path: asset.target, bytes: readOperationBytes(root, asset.source) }))];
  const expected = new Map(verified.files.map(file => [file.path, file.after_sha256]));
  for (const file of writes) {
    if (sha256(file.bytes) !== expected.get(file.path)) throw new OperationContractError('asset.changed', file.path, '계획과 실제로 쓸 바이트가 다릅니다.');
    if (readOperationBytes(root, file.path, true) !== null) throw new OperationContractError('baseline.conflict', file.path, '적용 직전 생성 대상이 생겼습니다.');
  }
  const receiptPath = `.content-ops/receipts/${request.request_id}.json`;
  const receipt = createOperationReceipt(request, verified);
  const written = [];
  try {
    for (const file of writes) { createOperationFile(root, file.path, file.bytes); written.push(file.path); }
    for (const file of verified.files) {
      const bytes = readOperationBytes(root, file.path);
      if (sha256(bytes) !== file.after_sha256) throw new OperationContractError('receipt.state-mismatch', file.path, '추가 후 실제 파일이 계획과 다릅니다.');
    }
    createOperationFile(root, receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    written.push(receiptPath);
  } catch (error) {
    if (error.created && !written.includes(error.field)) written.push(error.field);
    throw Object.assign(error, { written });
  }
  return { status: 'applied', request_hash: verified.request_hash, plan_hash: verified.plan_hash, written };
}

export function saveBlogPlan(root, input, planFile, value) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'blog') throw new OperationContractError('operation.unsupported', 'resource', '글 계획만 저장합니다.');
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
