import { describe, expect, it } from 'vitest';
import { cmsConfig, prepareFragmentSave } from '../../src/lib/fragment-admin';
import { fragmentSchema, relationLabels } from '../../src/lib/fragments';

const draft = { title: '주소 변환', summary: '변환 설명', category: 'Infra', body: '**보충**' };

describe('A03-1: CMS config and save contract', () => {
  it('disables production local writes and matches content fields', () => {
    expect(cmsConfig.local_backend).toBe(false);
    const collection = cmsConfig.collections[0];
    expect(collection).toMatchObject({ folder: 'src/content/fragments', delete: false, slug: '{{id}}', identifier_field: 'id' });
    expect(collection.fields.map(field => field.name).sort()).toEqual([...Object.keys(fragmentSchema.shape), 'body'].sort());
    expect(collection.fields.find(field => field.name === 'id')).toMatchObject({ widget: 'hidden' });
    for (const name of ['title', 'summary', 'category']) {
      expect(collection.fields.find(field => field.name === name)).toMatchObject({ required: true });
    }
    const relations = collection.fields.find(field => field.name === 'relations');
    expect(relations?.fields?.find(field => field.name === 'type')?.options).toEqual(Object.keys(relationLabels));
  });

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
