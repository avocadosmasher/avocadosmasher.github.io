import { LineCounter, parseDocument } from 'yaml';
import { lexer, walkTokens } from 'marked';
import { blogSchema, fragmentSchema } from './content-schemas.mjs';
import { splitFrontmatter } from './content-frontmatter.mjs';

/**
 * @typedef {{path: string, rule: string, field: string, message: string, line?: number, column?: number}} ContentDiagnostic
 */

/**
 * 한 문서의 확정 입력을 검사한다. 파일을 읽거나 수정하지 않는 순수 함수다.
 * @param {{kind: 'blog' | 'fragment', path: string, source: string}} input
 * @returns {{ok: boolean, diagnostics: ContentDiagnostic[]}}
 */
export function validateContentSource(input) {
  /** @type {ContentDiagnostic[]} */
  const diagnostics = [];
  const finish = () => ({ ok: diagnostics.length === 0, diagnostics });
  /** @param {string} rule @param {string} field @param {string} message */
  const add = (rule, field, message) => diagnostics.push({ path: input.path, rule, field, message });
  if (!['blog', 'fragment'].includes(input.kind)) {
    add('content.kind', 'kind', '문서 종류는 blog 또는 fragment여야 합니다.');
    return finish();
  }
  const frontmatter = splitFrontmatter(input.source);
  if (!frontmatter) {
    add('markdown.frontmatter', 'frontmatter', '문서 시작의 YAML frontmatter 구분자를 확인하세요.');
    return finish();
  }
  const { header, body } = frontmatter;
  const lineCounter = new LineCounter();
  const document = parseDocument(header, { uniqueKeys: true, lineCounter });
  if (document.errors.length) {
    for (const error of document.errors) {
      const position = lineCounter.linePos(error.pos[0]);
      diagnostics.push({ path: input.path, rule: 'yaml.invalid', field: 'frontmatter',
        message: `YAML 형식 오류: ${error.code}`, line: position.line + 1, column: position.col });
    }
    return finish();
  }
  let data;
  try { data = document.toJS({ maxAliasCount: 50 }); }
  catch {
    add('yaml.invalid', 'frontmatter', 'YAML 별칭을 안전하게 해석할 수 없습니다.');
    return finish();
  }
  const schema = input.kind === 'blog' ? blogSchema : fragmentSchema;
  if (input.kind === 'fragment' && data && typeof data === 'object' && !Array.isArray(data)) {
    for (const field of Object.keys(data)) {
      if (!Object.hasOwn(fragmentSchema.shape, field)) {
        add('content.unknown-field', field, `Fragment에서 지원하지 않는 필드입니다: ${field}`);
      }
    }
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || 'frontmatter';
      const original = issue.path.reduce((value, key) => value == null ? undefined : value[key], data);
      const missing = issue.path.length > 0 && original === undefined;
      add(missing ? 'content.required' : 'content.schema', field,
        missing ? `필수 필드 ${field}가 없습니다.` : `필드 ${field}가 현재 콘텐츠 형식에 맞지 않습니다: ${issue.message}`);
    }
  }
  const requiredStrings = input.kind === 'blog' ? ['title', 'description', 'category'] : [];
  for (const field of requiredStrings) {
    if (typeof data?.[field] === 'string' && data[field].trim() === '') {
      add('content.required', field, `필수 필드 ${field}를 공백으로 둘 수 없습니다.`);
    }
  }
  if (input.kind === 'blog' && data && Object.hasOwn(data, 'pubDate')) {
    const value = data.pubDate;
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      add('blog.date', 'pubDate', 'pubDate는 실제 존재하는 날짜를 YYYY-MM-DD 형식으로 작성하세요.');
    }
  }
  const pending = /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/;
  /** @param {string} value @param {string} field */
  const checkPlaceholder = (value, field) => {
    const marker = value.match(pending)?.[0];
    if (marker) add('content.placeholder', field, `확정 값으로 바꾸지 않은 치환 표시가 있습니다: ${marker}`);
  };
  const visited = new WeakSet();
  /** @param {unknown} value @param {string} field */
  const inspect = (value, field) => {
    if (typeof value === 'string') checkPlaceholder(value, field);
    else if (value && typeof value === 'object' && !visited.has(value)) {
      visited.add(value);
      for (const [key, item] of Object.entries(value)) inspect(item, field ? `${field}.${key}` : key);
    }
  };
  inspect(data, '');
  walkTokens(lexer(body), token => {
    // Markdown 코드 예제는 작성자가 의도한 설명 자료이므로 미확정 본문으로 판단하지 않는다.
    if (['text', 'escape', 'html'].includes(token.type) && 'text' in token && typeof token.text === 'string') {
      checkPlaceholder(token.text, 'body');
    }
    if (token.type === 'link' || token.type === 'image') {
      checkPlaceholder(token.href, 'body');
      if (token.title) checkPlaceholder(token.title, 'body');
    }
  });
  return finish();
}
