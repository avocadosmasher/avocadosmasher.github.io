import { graphData, paginate, parseState, relationLabels, searchFragments, stateUrl, type PublicFragment } from '../lib/fragments';
import type { Core } from 'cytoscape';

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
    if (state.card) { $('fragment-notice').hidden = false; $('fragment-notice').textContent = '찾을 수 없는 카드입니다. 목록에서 다시 선택해주세요.'; state.card = ''; url(); }
    if (dialog.open) { dialog.close(); lastFocus?.focus(); }
    return;
  }
  $('fragment-dialog-title').textContent = card.title;
  $('fragment-dialog-category').textContent = card.category;
  $('fragment-dialog-aliases').textContent = card.aliases.join(' · ');
  $('fragment-dialog-summary').textContent = card.summary;
  // HTML is sanitized during the build; user metadata is always inserted as text.
  $('fragment-dialog-body').innerHTML = card.html;
  $('fragment-dialog-tags').replaceChildren(...card.tags.map(tag => text('span', `#${tag}`)));
  const links = card.relations.map(rel => button(`${relationLabels[rel.type]} · ${byId.get(rel.target)?.title ?? rel.target}`, () => openCard(rel.target, true)));
  $('fragment-dialog-relations').replaceChildren(...(links.length ? links : [text('p', '아직 연결된 개념이 없습니다.', 'fragment-hint')]));
  if (!dialog.open) dialog.showModal();
  $('fragment-close').focus();
}
function render() {
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
  const matches = new Set(searchFragments(cards, state.q, state.category).map(c => c.id));
  const data = graphData(cards, focus.value || undefined, matches);
  $('graph-status').textContent = '관계를 불러오는 중…'; $('graph-retry').hidden = true;
  $('graph-accessible').replaceChildren(...data.nodes.map(node => button(node.data.label, () => openCard(node.data.id))));
  try {
    const { default: cytoscape } = await import('cytoscape');
    if (generation !== graphGeneration) return;
    cy?.destroy();
    const dark = document.documentElement.dataset.theme === 'dark';
    cy = cytoscape({ container: $('fragment-graph'), elements: [...data.nodes, ...data.edges],
      style: [
        { selector: 'node', style: { label: 'data(label)', 'background-color': '#8070e8', color: dark ? '#f2f2f6' : '#17171f', 'font-size': 13, 'text-valign': 'bottom', 'text-margin-y': 8, width: 28, height: 28 } },
        { selector: 'node[outside = 1]', style: { opacity: 0.45 } },
        { selector: 'edge', style: { label: 'data(label)', width: 1.5, 'line-color': '#9690ae', color: dark ? '#cbcbd4' : '#41414c', 'font-size': 10, 'curve-style': 'bezier' } },
        { selector: 'edge[directed = 1]', style: { 'target-arrow-shape': 'triangle', 'target-arrow-color': '#9690ae' } },
      ], layout: { name: data.nodes.length > 80 ? 'circle' : 'cose', animate: false, padding: 45 }, minZoom: 0.2, maxZoom: 3,
    });
    cy.on('tap', 'node', event => openCard(event.target.id()));
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
$('graph-fit').addEventListener('click', () => cy?.fit(undefined, 45));
$('graph-zoom-in').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() * 1.2); });
$('graph-zoom-out').addEventListener('click', () => { if (cy) cy.zoom(cy.zoom() / 1.2); });
new MutationObserver(() => { if (state.view === 'graph') void renderGraph(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('popstate', () => { state = parseState(location.search, categories); render(); });
render();
