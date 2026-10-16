import { validateContentSource } from './content-validation.mjs';
import { parseDocument } from 'yaml';
import { blogSchema, fragmentSchema } from './content-schemas.mjs';
import { splitFrontmatter } from './content-frontmatter.mjs';
import { z } from 'zod';

const baselineSchema = z.object({
  version: z.literal(1),
  exceptions: z.array(z.object({
    rule: z.literal('category.unregistered'),
    path: z.string().refine(path => /^src\/content\/(?:blog\/(?:[^/]+\/)*index\.md|fragments\/.+\.md)$/.test(path)
      && !/[\\*?\u0000-\u001f]/.test(path) && !path.split('/').some(part => ['', '.', '..'].includes(part))),
    value: z.string().min(1).refine(value => value === value.trim()),
  }).strict()),
}).strict();
const exceptionKey = entry => JSON.stringify([entry.rule, entry.path, entry.value]);

/**
 * @param {{documents: {kind: 'blog' | 'fragment', path: string, source: string}[], categories: Record<string, string>, baseline?: unknown}} input
 */
export function validateContentCollection(input) {
  /** @type {(import('./content-validation.mjs').ContentDiagnostic & {value?: string, relatedPath?: string})[]} */
  const diagnostics = [];
  /** @type {typeof diagnostics} */
  const knownIssues = [];
  const baseline = baselineSchema.safeParse(input.baseline === undefined ? { version: 1, exceptions: [] } : input.baseline);
  if (!baseline.success) {
    for (const issue of baseline.error.issues) diagnostics.push({ path: 'config/content-policy-baseline.json',
      rule: 'baseline.invalid', field: issue.path.join('.') || 'baseline', message: '기존 예외 파일의 버전·규칙·정확한 경로·문제 값을 확인하세요.' });
    return { ok: false, diagnostics, knownIssues, unusedExceptions: [], graphChecked: false };
  }
  const exceptions = new Map();
  for (const [index, entry] of baseline.data.exceptions.entries()) {
    const key = exceptionKey(entry);
    if (exceptions.has(key)) diagnostics.push({ path: 'config/content-policy-baseline.json', rule: 'baseline.invalid',
      field: `exceptions.${index}`, message: '같은 기존 예외를 중복 등록할 수 없습니다.' });
    exceptions.set(key, entry);
  }
  if (diagnostics.length) return { ok: false, diagnostics, knownIssues, unusedExceptions: [], graphChecked: false };
  if (!z.record(z.string()).safeParse(input.categories).success) {
    diagnostics.push({ path: 'src/consts.ts', rule: 'registry.invalid', field: 'CATEGORIES',
      message: '카테고리 등록 정보는 키와 문자열 값으로 된 객체여야 합니다.' });
    return { ok: false, diagnostics, knownIssues, unusedExceptions: [], graphChecked: false };
  }
  const usedExceptions = new Set();
  /** @type {{path: string, data: import('zod').infer<typeof fragmentSchema>}[]} */
  const fragments = [];
  const documents = [...input.documents].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const paths = new Set();
  for (const document of documents) {
    if (paths.has(document.path)) {
      diagnostics.push({ path: document.path, rule: 'content.duplicate-path', field: 'path',
        message: '같은 파일 경로가 두 번 전달되어 전체 상태를 확인할 수 없습니다.' });
      continue;
    }
    paths.add(document.path);
    const validation = validateContentSource(document);
    diagnostics.push(...validation.diagnostics);
    if (!validation.ok) continue;
    const header = splitFrontmatter(document.source).header;
    const metadata = parseDocument(header).toJS({ maxAliasCount: 50 });
    const data = (document.kind === 'blog' ? blogSchema : fragmentSchema).parse(metadata);
    if (document.kind === 'fragment') fragments.push({ path: document.path, data: fragmentSchema.parse(metadata) });
    if (!Object.hasOwn(input.categories, data.category)) {
      const issue = { path: document.path, rule: 'category.unregistered', field: 'category',
        value: data.category, message: `등록되지 않은 카테고리입니다: ${data.category}` };
      const key = exceptionKey(issue);
      if (exceptions.has(key)) { knownIssues.push(issue); usedExceptions.add(key); }
      else diagnostics.push(issue);
    }
  }
  const ids = new Map();
  for (const fragment of fragments) {
    const previous = ids.get(fragment.data.id);
    if (previous) diagnostics.push({ path: fragment.path, rule: 'fragment.duplicate-id', field: 'id',
      value: fragment.data.id, relatedPath: previous.path, message: `중복 Fragment ID ${fragment.data.id}: ${previous.path}` });
    else ids.set(fragment.data.id, fragment);
  }
  const graphChecked = fragments.length === input.documents.filter(document => document.kind === 'fragment').length
    && ids.size === fragments.length;
  if (graphChecked) {
    const pairs = new Map();
    for (const fragment of fragments) {
      fragment.data.relations.forEach((relation, index) => {
        const rule = relation.target === fragment.data.id ? 'fragment.self-relation'
          : !ids.has(relation.target) ? 'fragment.missing-target' : undefined;
        if (rule) diagnostics.push({ path: fragment.path, rule, field: `relations.${index}.target`, value: relation.target,
          message: rule === 'fragment.self-relation' ? 'Fragment는 자기 자신을 참조할 수 없습니다.' : `존재하지 않는 관계 대상입니다: ${relation.target}` });
        if (rule) return;
        const key = JSON.stringify([fragment.data.id, relation.target].sort());
        const previous = pairs.get(key);
        if (previous) diagnostics.push({ path: fragment.path, rule: 'fragment.duplicate-relation', field: `relations.${index}`,
          value: key, relatedPath: previous.path, message: `같은 두 카드 사이의 관계가 중복됩니다: ${previous.path} (${previous.field})` });
        else pairs.set(key, { path: fragment.path, field: `relations.${index}` });
      });
    }
  }
  return { ok: diagnostics.length === 0, diagnostics, knownIssues,
    unusedExceptions: baseline.data.exceptions.filter(entry => !usedExceptions.has(exceptionKey(entry))), graphChecked };
}
