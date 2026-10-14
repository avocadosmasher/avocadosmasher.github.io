import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { collections } from '../../src/content.config';
import { validateFragments } from '../../src/lib/fragments';
import { fillMarkdownTemplate, markdownFixtures, parseMarkdown, jsonFixtures, fixtureValues } from '../../scripts/ai-content-fixtures.mjs';

vi.mock('astro:content', async () => ({
  defineCollection: (config: unknown) => config,
  z: (await import('zod')).z,
}));
vi.mock('astro/loaders', () => ({ glob: (config: unknown) => config }));

describe('AI 콘텐츠 격리 예시', () => {
  const examples = markdownFixtures();
  const blog = parseMarkdown(examples.blog).data;
  const fragment = parseMarkdown(examples.fragment).data;
  // Astro 전용 등록/로더만 대체하고 애플리케이션의 실제 Zod 스키마를 실행한다.
  const blogSchema = collections.blog.schema as z.ZodType;
  it('확정하지 않은 치환값은 예시 생성 전에 거절한다', () => {
    expect(() => fillMarkdownTemplate('---\ntitle: "{{TITLE}}"\n---\n{{BODY}}', { TITLE: '제목' }))
      .toThrow(/BODY/);
  });

  it('글 템플릿은 실제 스키마를 통과하고 날짜·draft·특수문자를 보존한다', () => {
    const result = blogSchema.parse(blog);
    expect(result.title).toBe(fixtureValues.TITLE);
    expect(result.pubDate.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(result.draft).toBe(true);
  });

  it.each(['title', 'description', 'category', 'pubDate'])('필수 글 필드 %s 누락을 거절한다', field => {
    const incomplete = { ...blog };
    delete incomplete[field];
    expect(blogSchema.safeParse(incomplete).success).toBe(false);
  });

  it('잘못된 글 날짜를 거절한다', () => {
    expect(blogSchema.safeParse({ ...blog, pubDate: '{{PUB_DATE}}' }).success).toBe(false);
  });

  it('실제 Fragment 계약은 두 카드와 유효한 연결을 허용한다', () => {
    expect(validateFragments([{ ...fragment, relations: [{ target: 'fixture-beta', type: 'related' }] },
      { ...fragment, id: 'fixture-beta' }])).toHaveLength(2);
  });

  it.each(['id', 'title', 'summary', 'category'])('필수 Fragment 필드 %s 누락을 거절한다', field => {
    const incomplete = { ...fragment };
    delete incomplete[field];
    expect(() => validateFragments([incomplete])).toThrow();
  });

  it('중복 ID와 없는 관계 대상, 자기 참조를 거절한다', () => {
    expect(() => validateFragments([fragment, fragment])).toThrow(/중복 ID.*fixture-alpha/);
    for (const target of ['missing-card', 'fixture-alpha']) {
      expect(() => validateFragments([{ ...fragment, relations: [{ target, type: 'related' }] }]))
        .toThrow(/잘못된 관계 대상/);
    }
  });

  it('미등록 카테고리와 중복 관계 쌍은 현재 공통 스키마에서 통과하는 한계를 드러낸다', () => {
    expect(blogSchema.safeParse({ ...blog, category: 'unregistered-fixture' }).success).toBe(true);
    expect(validateFragments([{ ...fragment, category: 'unregistered-fixture', relations: [
      { target: 'fixture-beta', type: 'related' }, { target: 'fixture-beta', type: 'contrasts' },
    ] }, { ...fragment, id: 'fixture-beta' }])).toHaveLength(2);
  });

  it('카테고리·프로젝트 JSON은 실제 consts 데이터 계약과 일치한다', () => {
    const { category, project } = jsonFixtures();
    expect(Object.entries(category)).toEqual([['FixtureCategory', '#123456']]);
    const source = ts.createSourceFile('consts.ts', readFileSync(new URL('../../src/consts.ts', import.meta.url), 'utf8'),
      ts.ScriptTarget.Latest, true);
    const categoryDeclaration = source.statements.filter(ts.isVariableStatement)
      .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === 'CATEGORIES');
    expect(categoryDeclaration?.type?.getText(source)).toBe('Record<string, string>');
    const contract = source.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'ProjectItem');
    if (!contract || !ts.isInterfaceDeclaration(contract)) throw new Error('ProjectItem 계약을 찾지 못했습니다.');
    const fields = contract.members.filter(ts.isPropertySignature);
    expect(Object.keys(project).every(key => fields.some(field => field.name.getText(source) === key))).toBe(true);
    for (const field of fields) {
      const key = field.name.getText(source);
      if (!field.questionToken) expect(project).toHaveProperty(key);
      if (!(key in project)) continue;
      if (field.type?.kind === ts.SyntaxKind.StringKeyword) expect(typeof project[key]).toBe('string');
      else if (field.type && ts.isArrayTypeNode(field.type) && field.type.elementType.kind === ts.SyntaxKind.StringKeyword) {
        expect(Array.isArray(project[key])).toBe(true);
        expect(project[key].every((value: unknown) => typeof value === 'string')).toBe(true);
      } else throw new Error(`검증되지 않은 ProjectItem 필드 타입: ${key}`);
    }
  });
});
