import { describe, expect, it } from 'vitest';
import { fragmentSchema, validateFragments } from '../../src/lib/fragments';

const card = (overrides = {}) => ({ id: 'ept', title: 'EPT', summary: '주소 변환', category: 'Infra', ...overrides });

describe('B01–B04: Fragment content contract', () => {
  it('requires meaningful fields and provides optional defaults', () => {
    expect(fragmentSchema.parse(card())).toMatchObject({ aliases: [], tags: [], relations: [] });
    for (const field of ['id', 'title', 'summary', 'category']) {
      expect(fragmentSchema.safeParse(card({ [field]: ' ' })).success).toBe(false);
    }
  });
  it('keeps IDs independent of titles and rejects unsafe IDs', () => {
    expect(fragmentSchema.parse(card({ title: '이름 수정' })).id).toBe('ept');
    for (const id of ['../ept', 'EPT', 'ept space', 'ept/index', '']) {
      expect(fragmentSchema.safeParse(card({ id })).success).toBe(false);
    }
  });
  it('accepts duplicate titles but rejects duplicate IDs with a useful diagnostic', () => {
    expect(() => validateFragments([card(), card({ id: 'ept-detail' })])).not.toThrow();
    expect(() => validateFragments([card(), card()])).toThrow(/ept/);
  });
  it('rejects missing targets, self links and unknown relation types', () => {
    expect(() => validateFragments([card({ relations: [{ target: 'gpa', type: 'related' }] })])).toThrow(/ept.*gpa/);
    expect(() => validateFragments([card({ relations: [{ target: 'ept', type: 'related' }] })])).toThrow(/ept/);
    expect(fragmentSchema.safeParse(card({ relations: [{ target: 'gpa', type: 'invented' }] })).success).toBe(false);
    expect(validateFragments([card({ relations: [{ target: 'gpa', type: 'related' }] }), card({ id: 'gpa' })])).toHaveLength(2);
  });
});
