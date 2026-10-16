import { describe, expect, it } from 'vitest';
import { validateContentSource } from '../../src/lib/content-validation.mjs';
import { markdownFixtures, parseMarkdown, serializeMarkdown } from '../../scripts/ai-content-fixtures.mjs';

const blogWith = (changes: Record<string, unknown>) => {
  const { data, body } = parseMarkdown(markdownFixtures().blog);
  return serializeMarkdown({ ...data, ...changes }, body);
};

describe('ACTV01 읽기 전용 콘텐츠 검사', () => {
  it('확정 값을 채운 글·Fragment 템플릿을 허용한다', () => {
    const fixtures = markdownFixtures();
    for (const kind of ['blog', 'fragment'] as const) {
      expect(validateContentSource({ kind, path: `fixture/${kind}.md`, source: fixtures[kind] }))
        .toEqual({ ok: true, diagnostics: [] });
    }
  });

  it('제목 없는 글에 파일·필드·원인이 포함된 진단을 반환한다', () => {
    const source = markdownFixtures().blog.replace(/^title:.*\n/m, '');
    const result = validateContentSource({ kind: 'blog', path: 'fixture/post/index.md', source });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'fixture/post/index.md', rule: 'content.required', field: 'title', message: expect.any(String) }),
    ]));
  });

  it('현행 스키마가 허용하는 공백 제목을 작성 규칙에서 거절한다', () => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ title: '  ' }) });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.required', field: 'title' }));
  });

  it('날짜 자동 보정으로 통과할 수 있는 2월 30일을 거절한다', () => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ pubDate: '2026-02-30' }) });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'blog.date', field: 'pubDate' }));
  });

  it('본문에 남은 템플릿 치환 표시를 진단한다', () => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: `${markdownFixtures().blog}\n{{INTRO}}\n` });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.placeholder', field: 'body' }));
  });

  it('템플릿 문법을 설명하는 코드 블록과 인라인 코드 예제를 허용한다', () => {
    const source = `${markdownFixtures().blog}\n\`{{TITLE}}\`\n\n\`\`\`text\n{{INTRO}}\n\`\`\`\n`;
    expect(validateContentSource({ kind: 'blog', path: 'fixture/index.md', source }).ok).toBe(true);
  });

  it('현재 웹 작성기가 지원하지 않는 Fragment 필드를 거절한다', () => {
    const { data, body } = parseMarkdown(markdownFixtures().fragment);
    const source = serializeMarkdown({ ...data, draft: true }, body);
    const result = validateContentSource({ kind: 'fragment', path: 'fixture/card.md', source });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.unknown-field', field: 'draft' }));
  });

  it('실행 시 잘못된 대상 종류를 Fragment로 추측하지 않는다', () => {
    const result = validateContentSource({ kind: 'project' as 'fragment', path: 'fixture/item.md', source: markdownFixtures().fragment });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.kind', field: 'kind' }));
  });

  it.each(['title', 'description', 'category', 'pubDate'])('필수 글 필드 %s 누락을 진단한다', field => {
    const { data, body } = parseMarkdown(markdownFixtures().blog);
    delete data[field];
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: serializeMarkdown(data, body) });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.required', field }));
  });

  it.each(['id', 'title', 'summary', 'category'])('필수 Fragment 필드 %s 누락을 진단한다', field => {
    const { data, body } = parseMarkdown(markdownFixtures().fragment);
    delete data[field];
    const result = validateContentSource({ kind: 'fragment', path: 'fixture/card.md', source: serializeMarkdown(data, body) });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.required', field }));
  });

  it.each(['description', 'category'])('필수 글 문자열 %s의 공백을 거절한다', field => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ [field]: '\t  ' }) });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.required', field }));
  });

  it.each(['2026-2-03', '2026-01-02T00:00:00Z', '2025-02-29', '2026-13-01', '', null, true, 0])('날짜 %s를 임의로 보정하지 않는다', pubDate => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ pubDate }) });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'blog.date', field: 'pubDate' }));
  });

  it.each(['2024-02-29', '2026-12-31'])('실제 달력 날짜 %s를 허용한다', pubDate => {
    expect(validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ pubDate }) }).ok).toBe(true);
  });

  it.each(['../unsafe', 'Uppercase', 'two--hyphens', ''])('안전하지 않은 Fragment ID %s를 거절한다', id => {
    const { data, body } = parseMarkdown(markdownFixtures().fragment);
    const result = validateContentSource({ kind: 'fragment', path: 'fixture/card.md', source: serializeMarkdown({ ...data, id }, body) });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.schema', field: 'id' }));
  });

  it('중복 YAML 키를 덮어쓰지 않고 원본 줄 위치와 함께 진단한다', () => {
    const source = '---\ntitle: first\ntitle: second\n---\n';
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'yaml.invalid', line: 3, column: 1 }));
  });

  it('빈 frontmatter의 구분자는 인정하고 비어 있는 데이터 계약을 진단한다', () => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: '---\n---\n본문\n' });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.schema', field: 'frontmatter' }));
    expect(result.diagnostics.some(item => item.rule === 'markdown.frontmatter')).toBe(false);
  });

  it.each(['---\ntitle: [unclosed\n---\n', '---\n[one, two]\n---\n', 'no frontmatter', 'before\n---\ntitle: later\n---\n'])('잘못된 문서 %s를 예외 대신 진단으로 반환한다', source => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('중첩 필드의 오류 위치와 미완성 메타데이터를 진단한다', () => {
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source: blogWith({ tags: [123, '{{TAG}}'] }) });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.schema', field: 'tags.0' }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.placeholder', field: 'tags.1' }));
  });

  it('링크·이미지 경로의 치환값은 코드 예제 밖에서 검사한다', () => {
    const source = `${markdownFixtures().blog}\n![이미지](./{{IMAGE}}.png)\n[문서](./{{TARGET}})\n`;
    const result = validateContentSource({ kind: 'blog', path: 'fixture/index.md', source });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.filter(item => item.rule === 'content.placeholder')).toHaveLength(2);
  });

  it('BOM·CRLF 문서를 변경하지 않고 같은 검사 결과를 반환한다', () => {
    const source = `\uFEFF${markdownFixtures().blog.replaceAll('\n', '\r\n')}`;
    const input = Object.freeze({ kind: 'blog' as const, path: 'fixture/index.md', source });
    const first = validateContentSource(input);
    expect(first).toEqual({ ok: true, diagnostics: [] });
    expect(validateContentSource(input)).toEqual(first);
    expect(input.source).toBe(source);
  });

  it('현 단계에서 카테고리 등록 여부와 전체 카드 관계를 검사했다고 주장하지 않는다', () => {
    const source = blogWith({ category: 'unregistered-fixture' });
    expect(validateContentSource({ kind: 'blog', path: 'fixture/index.md', source }).ok).toBe(true);
    const { data, body } = parseMarkdown(markdownFixtures().fragment);
    const card = serializeMarkdown({ ...data, relations: [{ target: 'not-yet-loaded', type: 'related' }] }, body);
    expect(validateContentSource({ kind: 'fragment', path: 'fixture/card.md', source: card }).ok).toBe(true);
  });
});
