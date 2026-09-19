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
// 중심 개념 입력창의 자동완성 목록. 제목이 겹치면 ID를 붙여 구분한다.
export function focusOptions(cards: Fragment[]) {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.title, (counts.get(card.title) ?? 0) + 1);
  return cards.map(card => ({ id: card.id, label: (counts.get(card.title) ?? 0) > 1 ? `${card.title} · ${card.id}` : card.title }));
}
// 중심 개념 목록에 보여줄 후보. 제목 앞부분 → 별칭 앞부분 → 제목 포함 → 별칭 포함 순으로 정렬하고 limit개까지 자른다.
export function filterFocusOptions(cards: Fragment[], text: string, limit = 50) {
  const q = normalize(text);
  const labels = new Map(focusOptions(cards).map(option => [option.id, option.label]));
  const rank = (card: Fragment) => {
    if (!q) return 0;
    const title = normalize(card.title), aliases = card.aliases.map(normalize);
    if (title.startsWith(q)) return 0;
    if (aliases.some(alias => alias.startsWith(q))) return 1;
    if (title.includes(q)) return 2;
    if (aliases.some(alias => alias.includes(q))) return 3;
    return -1;
  };
  const matched = cards.map(card => ({ card, score: rank(card) })).filter(item => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.card.title.localeCompare(b.card.title, 'ko') || a.card.id.localeCompare(b.card.id));
  return { total: matched.length, options: matched.slice(0, limit).map(({ card }) => ({ id: card.id, label: labels.get(card.id)!, category: card.category })) };
}
// 입력한 글자를 중심 개념 ID로 바꾼다. 빈 입력은 전체 관계(''), 하나로 정해지지 않으면 undefined.
export function resolveFocus(cards: Fragment[], text: string) {
  const q = normalize(text);
  if (!q) return '';
  const labeled = focusOptions(cards).find(option => normalize(option.label) === q);
  if (labeled) return labeled.id;
  const named = cards.filter(card => [card.title, ...card.aliases].some(value => normalize(value) === q));
  return named.length === 1 ? named[0].id : undefined;
}

// depth는 중심 개념에서 몇 단계 떨어진 이웃까지 포함할지다. 중심 개념이 없으면 검색 결과의 직접 이웃만 더한다.
export function graphData(cards: Fragment[], focus?: string, matches?: Set<string>, depth = 1) {
  const selected = focus ? new Set([focus]) : matches ? new Set(matches) : new Set(cards.map(c => c.id));
  for (let step = 0; step < (focus ? depth : 1); step++) {
    const seeds = new Set(selected);
    for (const card of cards) for (const rel of card.relations) {
      if (seeds.has(card.id)) selected.add(rel.target);
      if (seeds.has(rel.target)) selected.add(card.id);
    }
  }
  const nodes = cards.filter(c => selected.has(c.id)).map(c => ({ data: { id: c.id, label: c.title, outside: matches && !matches.has(c.id) ? 1 : 0 } }));
  const edges: { data: { id: string; source: string; target: string; label: string; type: keyof typeof relationLabels; directed: number } }[] = [];
  const seen = new Set<string>();
  for (const card of cards) for (const rel of card.relations) {
    if (!selected.has(card.id) || !selected.has(rel.target)) continue;
    const directed = rel.type === 'prerequisite' || rel.type === 'part-of';
    const pair = directed ? [card.id, rel.target] : [card.id, rel.target].sort();
    const id = `edge:${pair.join(':')}:${rel.type}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ data: { id, source: card.id, target: rel.target, label: relationLabels[rel.type], type: rel.type, directed: directed ? 1 : 0 } });
  }
  return { nodes, edges };
}

export const graphNodeSize = { min: 10, max: 32, gap: 24 } as const;
// 가장 큰 노드 두 개가 나란히 있어도 여유분만큼 떨어지는 중심 간 거리.
export const graphNodeSpacing = graphNodeSize.max * 2 + graphNodeSize.gap;

// 연결 수에 따라 키우되, 제곱근으로 완만하게 늘려 허브가 과하게 커지지 않게 한다.
export function graphNodeDiameter(degree: number, maxDegree: number) {
  if (maxDegree <= 0) return graphNodeSize.min;
  return graphNodeSize.min + (graphNodeSize.max - graphNodeSize.min) * Math.sqrt(Math.min(degree, maxDegree) / maxDegree);
}

// force-directed 배치는 최소 거리를 보장하지 않으므로, 가까운 쌍을 서로 반씩 밀어내기를 반복한다.
// minDistance 크기의 격자 칸에 나눠 이웃 칸끼리만 비교한다. 모든 쌍이 minDistance 이상이 되면 true.
export function separateNodes(points: { x: number; y: number }[], minDistance: number, maxIterations = 2000) {
  const target = minDistance * 1.001;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const grid = new Map<string, number[]>();
    points.forEach((point, index) => {
      const key = `${Math.floor(point.x / minDistance)},${Math.floor(point.y / minDistance)}`;
      grid.get(key)?.push(index) ?? grid.set(key, [index]);
    });
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      const cx = Math.floor(points[i].x / minDistance), cy = Math.floor(points[i].y / minDistance);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const j of grid.get(`${gx},${gy}`) ?? []) {
          if (j <= i) continue;
          const a = points[i], b = points[j];
          let dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
          if (distance >= minDistance) continue;
          if (distance === 0) {
            const angle = i * 2.399963 + j;
            dx = Math.cos(angle); dy = Math.sin(angle); distance = 1;
            b.x = a.x + dx; b.y = a.y + dy;
          }
          const push = (target - distance) / 2 / distance;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
          moved = true;
        }
      }
    }
    if (!moved) return true;
  }
  return false;
}
