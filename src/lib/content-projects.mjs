import ts from 'typescript';
import { canonicalHash, OperationContractError, parseOperationRequest } from './content-operation-contract.mjs';
import { projectSchema } from './content-project-schema.mjs';
import { applySourceEdits, assertNoRegistryReferences, staticMemberEdits } from './content-typescript-edit.mjs';

export class ProjectSourceError extends Error {}

export function inspectProjectSource(text) {
  const fail = message => { throw new ProjectSourceError(message); };
  const source = ts.createSourceFile('consts.ts', text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) fail('consts.ts의 TypeScript 구문 오류를 먼저 수정하세요.');
  const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations].map(declaration => ({ statement, declaration })))
    .filter(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === 'PROJECTS');
  if (declarations.length !== 1) fail('PROJECTS 선언은 정확히 하나여야 합니다.');
  const { statement, declaration } = declarations[0];
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)
    || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    || !declaration.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) {
    fail('export const PROJECTS에 정적 배열을 직접 지정해야 합니다.');
  }
  const items = [...declaration.initializer.elements].map(node => {
    if (!ts.isObjectLiteralExpression(node)) fail('프로젝트 항목은 정적 객체만 지원합니다.');
    const properties = new Map();
    const values = [];
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        fail('프로젝트는 정적 필드만 지원합니다. 계산식·spread·동적 키를 추측하지 않습니다.');
      }
      const key = property.name.text;
      if (!Object.hasOwn(projectSchema.shape, key) || properties.has(key)) fail(`중복되거나 지원하지 않는 프로젝트 필드입니다: ${key}`);
      const value = property.initializer;
      if (ts.isStringLiteral(value)) values.push([key, value.text]);
      else if (ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteral)) values.push([key, value.elements.map(item => item.text)]);
      else fail('프로젝트 값은 정적 문자열·문자열 배열만 지원합니다.');
      properties.set(key, property);
    }
    const parsed = projectSchema.safeParse(Object.fromEntries(values));
    if (!parsed.success) fail('프로젝트 필수 필드·허용 값·배열 형식을 확인하세요.');
    return { node, properties, data: parsed.data };
  });
  return { source, declaration, array: declaration.initializer, items };
}

const identity = ['name', 'period', 'role', 'link'];
const same = (a, b) => canonicalHash(a) === canonicalHash(b);
const compatible = (item, value) => identity.every(key => !Object.hasOwn(item, key) || !Object.hasOwn(value, key) || item[key] === value[key]);
const identityOf = value => Object.fromEntries(identity.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
function conflict(code, message, candidates) {
  throw Object.assign(new OperationContractError(code, 'PROJECTS', message), { candidates: candidates.map(item => item.data) });
}

export function patchProjectSource(text, input) {
  const request = parseOperationRequest(input);
  if (request.resource !== 'project') throw new OperationContractError('operation.unsupported', 'resource', '프로젝트 요청만 처리합니다.');
  const registry = inspectProjectSource(text);
  assertNoRegistryReferences(registry.source, registry.declaration, 'PROJECTS');
  const existing = registry.items.map(item => item.data);
  let result;
  let expected;
  if (request.operation === 'create') {
    const candidates = registry.items.filter(item => compatible(item.data, request.content));
    if (candidates.length > 1) conflict('target.ambiguous', '이름·기간·역할·링크로 구별되지 않는 프로젝트 후보가 여러 개입니다.', candidates);
    if (candidates.length === 1) {
      if (same(candidates[0].data, request.content)) return text;
      conflict('target.conflict', '같은 프로젝트일 수 있는 기존 항목이 있습니다. 신규 복제 대신 실제 대상을 확인하세요.', candidates);
    }
    result = applySourceEdits(text, staticMemberEdits(text, registry.source, registry.array, registry.array.elements, [JSON.stringify(request.content)]));
    expected = [...existing, request.content];
  } else {
    const selector = request.target.selector;
    const desired = projectSchema.parse({ ...selector, ...request.changes });
    const exact = registry.items.filter(item => same(item.data, selector));
    if (exact.length > 1) conflict('target.ambiguous', '원래 항목 전체 값이 같은 후보가 여러 개입니다. 배열 순번으로 선택하지 않습니다.', exact);
    if (!exact.length) {
      const final = registry.items.filter(item => same(item.data, desired));
      if (final.length > 1) conflict('target.ambiguous', '요청한 최종 항목과 같은 후보가 여러 개입니다.', final);
      if (final.length === 1) return text;
      const anchor = identity.some(key => Object.hasOwn(selector, key) && selector[key] !== ''
        && (!Object.hasOwn(request.changes, key) || request.changes[key] === selector[key]));
      const reflected = registry.items.filter(item => same(identityOf(item.data), identityOf(desired))
        && Object.entries(request.changes).every(([key, value]) => Object.hasOwn(item.data, key) && same(item.data[key], value)));
      if (anchor && reflected.length > 1) conflict('target.ambiguous', '요청 값이 반영된 프로젝트 후보가 여러 개입니다.', reflected);
      if (anchor && reflected.length === 1) return text;
      const candidates = registry.items.filter(item => compatible(item.data, selector) || compatible(item.data, desired));
      conflict(candidates.length > 1 ? 'target.ambiguous' : candidates.length ? 'target.conflict' : 'target.missing',
        '원래 항목 전체 값이 일치하지 않습니다. 최신 원문과 후보를 확인하세요.', candidates);
    }
    const selected = exact[0];
    if (same(selected.data, desired)) return text;
    const others = registry.items.filter(item => item !== selected);
    const collisions = others.filter(item => same(item.data, desired)
      || (!same(identityOf(selector), identityOf(desired)) && compatible(item.data, desired)));
    if (collisions.length) conflict('target.conflict', '수정 결과가 다른 프로젝트 후보와 겹칩니다. 자동으로 합치거나 복제하지 않습니다.', collisions);
    const edits = [];
    const additions = [];
    for (const [key, value] of Object.entries(request.changes)) {
      if (Object.hasOwn(selected.data, key) && same(selected.data[key], value)) continue;
      const property = selected.properties.get(key);
      if (property) edits.push({ start: property.initializer.getStart(registry.source), end: property.initializer.end, text: JSON.stringify(value) });
      else additions.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
    }
    edits.push(...staticMemberEdits(text, registry.source, selected.node, selected.node.properties, additions));
    result = applySourceEdits(text, edits);
    expected = registry.items.map(item => item === selected ? desired : item.data);
  }
  const actual = inspectProjectSource(result).items.map(item => item.data);
  if (!same(actual, expected)) throw new OperationContractError('patch.unsupported', 'PROJECTS', '요청 밖 프로젝트 값·순서의 보존을 확인할 수 없습니다.');
  return result;
}
