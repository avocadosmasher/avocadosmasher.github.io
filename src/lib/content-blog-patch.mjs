import { isMap, isSeq, parseDocument } from 'yaml';
import { canonicalHash, OperationContractError } from './content-operation-contract.mjs';
import { splitFrontmatter } from './content-frontmatter.mjs';
import { blogSchema } from './content-schemas.mjs';
import { validateContentSource } from './content-validation.mjs';

// 요청 필드의 값 범위만 교체함. 나머지 YAML과 Markdown은 직렬화하지 않음.
export function patchBlogSource(bytes, changes, path) {
  const source = bytes.toString('utf8');
  const validation = validateContentSource({ kind: 'blog', path, source });
  if (!Buffer.from(source, 'utf8').equals(bytes) || !validation.ok) {
    throw new OperationContractError('content.invalid', path, validation.diagnostics[0]?.message ?? 'UTF-8 원문이 아닙니다.');
  }
  const { header, body } = splitFrontmatter(source);
  const document = parseDocument(header);
  const data = blogSchema.parse(document.toJS({ maxAliasCount: 50 }));
  const edits = [];
  const additions = [];
  const openingLength = source.match(/^\uFEFF?---\r?\n/)[0].length;
  const newline = source.slice(openingLength - 2, openingLength) === '\r\n' ? '\r\n' : '\n';
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'body') {
      if (body !== value) edits.push({ start: source.length - body.length, end: source.length, text: value });
      continue;
    }
    const current = key === 'pubDate' ? data.pubDate.toISOString().slice(0, 10) : data[key];
    if (current !== undefined && canonicalHash(current) === canonicalHash(value)) continue;
    // 흐름 매핑·앵커를 전체 재작성하면 요청 밖 값이 바뀔 수 있어 명시적으로 거절함.
    if (!isMap(document.contents) || document.contents.flow) {
      throw new OperationContractError('patch.unsupported', key, '부분 수정은 블록 YAML 매핑에서 지원합니다.');
    }
    const node = document.get(key, true);
    if (!node) { additions.push(`${key}: ${JSON.stringify(value)}`); continue; }
    const anchored = item => item?.anchor || (isSeq(item) && item.items.some(anchored))
      || (isMap(item) && item.items.some(pair => anchored(pair.key) || anchored(pair.value)));
    if (anchored(node)) throw new OperationContractError('patch.unsupported', key, '앵커가 있는 값은 다른 필드에 영향을 줄 수 있어 교체하지 않습니다.');
    if (!Array.isArray(node.range)) {
      throw new OperationContractError('patch.unsupported', key, '원문 값의 정확한 범위를 확인할 수 없습니다.');
    }
    const [start, end] = node.range;
    const ending = header.slice(start, end).match(/\r?\n$/)?.[0] ?? '';
    edits.push({ start: openingLength + start, end: openingLength + end, text: JSON.stringify(value) + ending });
  }
  if (additions.length) edits.push({ start: openingLength + header.length, end: openingLength + header.length,
    text: newline + additions.join(newline) });
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  const final = validateContentSource({ kind: 'blog', path, source: result });
  if (!final.ok) throw new OperationContractError('content.invalid', path, final.diagnostics[0].message);
  // 잘못된 범위 편집으로 요청 값이 누락되거나 다른 값이 바뀌는 경우 쓰기 전에 중단함.
  const actual = splitFrontmatter(result);
  const expectedData = blogSchema.parse({ ...data, ...Object.fromEntries(Object.entries(changes).filter(([key]) => key !== 'body')) });
  const actualData = blogSchema.parse(parseDocument(actual.header).toJS({ maxAliasCount: 50 }));
  const normalized = value => ({ ...value, pubDate: value.pubDate.toISOString() });
  if (canonicalHash(normalized(actualData)) !== canonicalHash(normalized(expectedData)) || actual.body !== (changes.body ?? body)) {
    throw new OperationContractError('patch.unsupported', path, '요청 값과 요청 밖 값의 보존을 확인할 수 없습니다.');
  }
  return result;
}
