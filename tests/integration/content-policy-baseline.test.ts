import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import ts from 'typescript';
import { validateContentCollection } from '../../src/lib/content-collection-validation.mjs';

it('현재 수집 콘텐츠와 등록 정보를 읽기 전용으로 검사하고 승인된 기존 예외만 보고한다', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const source = ts.createSourceFile('consts.ts', readFileSync(join(root, 'src/consts.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const registry = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(source) === 'CATEGORIES')?.initializer;
  if (!registry || !ts.isObjectLiteralExpression(registry)) throw new Error('정적 CATEGORIES 객체가 필요합니다.');
  const categories = Object.fromEntries(registry.properties.map(property => {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)
      || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) throw new Error('지원하지 않는 카테고리 표현식');
    return [property.name.text, property.initializer.text];
  }));
  const baselinePath = join(root, 'config/content-policy-baseline.json');
  const baselineBytes = readFileSync(baselinePath);
  const baselineDocument = parseDocument(baselineBytes.toString('utf8'), { uniqueKeys: true });
  expect(baselineDocument.errors).toEqual([]);
  const baseline = baselineDocument.toJS({ maxAliasCount: 50 });
  const documents: { kind: 'blog' | 'fragment'; path: string; source: string }[] = [];
  const before = new Map<string, Buffer>();
  const collect = (directory: string, kind: 'blog' | 'fragment') => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { collect(path, kind); continue; }
      if (kind === 'blog' ? entry.name !== 'index.md' : !entry.name.endsWith('.md')) continue;
      const bytes = readFileSync(path);
      before.set(path, bytes);
      documents.push({ kind, path: relative(root, path).replaceAll('\\', '/'), source: bytes.toString('utf8') });
    }
  };
  collect(join(root, 'src/content/blog'), 'blog');
  collect(join(root, 'src/content/fragments'), 'fragment');
  const result = validateContentCollection({ documents, categories, baseline });
  expect(result.ok).toBe(true);
  expect(result.diagnostics).toEqual([]);
  expect(result.graphChecked).toBe(true);
  const reported = result.knownIssues.map(({ rule, path, value }) => ({ rule, path, value }));
  expect(reported).toHaveLength(baseline.exceptions.length);
  expect(reported).toEqual(expect.arrayContaining(baseline.exceptions));
  expect(result.unusedExceptions).toEqual([]);
  for (const [path, bytes] of before) expect(readFileSync(path)).toEqual(bytes);
  expect(readFileSync(baselinePath)).toEqual(baselineBytes);
});
