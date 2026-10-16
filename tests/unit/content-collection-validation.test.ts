import { describe, expect, it } from 'vitest';
import { validateContentCollection } from '../../src/lib/content-collection-validation.mjs';
import { markdownFixtures, parseMarkdown, serializeMarkdown } from '../../scripts/ai-content-fixtures.mjs';

const categories = { AI: '#007FFF' };
const legacyException = { rule: 'category.unregistered' as const, path: 'src/content/fragments/fixture-legacy.md', value: 'LegacyCategory' };
const card = (id: string, changes: Record<string, unknown> = {}) => {
  const { data, body } = parseMarkdown(markdownFixtures().fragment);
  return { kind: 'fragment' as const, path: `src/content/fragments/${id}.md`, source: serializeMarkdown({ ...data, id, ...changes }, body) };
};

describe('ACTV02 전체 콘텐츠 정책 검사', () => {
  it('새 카드의 미등록 카테고리를 정확한 파일·값과 함께 거절한다', () => {
    const result = validateContentCollection({ documents: [card('fixture-alpha', { category: 'Unknown' })], categories });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      rule: 'category.unregistered', path: 'src/content/fragments/fixture-alpha.md', field: 'category', value: 'Unknown',
    }));
  });

  it('서로 다른 파일에 저장된 같은 Fragment ID를 거절한다', () => {
    const first = card('fixture-alpha');
    const second = { ...first, path: 'src/content/fragments/other-name.md' };
    const result = validateContentCollection({ documents: [first, second], categories });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.duplicate-id', field: 'id', value: 'fixture-alpha' }));
  });

  it('없는 관계 대상과 자기 참조를 각각 진단한다', () => {
    const result = validateContentCollection({ documents: [card('fixture-alpha', { relations: [
      { target: 'missing-card', type: 'related' }, { target: 'fixture-alpha', type: 'prerequisite' },
    ] })], categories });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.missing-target', field: 'relations.0.target', value: 'missing-card' }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.self-relation', field: 'relations.1.target', value: 'fixture-alpha' }));
  });

  it('방향·유형만 바꿔 양쪽 파일에 기록한 관계를 중복으로 거절한다', () => {
    const documents = [card('fixture-alpha', { relations: [{ target: 'fixture-beta', type: 'related' }] }),
      card('fixture-beta', { relations: [{ target: 'fixture-alpha', type: 'contrasts' }] })];
    const result = validateContentCollection({ documents, categories });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'fragment.duplicate-relation', relatedPath: expect.any(String) }));
  });

  it('정확한 경로·문제 값의 기존 예외를 지우지 않고 보고하면서 허용한다', () => {
    const result = validateContentCollection({ documents: [card('fixture-legacy', { category: 'LegacyCategory' })], categories,
      baseline: { version: 1, exceptions: [legacyException] } });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.knownIssues).toContainEqual(expect.objectContaining(legacyException));
    expect(result.unusedExceptions).toEqual([]);
  });

  it('입력 파일 순서가 바뀌어도 같은 위치·순서의 진단을 반환한다', () => {
    const documents = [card('fixture-beta', { relations: [{ target: 'fixture-alpha', type: 'contrasts' }] }),
      card('fixture-alpha', { relations: [{ target: 'fixture-beta', type: 'related' }] })];
    expect(validateContentCollection({ documents, categories }))
      .toEqual(validateContentCollection({ documents: [...documents].reverse(), categories }));
  });

  it('null 예외 설정을 빈 예외 목록으로 해석하지 않는다', () => {
    const result = validateContentCollection({ documents: [card('fixture-alpha')], categories, baseline: null });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'baseline.invalid' }));
  });

  it('같은 파일 경로를 다른 카드로 중복 전달하면 불완전한 스냅샷으로 거절한다', () => {
    const first = card('fixture-alpha');
    const result = validateContentCollection({ documents: [first, { ...card('fixture-beta'), path: first.path }], categories });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'content.duplicate-path' }));
    expect(result.graphChecked).toBe(false);
  });

  it('등록 카테고리와 한쪽에만 저장한 유효 관계를 허용한다', () => {
    const documents = [card('fixture-alpha', { relations: [{ target: 'fixture-beta', type: 'prerequisite' }] }), card('fixture-beta')];
    expect(validateContentCollection({ documents, categories })).toEqual({
      ok: true, diagnostics: [], knownIssues: [], unusedExceptions: [], graphChecked: true,
    });
  });

  it('글의 미등록 카테고리에도 같은 정책을 적용한다', () => {
    const { data, body } = parseMarkdown(markdownFixtures().blog);
    const document = { kind: 'blog' as const, path: 'src/content/blog/fixture/index.md', source: serializeMarkdown({ ...data, category: 'Unknown' }, body) };
    const result = validateContentCollection({ documents: [document], categories });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ path: document.path, rule: 'category.unregistered', value: 'Unknown' }));
  });

  it.each(['related', 'prerequisite', 'part-of', 'contrasts'])('같은 파일의 관계 중복도 유형 %s와 무관하게 거절한다', type => {
    const documents = [card('fixture-alpha', { relations: [
      { target: 'fixture-beta', type: 'related' }, { target: 'fixture-beta', type },
    ] }), card('fixture-beta')];
    const result = validateContentCollection({ documents, categories });
    expect(result.diagnostics.filter(item => item.rule === 'fragment.duplicate-relation')).toHaveLength(1);
  });

  it('하나의 카드에 다른 상대 카드들과의 관계는 허용한다', () => {
    const documents = [card('fixture-alpha', { relations: [
      { target: 'fixture-beta', type: 'related' }, { target: 'fixture-gamma', type: 'related' },
    ] }), card('fixture-beta'), card('fixture-gamma')];
    expect(validateContentCollection({ documents, categories }).ok).toBe(true);
  });

  it('기존 예외의 제목만 바꾸어도 원래 예외는 유지한다', () => {
    const document = card('fixture-legacy', { category: 'LegacyCategory', title: '수정한 제목' });
    const original = document.source;
    const result = validateContentCollection({ documents: [document], categories, baseline: { version: 1, exceptions: [legacyException] } });
    expect(result.ok).toBe(true);
    expect(result.knownIssues).toHaveLength(1);
    expect(document.source).toBe(original);
  });

  it.each([
    { id: 'fixture-new', category: 'LegacyCategory' },
    { id: 'fixture-legacy', category: 'AnotherUnknown' },
  ])('예외와 다른 경로 또는 값의 신규 위반은 허용하지 않는다: %j', ({ id, category }) => {
    const result = validateContentCollection({ documents: [card(id, { category })], categories, baseline: { version: 1, exceptions: [legacyException] } });
    expect(result.ok).toBe(false);
    expect(result.knownIssues).toEqual([]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'category.unregistered', value: category }));
    expect(result.unusedExceptions).toEqual([legacyException]);
  });

  it('해소된 기존 예외는 사용 중이라고 보고하지 않고 미사용 목록으로 반환한다', () => {
    const result = validateContentCollection({ documents: [card('fixture-legacy')], categories,
      baseline: { version: 1, exceptions: [legacyException] } });
    expect(result.ok).toBe(true);
    expect(result.knownIssues).toEqual([]);
    expect(result.unusedExceptions).toEqual([legacyException]);
  });

  it('예외가 있어도 필수 필드 오류를 무시하지 않는다', () => {
    const invalid = card('fixture-legacy', { category: 'LegacyCategory', title: '' });
    const result = validateContentCollection({ documents: [invalid], categories, baseline: { version: 1, exceptions: [legacyException] } });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(item => item.field === 'title')).toBe(true);
    expect(result.graphChecked).toBe(false);
  });

  it('카드가 잘못되면 관계 검사 완료로 표시하거나 없는 대상 오류를 추측하지 않는다', () => {
    const documents = [card('fixture-alpha', { relations: [{ target: 'fixture-beta', type: 'related' }] }), card('fixture-beta', { title: '' })];
    const result = validateContentCollection({ documents, categories });
    expect(result.ok).toBe(false);
    expect(result.graphChecked).toBe(false);
    expect(result.diagnostics.some(item => item.rule === 'fragment.missing-target')).toBe(false);
  });

  it.each([
    {}, { version: 2, exceptions: [] }, { version: 1, exceptions: [legacyException, legacyException] },
    { version: 1, exceptions: [{ ...legacyException, rule: 'fragment.duplicate-id' }] },
    { version: 1, exceptions: [{ ...legacyException, path: 'src/content/fragments/*.md' }] },
    { version: 1, exceptions: [{ ...legacyException, path: 'src/content/fragments/../other.md' }] },
    { version: 1, exceptions: [{ ...legacyException, path: 'src\\content\\fragments\\fixture-legacy.md' }] },
    { version: 1, exceptions: [{ ...legacyException, value: '' }] },
    { version: 1, exceptions: [{ ...legacyException, value: ' LegacyCategory ' }] },
    { version: 1, exceptions: [{ ...legacyException, wildcard: true }] },
  ])('잘못되거나 범위가 넓은 예외 설정을 거절한다: %j', baseline => {
    const result = validateContentCollection({ documents: [card('fixture-alpha')], categories, baseline });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'baseline.invalid' }));
    expect(result.graphChecked).toBe(false);
  });

  it('등록 객체의 상속 속성을 등록 카테고리로 간주하지 않는다', () => {
    const inherited = Object.create({ Inherited: '#123456' });
    const result = validateContentCollection({ documents: [card('fixture-alpha', { category: 'Inherited' })], categories: inherited });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'category.unregistered' }));
  });

  it('잘못된 등록 정보는 빈 등록 목록으로 대체하지 않는다', () => {
    const result = validateContentCollection({ documents: [card('fixture-alpha')], categories: { AI: 123 } as unknown as Record<string, string> });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ rule: 'registry.invalid' }));
  });

  it('동결한 입력·예외를 변경하지 않고 같은 결과를 재현한다', () => {
    const documents = Object.freeze([Object.freeze(card('fixture-legacy', { category: 'LegacyCategory' }))]);
    const baseline = Object.freeze({ version: 1, exceptions: Object.freeze([Object.freeze({ ...legacyException })]) });
    const input = { documents: [...documents], categories: Object.freeze({ ...categories }), baseline };
    const before = JSON.stringify(input);
    expect(validateContentCollection(input)).toEqual(validateContentCollection(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});
