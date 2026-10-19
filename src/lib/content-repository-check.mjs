import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { validateContentCollection } from './content-collection-validation.mjs';
import { CategorySourceError, inspectCategorySource } from './content-categories.mjs';

class RepositoryInputError extends Error {
  constructor(diagnostic) {
    super(diagnostic.message);
    this.diagnostic = diagnostic;
  }
}

function readCategories(text) {
  try { return inspectCategorySource(text).categories; }
  catch (error) {
    if (!(error instanceof CategorySourceError)) throw error;
    throw new RepositoryInputError({ path: 'src/consts.ts', rule: 'registry.invalid', field: 'CATEGORIES', message: error.message });
  }
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
function checkRepository(root, proposals, categorySource = undefined) {
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
    const originalCategories = read('src/consts.ts', path => readFileSync(path, 'utf8'));
    const categories = readCategories(categorySource === undefined ? originalCategories : categorySource);
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
    const combined = new Map(documents.map(document => [document.path, document]));
    const seen = new Set();
    for (const proposal of proposals) {
      const validPath = typeof proposal.path === 'string' && proposal.path.split('/').every(part => part && !part.startsWith('.') && !/[\\:\x00-\x1f]/.test(part));
      const matches = proposal.kind === 'blog' ? /^src\/content\/blog\/(?:[^/]+\/)+index\.md$/.test(proposal.path)
        : proposal.kind === 'fragment' && /^src\/content\/fragments\/.+\.md$/.test(proposal.path);
      if (!validPath || !matches || typeof proposal.source !== 'string' || seen.has(proposal.path)) {
        throw new RepositoryInputError({ path: proposal.path ?? '', rule: 'proposal.invalid', field: 'source', message: '제안 문서의 종류·수집 경로·원문·중복 경로를 확인하세요.' });
      }
      seen.add(proposal.path);
      combined.set(proposal.path, proposal);
    }
    documents.splice(0, documents.length, ...combined.values());
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

export function checkContentRepository(root) { return checkRepository(root, []); }

// 제안 원문을 메모리에서만 대조하며 실제 콘텐츠 파일은 수정하지 않음.
export function checkContentProposal(root, proposals) { return checkRepository(root, proposals); }

// 실제 문서를 쓰기 전에 제안한 CATEGORIES 원문으로 전체 콘텐츠 정책을 검사함.
export function checkCategoryProposal(root, source) { return checkRepository(root, [], source); }
