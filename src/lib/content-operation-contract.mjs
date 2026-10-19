import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseDocument } from 'yaml';
import { blogSchema, fragmentSchema } from './content-schemas.mjs';
import { splitFrontmatter } from './content-frontmatter.mjs';
import { validateContentSource } from './content-validation.mjs';
import { projectSchema as project } from './content-project-schema.mjs';

export class OperationContractError extends Error {
  constructor(code, field, message) { super(`[${code}] ${field}: ${message}`); this.code = code; this.field = field; }
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).refine(value => value === value.trim());
const identifier = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80)
  .refine(value => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value));
export const repositoryPath = z.string().min(1).max(500).refine(value => !/[\\:\x00-\x1f<>"|?*]/.test(value)
  && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[ .]$/.test(part)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)));
const visiblePath = repositoryPath.refine(value => value.split('/').every(part => !part.startsWith('.')));
const blogPath = visiblePath.refine(value => /^src\/content\/blog\/(?:[^/]+\/)+index\.md$/.test(value));
const fragmentPath = visiblePath.refine(value => /^src\/content\/fragments\/.+\.md$/.test(value));
const date = z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(new Date(value).getTime()) && new Date(value).toISOString().slice(0, 10) === value);
const fragmentId = fragmentSchema.shape.id;
const relation = z.object({ target: fragmentId, type: z.enum(['related', 'prerequisite', 'part-of', 'contrasts']) }).strict();
const patch = schema => schema.partial().extend({ body: z.string().optional() }).strict().refine(value => Object.keys(value).length > 0);
const blogPatch = patch(blogSchema.extend({ pubDate: date }));
const fragmentPatch = patch(fragmentSchema.omit({ id: true }).extend({ relations: z.array(relation) }));
const projectPatch = project.partial().strict().refine(value => Object.keys(value).length > 0);
const asset = z.object({ source: repositoryPath, target: repositoryPath, sha256: hash }).strict();
const relatedTarget = z.object({ path: fragmentPath, id: fragmentId, sha256: hash }).strict();
const common = { version: z.literal(1), request_id: identifier, assets: z.array(asset).default([]),
  related_targets: z.array(relatedTarget).default([]) };
const variant = (resource, operation, target, baseline, payload) => z.object({ ...common, resource: z.literal(resource),
  operation: z.literal(operation), target, baseline: z.object({ sha256: baseline }).strict(), ...payload }).strict();
const sourceContent = { content: z.object({ source: z.string().min(1) }).strict() };
const categoryTarget = z.object({ path: z.literal('src/consts.ts'), key: text.refine(value => value !== '__proto__') }).strict();
const categoryValue = z.object({ color: text }).strict();
const requestSchema = z.union([
  variant('blog', 'create', z.object({ path: blogPath }).strict(), z.null(), sourceContent),
  variant('blog', 'update', z.object({ path: blogPath }).strict(), hash, { changes: blogPatch }),
  variant('fragment', 'create', z.object({ path: fragmentPath, id: fragmentId }).strict(), z.null(), sourceContent),
  variant('fragment', 'update', z.object({ path: fragmentPath, id: fragmentId }).strict(), hash, { changes: fragmentPatch }),
  variant('category', 'create', categoryTarget, hash, { content: categoryValue }),
  variant('category', 'update', categoryTarget, hash, { changes: categoryValue }),
  variant('project', 'create', z.object({ path: z.literal('src/consts.ts') }).strict(), hash, { content: project }),
  variant('project', 'update', z.object({ path: z.literal('src/consts.ts'), selector: project }).strict(), hash, { changes: projectPatch }),
]);
function parse(schema, input, code) {
  const result = schema.safeParse(input);
  if (!result.success) throw new OperationContractError(code, result.error.issues[0].path.join('.') || 'input',
    '필수 값·버전·지원 필드·값의 형식을 확인하세요.');
  return result.data;
}

export function parseOperationRequest(input) {
  canonicalHash(input);
  const request = parse(requestSchema, input, 'request.invalid');
  const fail = (field, message) => { throw new OperationContractError('request.invalid', field, message); };
  if (request.content?.source !== undefined) {
    const validation = validateContentSource({ kind: request.resource, path: request.target.path, source: request.content.source });
    if (!validation.ok) fail('content.source', validation.diagnostics[0].message);
    const metadata = parseDocument(splitFrontmatter(request.content.source).header).toJS({ maxAliasCount: 50 });
    parse((request.resource === 'blog' ? blogSchema : fragmentSchema).strict(), metadata, 'request.invalid');
    if (request.resource === 'fragment' && (metadata.id !== request.target.id
      || request.target.path !== `src/content/fragments/${request.target.id}.md`)) fail('target', '신규 Fragment의 ID와 원문·경로가 일치해야 합니다.');
  }
  if (request.assets.length && request.resource !== 'blog') fail('assets', '자산 추가는 글 요청에서만 지원합니다.');
  if (request.related_targets.length && !(request.resource === 'fragment' && request.operation === 'update' && request.changes.relations !== undefined)) {
    fail('related_targets', '관련 파일 기준은 Fragment 관계 수정에서만 지정합니다.');
  }
  const paths = new Set([request.target.path.toLowerCase()]);
  for (const item of [...request.assets.map(item => ({ ...item, path: item.target })), ...request.related_targets]) {
    if (paths.has(item.path.toLowerCase())) fail('target', '대상 경로가 중복됩니다.');
    paths.add(item.path.toLowerCase());
  }
  for (const item of request.assets) {
    const folder = request.target.path.slice(0, -'index.md'.length);
    if (!item.target.startsWith(folder) || item.target.split('/').some(part => part.startsWith('.'))
      || item.target.endsWith('/index.md')) fail('assets.target', '자산은 해당 글 폴더 안의 새 경로에만 추가합니다.');
  }
  return request;
}

export function canonicalHash(value) {
  const active = new Set();
  const encode = item => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || active.has(item)
      || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) {
      throw new OperationContractError('value.invalid', 'input', '순환 참조 없는 JSON 값이 필요합니다.');
    }
    active.add(item);
    const result = Array.isArray(item) ? '[' + Array.from(item, encode).join(',') + ']'
      : '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + encode(item[key])).join(',') + '}';
    active.delete(item);
    return result;
  };
  return sha256(encode(value));
}

const fileChange = z.object({ path: repositoryPath, before_sha256: hash.nullable(), after_sha256: hash }).strict();
const planSchema = z.object({ version: z.literal(1), request_id: identifier, request_hash: hash,
  files: z.array(fileChange), plan_hash: hash }).strict();
const receiptSchema = planSchema.extend({ result: z.literal('applied'), files: z.array(fileChange).min(1) }).strict();

export function operationTargets(input) {
  const request = parseOperationRequest(input);
  return [{ path: request.target.path, sha256: request.baseline.sha256 },
    ...request.assets.map(asset => ({ path: asset.target, sha256: null })),
    ...request.related_targets.map(target => ({ path: target.path, sha256: target.sha256 }))];
}

export function assertOperationBaseline(input, currentHashes) {
  for (const target of operationTargets(input)) {
    if (!Object.hasOwn(currentHashes, target.path) || currentHashes[target.path] !== target.sha256) {
      throw new OperationContractError('baseline.conflict', target.path, '확인한 기준과 현재 파일이 다릅니다.');
    }
  }
}

export function createOperationPlan(input, files) {
  const request = parseOperationRequest(input);
  const allowed = new Map(operationTargets(request).map(target => [target.path, target.sha256]));
  const changes = parse(z.array(fileChange), files, 'plan.invalid').sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const seen = new Set();
  for (const file of changes) {
    if (!allowed.has(file.path) || seen.has(file.path)
      || allowed.get(file.path) !== file.before_sha256) {
      throw new OperationContractError('plan.invalid', file.path, '중복·요청 밖 변경·다른 기준을 계획할 수 없습니다.');
    }
    seen.add(file.path);
  }
  if (seen.size !== allowed.size) throw new OperationContractError('plan.invalid', 'files', '변경하지 않는 파일도 포함해 요청 대상의 최종 상태를 모두 기록해야 합니다.');
  const base = { version: 1, request_id: request.request_id, request_hash: canonicalHash(request), files: changes };
  return { ...base, plan_hash: canonicalHash(base) };
}

export function verifyOperationPlan(input, value, expectedPlanHash) {
  const plan = parse(planSchema, value, 'plan.invalid');
  parse(hash, expectedPlanHash, 'plan.invalid');
  const request = parseOperationRequest(input);
  if (plan.request_id !== request.request_id || plan.request_hash !== canonicalHash(request)) {
    throw new OperationContractError('request.conflict', 'request_hash', '계획의 확정 요청과 입력이 다릅니다.');
  }
  const rebuilt = createOperationPlan(request, plan.files);
  if (plan.plan_hash !== rebuilt.plan_hash || plan.plan_hash !== expectedPlanHash) {
    throw new OperationContractError('plan.changed', 'plan_hash', '확인한 계획 지문과 변경 내용이 다릅니다.');
  }
  return rebuilt;
}

export function createOperationReceipt(input, value) {
  const plan = verifyOperationPlan(input, value, value.plan_hash);
  if (plan.files.every(file => file.before_sha256 === file.after_sha256)) {
    throw new OperationContractError('receipt.invalid', 'files', '변경 없음 작업에는 새 완료 기록을 만들지 않습니다.');
  }
  return parse(receiptSchema, { ...plan, result: 'applied' }, 'receipt.invalid');
}

export function checkOperationReceipt(input, value, currentHashes) {
  const request = parseOperationRequest(input);
  const receipt = parse(receiptSchema, value, 'receipt.invalid');
  if (receipt.request_id !== request.request_id || receipt.request_hash !== canonicalHash(request)) {
    throw new OperationContractError('request.conflict', 'request_id', '같은 요청 기록과 현재 확정 입력이 다릅니다.');
  }
  const { result, ...plan } = receipt;
  verifyOperationPlan(request, plan, plan.plan_hash);
  for (const file of receipt.files) {
    if (!Object.hasOwn(currentHashes, file.path) || currentHashes[file.path] !== file.after_sha256) {
      throw new OperationContractError('receipt.state-mismatch', file.path, '완료 기록과 실제 파일 상태가 다릅니다.');
    }
  }
  return 'already-applied';
}

// 인자 계약만 제공함. 실제 plan/apply CLI 연결은 ACTB01부터 구현함.
export function parseOperationCommand(args) {
  const fail = () => { throw new OperationContractError('command.invalid', 'arguments', '지원 명령·필수 인자·중복 옵션을 확인하세요.'); };
  if (!Array.isArray(args) || !args.every(value => typeof value === 'string')) fail();
  const [command, ...rest] = args;
  if (!['plan', 'apply', 'recover'].includes(command)) fail();
  const allowed = command === 'plan' ? ['--request', '--out', '--root', '--json']
    : ['--request', '--plan', '--expect-plan', '--root', '--json'];
  const values = new Map();
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (!allowed.includes(key) || values.has(key)) fail();
    const value = key === '--json' ? true : rest[++index];
    if (value !== true && (!value || value.startsWith('-'))) fail();
    values.set(key, value);
  }
  if (!values.has('--request') || !values.has(command === 'plan' ? '--out' : '--plan')
    || (command !== 'plan' && !hash.safeParse(values.get('--expect-plan')).success)) fail();
  const planFile = values.get(command === 'plan' ? '--out' : '--plan');
  if (!repositoryPath.safeParse(planFile).success || !planFile.startsWith('.content-ops/local/')) fail();
  return { command, request_file: values.get('--request'), plan_file: planFile, json: values.has('--json'),
    ...(values.has('--root') ? { root: values.get('--root') } : {}),
    ...(command !== 'plan' ? { expected_plan_hash: values.get('--expect-plan') } : {}) };
}
