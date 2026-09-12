import { z } from 'zod';

export const relationLabels = {
  related: '관련 개념', prerequisite: '선행 개념', 'part-of': '상위 개념', contrasts: '비교 개념',
} as const;
export const fragmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ID는 영문 소문자·숫자·하이픈으로 작성하세요.'),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  category: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  relations: z.array(z.object({ target: z.string().min(1), type: z.enum(['related', 'prerequisite', 'part-of', 'contrasts']) })).default([]),
});
export type Fragment = z.infer<typeof fragmentSchema>;
export type PublicFragment = Fragment & { html: string };

export function validateFragments(input: unknown[]): Fragment[] {
  const cards = input.map((item) => fragmentSchema.parse(item));
  const ids = new Set<string>();
  for (const card of cards) {
    if (ids.has(card.id)) throw new Error(`Fragment 중복 ID: ${card.id}`);
    ids.add(card.id);
  }
  for (const card of cards) {
    for (const relation of card.relations) {
      if (relation.target === card.id || !ids.has(relation.target)) {
        throw new Error(`Fragment ${card.id}: 잘못된 관계 대상 ${relation.target}`);
      }
    }
  }
  return cards;
}

const normalize = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('ko');
export function searchFragments<T extends Fragment>(cards: T[], query: string, category: string): T[] {
  const q = normalize(query);
  const exact = (card: T) => [card.title, ...card.aliases].some(value => normalize(value) === q) ? 1 : 0;
  return cards.filter(card => (!category || card.category === category) &&
    (!q || [card.title, ...card.aliases, card.summary, card.category, ...card.tags].some(value => normalize(value).includes(q))))
    .sort((a, b) => (q ? exact(b) - exact(a) : 0) || a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id));
}
export function paginate<T>(items: T[], requested: number, size = 12) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Number.isFinite(requested) ? Math.max(1, Math.min(pages, Math.floor(requested))) : 1;
  return { page, pages, total: items.length, items: items.slice((page - 1) * size, page * size) };
}
export interface FragmentState { q: string; category: string; page: number; card: string; view: 'cards' | 'graph' }
export function parseState(search: string, categories: string[]): FragmentState {
  const params = new URLSearchParams(search);
  const page = Number(params.get('page') ?? 1);
  const category = params.get('category') ?? '';
  return { q: params.get('q') ?? '', category: categories.includes(category) ? category : '',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1, card: params.get('card') ?? '',
    view: params.get('view') === 'graph' ? 'graph' : 'cards' };
}
export function stateUrl(state: FragmentState) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.card) params.set('card', state.card);
  if (state.view === 'graph') params.set('view', 'graph');
  return params.size ? `?${params}` : '';
}
export function graphData(cards: Fragment[], focus?: string, matches?: Set<string>) {
  const selected = focus ? new Set([focus]) : matches ? new Set(matches) : new Set(cards.map(c => c.id));
  const seeds = new Set(selected);
  for (const card of cards) for (const rel of card.relations) {
    if (seeds.has(card.id)) selected.add(rel.target);
    if (seeds.has(rel.target)) selected.add(card.id);
  }
  const nodes = cards.filter(c => selected.has(c.id)).map(c => ({ data: { id: c.id, label: c.title, outside: matches && !matches.has(c.id) ? 1 : 0 } }));
  const edges: { data: { id: string; source: string; target: string; label: string; directed: number } }[] = [];
  const seen = new Set<string>();
  for (const card of cards) for (const rel of card.relations) {
    if (!selected.has(card.id) || !selected.has(rel.target)) continue;
    const directed = rel.type === 'prerequisite' || rel.type === 'part-of';
    const pair = directed ? [card.id, rel.target] : [card.id, rel.target].sort();
    const id = `edge:${pair.join(':')}:${rel.type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ data: { id, source: card.id, target: rel.target, label: relationLabels[rel.type], directed: directed ? 1 : 0 } });
  }
  return { nodes, edges };
}
