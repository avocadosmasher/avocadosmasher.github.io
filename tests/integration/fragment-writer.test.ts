import { expect, it } from 'vitest';
// Astro's content loader uses this parser; exercise that boundary, not our own serializer.
import { parseFrontmatter } from '@astrojs/markdown-remark';
import { draftFromFields, markdownForDraft } from '../../src/lib/fragment-writer';
import { fragmentSchema } from '../../src/lib/fragments';
import { fragmentHtml } from '../../src/lib/fragment-content';

it('new writer Markdown survives Astro frontmatter parsing without injected fields', () => {
  const card = draftFromFields({ title: '한글 "용어": 😀', summary: '요약\n---\nid: other\u0085line\u2028line\u2029end',
    category: 'Infra', aliases: 'a: b, "c"', tags: '', body: '**설명**\n\n<script>alert(1)</script>' });
  const parsed = parseFrontmatter(markdownForDraft(card));
  expect(fragmentSchema.parse(parsed.frontmatter)).toEqual(fragmentSchema.parse(card));
  expect(parsed.content).toContain(card.body);
  expect(fragmentHtml(parsed.content)).toContain('<strong>설명</strong>');
  expect(fragmentHtml(parsed.content)).not.toContain('<script>');
});
