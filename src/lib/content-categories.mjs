import ts from 'typescript';
import { canonicalHash, OperationContractError } from './content-operation-contract.mjs';

export class CategorySourceError extends Error {}

// 검사기와 편집기가 같은 정적 객체 범위를 해석함. 설정 모듈을 실행하지 않음.
export function inspectCategorySource(text) {
  const fail = message => { throw new CategorySourceError(message); };
  const source = ts.createSourceFile('consts.ts', text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) fail('consts.ts의 TypeScript 구문 오류를 먼저 수정하세요.');
  const declarations = source.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations].map(declaration => ({ statement, declaration })))
    .filter(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === 'CATEGORIES');
  if (declarations.length !== 1) fail('CATEGORIES 선언은 정확히 하나여야 합니다.');
  const { statement, declaration } = declarations[0];
  if (!(statement.declarationList.flags & ts.NodeFlags.Const)
    || !statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    || !declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
    fail('export const CATEGORIES에 정적 객체를 직접 지정해야 합니다.');
  }
  const properties = new Map();
  for (const property of declaration.initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)
      || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      fail('CATEGORIES는 정적 키와 문자열 값만 지원합니다. 계산식·별칭·spread를 추측하지 않습니다.');
    }
    const key = property.name.text;
    if (properties.has(key) || key === '__proto__') fail(`중복되거나 지원하지 않는 카테고리 키입니다: ${key}`);
    properties.set(key, property);
  }
  return { source, declaration, object: declaration.initializer, properties,
    categories: Object.fromEntries([...properties].map(([key, property]) => [key, property.initializer.text])) };
}

export function patchCategorySource(text, key, color, operation) {
  const registry = inspectCategorySource(text);
  const visit = node => {
    if (ts.isIdentifier(node) && node.text === 'CATEGORIES' && node !== registry.declaration.name) {
      const parent = node.parent;
      const propertyName = parent && (ts.isPropertyAssignment(parent) || ts.isPropertyAccessExpression(parent)) && parent.name === node;
      if (!propertyName) throw new OperationContractError('patch.unsupported', 'CATEGORIES', '선언 밖 CATEGORIES 참조의 영향을 추측해 편집하지 않습니다.');
    }
    ts.forEachChild(node, visit);
  };
  visit(registry.source);
  const existing = registry.properties.get(key);
  if (existing) {
    if (registry.categories[key] === color) return text;
    if (operation === 'create') throw new OperationContractError('target.conflict', key, '같은 카테고리 키가 다른 색으로 등록되어 있습니다.');
    const value = existing.initializer;
    return text.slice(0, value.getStart(registry.source)) + JSON.stringify(color) + text.slice(value.end);
  }
  if (operation === 'update') throw new OperationContractError('target.missing', key, '수정할 카테고리 키가 없습니다. 신규 등록으로 바꾸지 않습니다.');
  const object = registry.object;
  const closing = object.end - 1;
  const lineStart = text.lastIndexOf('\n', closing - 1) + 1;
  const prefix = text.slice(lineStart, closing);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const pair = `${JSON.stringify(key)}: ${JSON.stringify(color)}`;
  const edits = [];
  const last = object.properties.at(-1);
  if (last && !object.properties.hasTrailingComma) edits.push({ start: last.end, text: ',' });
  if (/^[ \t]*$/.test(prefix) && lineStart > object.getStart(registry.source)) {
    const first = object.properties[0];
    const firstStart = first?.getStart(registry.source);
    const firstPrefix = firstStart === undefined ? '' : text.slice(text.lastIndexOf('\n', firstStart - 1) + 1, firstStart);
    const indent = first && /^[ \t]+$/.test(firstPrefix) ? firstPrefix : prefix + '  ';
    edits.push({ start: lineStart, text: indent + pair + ',' + newline });
  } else edits.push({ start: closing, text: (/\s$/.test(text.slice(0, closing)) ? '' : ' ') + pair + ' ' });
  let result = text;
  // 같은 위치라면 항목을 먼저 삽입한 뒤 구분 쉼표를 그 앞에 추가함.
  for (const edit of edits.reverse().sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.start);
  const actual = inspectCategorySource(result).categories;
  if (canonicalHash(actual) !== canonicalHash({ ...registry.categories, [key]: color })) {
    throw new OperationContractError('patch.unsupported', key, '요청 밖 카테고리의 보존을 확인할 수 없습니다.');
  }
  return result;
}
