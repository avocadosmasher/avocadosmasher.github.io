import { expect, it } from 'vitest';
import { fragmentSchema, searchFragments, paginate, parseState, stateUrl, graphData } from '../../src/lib/fragments';

const cards = [
  fragmentSchema.parse({ id: 'ept', title: 'EPT', aliases: ['Extended Page Tables'], summary: '주소 변환', category: 'Infra', tags: ['가상화'], relations: [{ target: 'gpa', type: 'related' }] }),
  fragmentSchema.parse({ id: 'gpa', title: 'GPA', summary: 'EPT가 변환하는 주소', category: 'Infra', relations: [{ target: 'ept', type: 'related' }] }),
  fragmentSchema.parse({ id: 'rag', title: 'RAG', summary: '검색 증강 생성', category: 'AI' }),
];

it('D01/D02 searches every field, normalizes Korean and ranks exact terms first', () => {
  for (const query of [' Ept ', 'extended page tables', '주소 변환', '가상화'.normalize('NFD')]) {
    expect(searchFragments(cards, query, '').map(c => c.id)[0]).toBe('ept');
  }
  expect(searchFragments(cards, 'infra', '')).toHaveLength(2);
  expect(searchFragments(cards, 'ept', 'AI')).toEqual([]);
  expect(searchFragments(cards, '', '')).toHaveLength(3);
});
it('D03 paginates boundary counts and clamps invalid pages', () => {
  for (const count of [0, 1, 12, 13, 25]) {
    const data = Array.from({ length: count }, (_, i) => i);
    const page = paginate(data, 99);
    expect(page.pages).toBe(Math.max(1, Math.ceil(count / 12)));
    expect(page.page).toBe(page.pages);
    expect(page.items).toEqual(data.slice((page.page - 1) * 12, page.page * 12));
  }
  for (const value of [-1, NaN, Infinity, 0]) expect(paginate(cards, value).page).toBe(1);
});
it('D05 round trips state and normalizes untrusted URLs', () => {
  const state = parseState('?q=가상화&category=Infra&page=2&card=ept&view=graph', ['Infra']);
  expect(parseState(stateUrl(state), ['Infra'])).toEqual(state);
  expect(parseState('?page=wat&category=unknown&view=bad', ['Infra'])).toMatchObject({ page: 1, category: '', view: 'cards' });
});
it('F01/F02 de-duplicates symmetric edges and includes neighbors outside a page', () => {
  const graph = graphData(cards, 'ept');
  expect(graph.nodes.map(n => n.data.id)).toEqual(['ept', 'gpa']);
  expect(graph.edges).toHaveLength(1);
  expect(graphData(cards, 'rag').nodes).toHaveLength(1);
  expect(graphData(cards).nodes).toHaveLength(3);
});
