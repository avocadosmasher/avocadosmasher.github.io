import { graphData, paginate, parseState, relationLabels, searchFragments, stateUrl, type PublicFragment } from '../lib/fragments';
import type { Core } from 'cytoscape';
import { createWriterConfig } from '../lib/fragment-writer';
import { loadFragmentSnapshot } from '../lib/fragment-snapshot';
import { liveFragment } from '../lib/fragment-live';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cards: PublicFragment[] = JSON.parse($('fragment-data').textContent ?? '[]');
const categories = [...new Set(cards.map(c => c.category))];
const byId = new Map(cards.map(c => [c.id, c]));
const input = $<HTMLInputElement>('fragment-search');
const category = $<HTMLSelectElement>('fragment-category');
const dialog = $<HTMLDialogElement>('fragment-dialog');
const focus = $<HTMLSelectElement>('graph-focus');
let state = parseState(location.search, categories);
let lastFocus: HTMLElement | null = null;
let cy: Core | undefined;
let graphGeneration = 0;
let pinnedNode = '';
const graphHint = '노드에 마우스를 올리거나 아래 개념 버튼에 포커스를 두세요.';
function highlightNode(id = pinnedNode) {
  if (!cy || cy.destroyed()) return;
  cy.elements().removeClass('graph-muted graph-neighbor graph-active');
  const node = cy.getElementById(id);
  if (!id || node.empty()) { $('graph-selection').textContent = graphHint; return; }
  const neighborhood = node.closedNeighborhood();
  cy.elements().difference(neighborhood).addClass('graph-muted');
  neighborhood.addClass('graph-neighbor');
  node.addClass('graph-active');
  $('graph-selection').textContent = `${byId.get(id)?.title ?? id} · 직접 연결 ${node.neighborhood().nodes().length}개`;
}
function fitGraph() {
  if (!cy || cy.destroyed()) return;
  cy.resize(); cy.fit(undefined, 32);
  // A single concept must not expand into an oversized label.
  if (cy.zoom() > 1.4) { cy.zoom(1.4); cy.center(); }
}
const writerData = $('fragment-composer').dataset.writer;
const writerConfig = writerData ? createWriterConfig(JSON.parse(writerData)) : undefined;
let snapshotGeneration = 0;
let authoritative = !writerConfig;
let hasRendered = false;
// A direct link may refer to a card created after this HTML was built.
if (writerConfig) state = parseState(location.search, [...categories, new URLSearchParams(location.search).get('category') ?? '']);

function updateCollection(next: PublicFragment[]) {
  const selectedFocus = focus.value;
  cards.splice(0, cards.length, ...next);
  byId.clear(); cards.forEach(card => byId.set(card.id, card));
  categories.splice(0, categories.length, ...[...new Set(cards.map(card => card.category))].sort((a, b) => a.localeCompare(b, 'ko')));
  category.replaceChildren(new Option(`전체 (${cards.length})`, ''), ...categories.map(value => new Option(`${value} (${cards.filter(card => card.category === value).length})`, value)));
  if (!categories.includes(state.category)) state.category = '';
  focus.replaceChildren(new Option('전체 관계', ''), ...cards.map(card => new Option(card.title, card.id)));
  focus.value = byId.has(selectedFocus) ? selectedFocus : '';
  render();
}
async function refreshCards() {
  if (!writerConfig) return;
  const generation = ++snapshotGeneration;
  $('fragment-sync').hidden = false;
  $('fragment-sync-status').textContent = '최신 카드를 불러오고 있습니다.';
  $('fragment-sync-retry').hidden = true;
  try {
    const snapshot = await loadFragmentSnapshot(writerConfig);
    if (generation !== snapshotGeneration) return;
    const next = snapshot.map(item => liveFragment(item.draft));
    authoritative = true;
    window.dispatchEvent(new CustomEvent('fragment-paths', { detail: Object.fromEntries(snapshot.map(item => [item.draft.id, item.path])) }));
    updateCollection(next);
    $('fragment-sync-status').textContent = '최신 카드를 불러왔습니다.';
  } catch {
    if (generation !== snapshotGeneration) return;
    $('fragment-sync-status').textContent = '최신 카드를 확인하지 못했습니다. 현재 목록은 이전 내용일 수 있습니다. 잠시 후 다시 불러와주세요.';
    $('fragment-sync-retry').hidden = false;
    if (!hasRendered) render();
  }
}
window.addEventListener('fragment-saved', event => {
  const { card } = (event as CustomEvent<{ card: PublicFragment; path: string }>).detail;
  // An earlier GET must never overwrite the result of a completed save.
  snapshotGeneration++;
  updateCollection([...cards.filter(item => item.id !== card.id), card]);
  $('fragment-sync-status').textContent = '저장한 카드를 현재 목록에 반영했습니다.';
  $('fragment-sync-retry').hidden = true;
});
$('fragment-sync-retry').addEventListener('click', () => void refreshCards());

function text(tag: string, value: string, className = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  element.className = className;
  return element;
}
function button(label: string, action: () => void) {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label;
  element.addEventListener('click', action);
  return element;
}
function url(mode: 'push' | 'replace' = 'replace') {
  const next = location.pathname + stateUrl(state);
  if (next !== location.pathname + location.search) history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', next);
}
function openCard(id: string, related = false) {
  if (!related) lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.card = id; url(related ? 'replace' : 'push'); renderDialog();
}
function closeCard() {
  state.card = ''; url(); dialog.close(); lastFocus?.focus();
}
function renderDialog() {
  const card = byId.get(state.card);
  if (!card) {
    if (state.card && !authoritative) return;
    if (state.card) { $('fragment-notice').hidden = false; $('fragment-notice').textContent = '찾을 수 없는 카드입니다. 목록에서 다시 선택해주세요.'; state.card = ''; url(); }
    if (dialog.open) { dialog.close(); lastFocus?.focus(); }
    return;
  }
  $('fragment-dialog-title').textContent = card.title;
  $('fragment-edit').dataset.cardId = card.id;
  $('fragment-dialog-category').textContent = card.category;
  $('fragment-dialog-aliases').textContent = card.aliases.join(' · ');
  $('fragment-dialog-summary').textContent = card.summary;
  // Build HTML and live Markdown HTML are sanitized before reaching this boundary.
  $('fragment-dialog-body').innerHTML = card.html;
  $('fragment-dialog-tags').replaceChildren(...card.tags.map(tag => text('span', `#${tag}`)));
  const links = card.relations.map(rel => button(`${relationLabels[rel.type]} · ${byId.get(rel.target)?.title ?? rel.target}`, () => openCard(rel.target, true)));
  $('fragment-dialog-relations').replaceChildren(...(links.length ? links : [text('p', '아직 연결된 개념이 없습니다.', 'fragment-hint')]));
  if (!dialog.open) dialog.showModal();
  $('fragment-close').focus();
}
function render() {
  hasRendered = true;
  input.value = state.q; category.value = state.category;
  const found = searchFragments(cards, state.q, state.category);
  const page = paginate(found, state.page);
  state.page = page.page; url();
  $('fragment-count').textContent = `${found.length}개의 개념 · ${page.page} / ${page.pages} 페이지`;
  $('fragment-empty').hidden = found.length !== 0;
  $('fragment-grid').replaceChildren(...page.items.map(card => {
    const item = button('', () => openCard(card.id));
    item.className = 'fragment-card'; item.dataset.fragmentCard = card.id;
    item.setAttribute('aria-label', `${card.title} 자세히 보기`);
    item.append(text('span', card.category, 'fragment-card-category'), text('h2', card.title), text('p', card.summary));
    const tags = text('div', '', 'fragment-tags'); tags.append(...card.tags.map(tag => text('span', `#${tag}`)));
    item.append(tags, text('span', `${card.relations.length}개의 연결 ↗`, 'fragment-card-footer'));
    return item;
  }));
  const previous = button('이전', () => { state.page--; url('push'); render(); }); previous.disabled = page.page <= 1;
  const next = button('다음', () => { state.page++; url('push'); render(); }); next.disabled = page.page >= page.pages;
  const numbers = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => page.page + i - 2).filter(n => n > 0 && n <= page.pages), page.pages])].sort((a, b) => a - b);
  const controls: HTMLElement[] = [previous];
  numbers.forEach((n, index) => {
    if (index && n - numbers[index - 1] > 1) controls.push(text('span', '…'));
    const control = button(String(n), () => { state.page = n; url('push'); render(); });
    control.setAttribute('aria-label', `${n}페이지`);
    if (n === page.page) control.setAttribute('aria-current', 'page');
    controls.push(control);
  });
  controls.push(next); $('fragment-pages').replaceChildren(...controls); $('fragment-pages').hidden = page.pages === 1;
  $('fragment-list').hidden = state.view !== 'cards';
  $('fragment-graph-panel').hidden = state.view !== 'graph';
  $('cards-view').setAttribute('aria-pressed', String(state.view === 'cards'));
  $('graph-view').setAttribute('aria-pressed', String(state.view === 'graph'));
  renderDialog();
  if (state.view === 'graph') void renderGraph();
  else { graphGeneration++; cy?.destroy(); cy = undefined; }
}
async function renderGraph() {
  const generation = ++graphGeneration;
  pinnedNode = '';
  $('graph-selection').textContent = graphHint;
  const matches = new Set(searchFragments(cards, state.q, state.category).map(c => c.id));
  const data = graphData(cards, focus.value || undefined, matches);
  $('graph-status').textContent = '관계를 불러오는 중…'; $('graph-retry').hidden = true;
  const noRelations = $('graph-empty-relations');
  noRelations.hidden = !data.nodes.length || !!data.edges.length;
  noRelations.textContent = cards.every(card => !card.relations.length)
    ? '관계가 아직 등록되지 않았습니다. 현재는 개념만 표시합니다. 카드 간 관계를 지정하는 기능은 준비 중입니다.'
    : '현재 선택 범위에는 연결된 관계가 없습니다. 다른 중심 개념이나 전체 관계를 선택해보세요.';
  $('graph-accessible').replaceChildren(...data.nodes.map(node => {
    const control = button(node.data.label, () => { pinnedNode = node.data.id; highlightNode(); openCard(node.data.id); });
    control.addEventListener('mouseenter', () => highlightNode(node.data.id));
    control.addEventListener('mouseleave', () => highlightNode());
    control.addEventListener('focus', () => highlightNode(node.data.id));
    control.addEventListener('blur', () => highlightNode());
    return control;
  }));
  try {
    const { default: cytoscape } = await import('cytoscape');
    if (generation !== graphGeneration) return;
    cy?.destroy();
    const dark = document.documentElement.dataset.theme === 'dark';
    cy = cytoscape({ container: $('fragment-graph'), elements: [...data.nodes, ...data.edges],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': '#8070e8', color: dark ? '#f2f2f6' : '#17171f', 'font-size': 13, 'text-valign': 'bottom', 'text-margin-y': 8, 'text-wrap': 'wrap', 'text-max-width': '132px', 'text-overflow-wrap': 'anywhere', 'line-height': 1.3, width: 28, height: 28 } },
        { selector: 'node[outside = 1]', style: { opacity: 0.45 } },
        { selector: 'edge', style: { label: 'data(label)', width: 1.5, 'line-color': '#9690ae', color: dark ? '#cbcbd4' : '#41414c', 'font-size': 10, 'curve-style': 'bezier',
          'text-background-color': getComputedStyle($('fragment-graph')).backgroundColor,
          'text-background-opacity': 1, 'text-background-padding': '3px',
        } },
        { selector: 'edge[directed = 1]', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': '#9690ae' } },
        { selector: '.graph-neighbor', style: { opacity: 1 } },
        { selector: 'node.graph-neighbor', style: { 'background-color': dark ? '#b1a5ff' : '#6956d4', 'border-width': 2, 'border-color': dark ? '#e7e1ff' : '#463596' } },
        { selector: 'node.graph-active', style: { 'border-width': 4, 'border-color': dark ? '#ffffff' : '#312269' } },
        { selector: 'edge.graph-neighbor', style: { width: 3, 'line-color': dark ? '#c0b4ff' : '#6956d4', 'target-arrow-color': dark ? '#c0b4ff' : '#6956d4', color: dark ? '#eeeaff' : '#463596' } },
        { selector: '.graph-muted', style: { opacity: 0.16 } },
      ], layout: data.edges.length === 0
        ? { name: 'grid', cols: $('fragment-graph').clientWidth < 560 ? 2 : Math.ceil(Math.sqrt(data.nodes.length * 2)), avoidOverlap: true, avoidOverlapPadding: 24, nodeDimensionsIncludeLabels: true, animate: false, padding: 32 }
        : data.nodes.length > 80
          ? { name: 'circle', nodeDimensionsIncludeLabels: true, avoidOverlap: true, animate: false, padding: 32 }
          : { name: 'cose', nodeDimensionsIncludeLabels: true, componentSpacing: 80, nodeRepulsion: () => 6000, idealEdgeLength: () => 100, animate: false, padding: 32 },
      minZoom: 0.1, maxZoom: 3,
    });
    fitGraph();
    cy.on('mouseover', 'node', event => { $('fragment-graph').style.cursor = 'pointer'; highlightNode(event.target.id()); });
    cy.on('mouseout', 'node', () => { $('fragment-graph').style.cursor = ''; highlightNode(); });
    cy.on('tap', 'node', event => { pinnedNode = event.target.id(); highlightNode(); openCard(pinnedNode); });
    cy.on('tap', event => { if (event.target === cy) { pinnedNode = ''; highlightNode(); } });
    $('graph-status').textContent = data.nodes.length ? `${data.nodes.length}개 개념 · ${data.edges.length}개 관계` : '조건에 맞는 개념이 없습니다.';
  } catch {
    if (generation !== graphGeneration) return;
    $('graph-status').textContent = '그래프를 불러오지 못했습니다. 다시 시도하거나 카드 보기로 확인해주세요.';
    $('graph-retry').hidden = false;
  }
}
input.addEventListener('input', () => { state.q = input.value; state.page = 1; render(); });
category.addEventListener('change', () => { state.category = category.value; state.page = 1; url('push'); render(); });
$('cards-view').addEventListener('click', () => { state.view = 'cards'; url('push'); render(); });
$('graph-view').addEventListener('click', () => { state.view = 'graph'; url('push'); render(); });
$('fragment-close').addEventListener('click', closeCard);
dialog.addEventListener('cancel', event => { event.preventDefault(); closeCard(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeCard(); } });
$('fragment-related-graph').addEventListener('click', () => { focus.value = state.card; closeCard(); state.view = 'graph'; url('push'); render(); $('graph-focus').focus(); });
focus.addEventListener('change', () => void renderGraph());
$('graph-retry').addEventListener('click', () => void renderGraph());
$('fragment-graph').addEventListener('mouseleave', () => {
  $('fragment-graph').style.cursor = '';
  highlightNode();
});
$('graph-fit').addEventListener('click', fitGraph);
$('graph-zoom-in').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() * 1.2); });
$('graph-zoom-out').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() / 1.2); });
new MutationObserver(() => { if (state.view === 'graph') void renderGraph(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('popstate', () => { state = parseState(location.search, categories); render(); });
if (writerConfig) void refreshCards();
else render();
