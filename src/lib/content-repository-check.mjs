import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { parseDocument } from 'yaml';
import { validateContentCollection } from './content-collection-validation.mjs';

class RepositoryInputError extends Error {
  constructor(diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function readCategories(text) {
  const fail = message => { throw new RepositoryInputError({ path: 'src/consts.ts', rule: 'registry.invalid', field: 'CATEGORIES', message }); };
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
  const entries = new Map();
  for (const property of declaration.initializer.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)
      || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      fail('CATEGORIES는 정적 키와 문자열 값만 지원합니다. 계산식·별칭·spread를 추측하지 않습니다.');
    }
    const key = property.name.text;
    if (entries.has(key) || key === '__proto__') fail(`중복되거나 지원하지 않는 카테고리 키입니다: ${key}`);
    entries.set(key, property.initializer.text);
  }
  return Object.fromEntries(entries);
}

function readBaseline(text) {
  try {
    const value = JSON.parse(text);
    if (parseDocument(text, { uniqueKeys: true }).errors.length) throw new Error('Duplicate keys');
    return value;
  } catch {
    throw new RepositoryInputError({ path: 'config/content-policy-baseline.json', rule: 'baseline.invalid',
      field: 'baseline', message: '중복 키 없는 올바른 JSON 예외 파일이 필요합니다.' });
  }
}

/** @param {string} root */
export function checkContentRepository(root) {
  const documents = [];
  const summary = () => ({ blogs: documents.filter(document => document.kind === 'blog').length,
    fragments: documents.filter(document => document.kind === 'fragment').length });
  const rejectLink = path => { throw new RepositoryInputError({ path: path || '.', rule: 'input.symlink', field: 'source',
    message: '심볼릭 링크나 junction을 포함한 입력은 지원하지 않습니다. 실제 저장소 파일을 지정하세요.' }); };
  const read = (path, action) => {
    try {
      if (lstatSync(root).isSymbolicLink()) rejectLink('');
      const parts = path.split('/');
      for (let index = 1; index <= parts.length; index++) {
        const partial = parts.slice(0, index).join('/');
        if (lstatSync(join(root, partial)).isSymbolicLink()) rejectLink(partial);
      }
      return action(join(root, path));
    } catch (error) {
      if (error instanceof RepositoryInputError) throw error;
      throw new RepositoryInputError({ path, rule: 'input.unreadable', field: 'source',
        message: `입력 파일이나 폴더를 읽을 수 없습니다 (${error.code ?? 'UNKNOWN'}).` });
    }
  };
  try {
    const categories = readCategories(read('src/consts.ts', path => readFileSync(path, 'utf8')));
    const baseline = readBaseline(read('config/content-policy-baseline.json', path => readFileSync(path, 'utf8')));
    const collect = (directory, kind) => {
      const entries = read(directory, path => readdirSync(path, { withFileTypes: true }));
      entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const path = `${directory}/${entry.name}`;
        if (entry.isSymbolicLink()) rejectLink(path);
        if (entry.isDirectory()) { collect(path, kind); continue; }
        if (kind === 'blog' ? entry.name !== 'index.md' : !entry.name.endsWith('.md')) continue;
        documents.push({ kind, path, source: read(path, absolute => readFileSync(absolute, 'utf8')) });
      }
    };
    collect('src/content/blog', 'blog');
    collect('src/content/fragments', 'fragment');
    return { ...validateContentCollection({ documents, categories, baseline }),
      summary: summary(), collectionComplete: true };
  } catch (error) {
    const diagnostic = error instanceof RepositoryInputError ? error.diagnostic : {
      path: 'scripts/content-check.mjs', rule: 'input.invalid', field: 'source', message: '입력을 읽거나 해석하지 못했습니다.',
    };
    return { ok: false, diagnostics: [diagnostic], knownIssues: [], unusedExceptions: [],
      graphChecked: false, collectionComplete: false, summary: summary() };
  }
}
