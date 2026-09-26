import { describe, expect, it } from 'vitest';
import { cardRelations, fragmentSchema, validateFragments } from '../../src/lib/fragments';

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

describe('both ends of a relation', () => {
  const cards = [
    { id: 'gpa', title: 'GPA', relations: [{ target: 'hpa', type: 'part-of' as const }, { target: 'ept', type: 'related' as const }] },
    { id: 'hpa', title: 'HPA', relations: [] },
    { id: 'ept', title: 'EPT', relations: [{ target: 'tlb', type: 'prerequisite' as const }] },
    { id: 'tlb', title: 'TLB', relations: [] },
    { id: 'cache', title: 'Cache', relations: [{ target: 'tlb', type: 'contrasts' as const }] },
  ];

  it('shows a stored relation on the card that stored it', () => {
    expect(cardRelations(cards, 'gpa')).toEqual([
      { target: 'hpa', type: 'part-of', label: '상위 개념', inbound: false },
      { target: 'ept', type: 'related', label: '관련 개념', inbound: false },
    ]);
  });

  it('shows the same relation on the other card, with the opposite name for directed types', () => {
    expect(cardRelations(cards, 'hpa')).toEqual([{ target: 'gpa', type: 'part-of', label: '하위 개념', inbound: true }]);
    expect(cardRelations(cards, 'tlb')).toEqual([
      { target: 'ept', type: 'prerequisite', label: '후속 개념', inbound: true },
      { target: 'cache', type: 'contrasts', label: '비교 개념', inbound: true },
    ]);
  });

  it('keeps a symmetric type under the same name from either side', () => {
    expect(cardRelations(cards, 'ept').find(relation => relation.target === 'gpa')?.label).toBe('관련 개념');
    expect(cardRelations(cards, 'gpa').find(relation => relation.target === 'ept')?.label).toBe('관련 개념');
  });

  it('lists a pair once even when both cards point at each other', () => {
    const both = cards.map(card => card.id === 'tlb' ? { ...card, relations: [{ target: 'ept', type: 'contrasts' as const }] } : card);
    expect(cardRelations(both, 'tlb').filter(relation => relation.target === 'ept')).toHaveLength(1);
    expect(cardRelations(both, 'ept').filter(relation => relation.target === 'tlb')).toHaveLength(1);
  });

  it('reports no relation for a card nothing points at', () => {
    expect(cardRelations([...cards, { id: 'lone', title: 'Lone', relations: [] }], 'lone')).toEqual([]);
  });
});
