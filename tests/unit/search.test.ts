import { expect, it } from 'vitest';
import { fragmentSchema, searchFragments, paginate, parseState, stateUrl, graphData, focusOptions, resolveFocus, filterFocusOptions } from '../../src/lib/fragments';

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
  // 그래프 스타일은 관계 유형으로 선·화살촉 모양을 고르므로 간선에 유형이 실려야 한다.
  expect(graph.edges[0].data).toMatchObject({ type: 'related', directed: 0 });
  expect(graphData(cards, 'rag').nodes).toHaveLength(1);
  expect(graphData(cards).nodes).toHaveLength(3);
});
it('F05 finds a focus concept by typed title or alias and disambiguates duplicate titles', () => {
  const twins = [...cards, fragmentSchema.parse({ id: 'ept-2', title: 'EPT', summary: '다른 EPT', category: 'AI' })];
  expect(focusOptions(cards).map(o => o.label)).toEqual(['EPT', 'GPA', 'RAG']);
  expect(focusOptions(twins).find(o => o.id === 'ept-2')?.label).toBe('EPT · ept-2');
  expect(resolveFocus(cards, '')).toBe('');
  expect(resolveFocus(cards, '  ')).toBe('');
  expect(resolveFocus(cards, 'gpa')).toBe('gpa');
  expect(resolveFocus(cards, ' Extended Page Tables ')).toBe('ept');
  expect(resolveFocus(cards, '없는 개념')).toBeUndefined();
  expect(resolveFocus(twins, 'EPT')).toBeUndefined();
  expect(resolveFocus(twins, 'EPT · ept-2')).toBe('ept-2');
});
it('F05 filters focus suggestions by title or alias, prefix matches first, with a limit', () => {
  const many = Array.from({ length: 30 }, (_, i) => fragmentSchema.parse({ id: `c${i}`, title: `개념 ${String(i).padStart(2, '0')}`, summary: 's', category: 'AI' }));
  expect(filterFocusOptions(cards, '').options.map(o => o.id)).toEqual(['ept', 'gpa', 'rag']);
  expect(filterFocusOptions(cards, 'page').options.map(o => o.id)).toEqual(['ept']);
  // 제목 앞부분 → 별칭 앞부분 → 제목 포함 → 별칭 포함 순. EPT는 별칭(Extended Page Tables)으로만 걸린다.
  expect(filterFocusOptions(cards, 'a').options.map(o => o.id)).toEqual(['gpa', 'rag', 'ept']);
  expect(filterFocusOptions(cards, 'ext').options.map(o => o.id)).toEqual(['ept']);
  expect(filterFocusOptions(cards, '없음')).toEqual({ options: [], total: 0 });
  const limited = filterFocusOptions(many, '개념', 10);
  expect(limited.options).toHaveLength(10);
  expect(limited.total).toBe(30);
});
it('F02 expands a focused concept by the chosen number of steps', () => {
  const chain = ['a', 'b', 'c', 'd'].map((id, index, ids) => fragmentSchema.parse({
    id, title: id, summary: id, category: 'AI', relations: index < ids.length - 1 ? [{ target: ids[index + 1], type: 'related' }] : [],
  }));
  expect(graphData(chain, 'a').nodes.map(n => n.data.id)).toEqual(['a', 'b']);
  expect(graphData(chain, 'a', undefined, 2).nodes.map(n => n.data.id)).toEqual(['a', 'b', 'c']);
  expect(graphData(chain, 'b', undefined, 2).nodes.map(n => n.data.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(graphData(chain, 'a', undefined, 2).edges).toHaveLength(2);
});
