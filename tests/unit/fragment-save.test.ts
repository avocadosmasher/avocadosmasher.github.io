import { describe, expect, it } from 'vitest';
import { fragmentSchema, prepareFragmentSave } from '../../src/lib/fragments';

const draft = { title: '주소 변환', summary: '변환 설명', category: 'Infra', body: '**보충**' };

describe('B01/B02: save contract', () => {
  it('creates unique safe IDs independently of the title and preserves body', () => {
    const first = prepareFragmentSave(draft);
    const second = prepareFragmentSave(draft);
    expect(fragmentSchema.safeParse(first).success).toBe(true);
    expect(first.id).not.toBe(second.id);
    expect(first.body).toBe(draft.body);
    expect(first).toMatchObject({ aliases: [], tags: [], relations: [] });
  });

  it('keeps existing IDs when title or submitted ID changes', () => {
    const saved = prepareFragmentSave(draft);
    expect(prepareFragmentSave({ ...draft, id: 'tampered', title: '수정' }, saved.id).id).toBe(saved.id);
    expect(prepareFragmentSave({ ...draft, id: saved.id }).id).toBe(saved.id);
    expect(() => prepareFragmentSave(draft, '../invalid')).toThrow();
  });

  it('rejects invalid form values before saving', () => {
    for (const field of ['title', 'summary', 'category']) {
      expect(() => prepareFragmentSave({ ...draft, [field]: ' ' })).toThrow();
    }
    expect(() => prepareFragmentSave({ ...draft, relations: [{ target: 'ept', type: 'unknown' }] })).toThrow();
    expect(() => prepareFragmentSave({ ...draft, body: 123 })).toThrow();
  });
});
