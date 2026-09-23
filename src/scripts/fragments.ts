import { filterFocusOptions, focusOptions, graphData, graphNodeDiameter, resolveFocus, graphNodeSpacing, paginate, parseState, relationLabels, searchFragments, separateNodes, stateUrl, type PublicFragment } from '../lib/fragments';
import { CATEGORIES } from '../consts';
import type { Core, EdgeSingular, LayoutOptions, NodeSingular } from 'cytoscape';
import { createWriterConfig } from '../lib/fragment-writer';
import { loadFragmentSnapshot } from '../lib/fragment-snapshot';
import { countPendingDrafts, discardDraftChange, publishDrafts } from '../lib/fragment-publish';
import { latestDeploy } from '../lib/fragment-deploy';
import { loadSession } from '../lib/fragment-session';
import { liveFragment } from '../lib/fragment-live';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cards: PublicFragment[] = JSON.parse($('fragment-data').textContent ?? '[]');
const categories = [...new Set(cards.map(c => c.category))];
const byId = new Map(cards.map(c => [c.id, c]));
const input = $<HTMLInputElement>('fragment-search');
const category = $<HTMLSelectElement>('fragment-category');
const dialog = $<HTMLDialogElement>('fragment-dialog');
const focus = $<HTMLInputElement>('graph-focus');
const focusSearch = $<HTMLInputElement>('graph-focus-search');
const focusHint = $('graph-focus-hint').textContent ?? '';
// 입력창 안의 × 버튼은 지울 글자가 있을 때만 보인다.
const clearButtons = [...document.querySelectorAll<HTMLButtonElement>('.fragment-clear')];
function syncClearButtons() {
  for (const clear of clearButtons) clear.hidden = !$<HTMLInputElement>(clear.dataset.clears!).value;
}
const focusLabel = (id: string) => (id ? focusOptions(cards).find(option => option.id === id)?.label ?? '' : '');
function setFocus(id: string) {
  focus.value = id;
  focusSearch.value = focusLabel(id);
  $('graph-focus-hint').textContent = focusHint;
  syncClearButtons();
}

// 중심 개념 후보 목록(콤보박스). 브라우저 기본 자동완성 창은 크기·모양을 바꿀 수 없어 직접 그린다.
const focusList = $<HTMLUListElement>('graph-focus-list');
let activeOption = -1;
// 이미 고른 개념 이름이 그대로 들어 있으면 목록은 전체를 보여준다.
const focusFilter = () => (focusSearch.value === focusLabel(focus.value) ? '' : focusSearch.value);
const focusItems = () => [...focusList.querySelectorAll<HTMLLIElement>('[data-id]')];
function openFocusList() {
  const { options, total } = filterFocusOptions(cards, focusFilter());
  activeOption = -1;
  focusSearch.removeAttribute('aria-activedescendant');
  focusList.replaceChildren(...options.map((option, index) => {
    const item = text('li', '');
    Object.assign(item, { id: `graph-focus-option-${index}` });
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.id === focus.value));
    item.dataset.id = option.id;
    item.append(text('span', option.label, 'fragment-option-title'), text('span', option.category, 'fragment-option-category'));
    // mousedown에서 고르면 입력창 포커스가 빠지기 전에 선택이 끝난다.
    item.addEventListener('mousedown', event => { event.preventDefault(); chooseFocus(option.id); });
    return item;
  }));
  const note = !options.length ? '일치하는 개념이 없습니다.' : total > options.length ? `${total - options.length}개 더 있습니다. 이름을 더 입력해 좁혀보세요.` : '';
  if (note) { const item = text('li', note, 'fragment-listbox-note'); item.setAttribute('aria-disabled', 'true'); focusList.append(item); }
  focusList.hidden = false;
  focusSearch.setAttribute('aria-expanded', 'true');
}
function closeFocusList() {
  focusList.hidden = true;
  activeOption = -1;
  focusSearch.setAttribute('aria-expanded', 'false');
  focusSearch.removeAttribute('aria-activedescendant');
}
function moveActiveOption(step: number) {
  const items = focusItems();
  if (!items.length) return;
  activeOption = (activeOption + step + items.length) % items.length;
  items.forEach((item, index) => item.classList.toggle('is-active', index === activeOption));
  focusSearch.setAttribute('aria-activedescendant', items[activeOption].id);
  items[activeOption].scrollIntoView({ block: 'nearest' });
}
function chooseFocus(id: string) {
  const changed = id !== focus.value;
  setFocus(id);
  closeFocusList();
  if (changed) void renderGraph();
}
const depth = $<HTMLSelectElement>('graph-depth');
let state = parseState(location.search, categories);
let lastFocus: HTMLElement | null = null;
let cy: Core | undefined;
let graphGeneration = 0;
let fcoseRegistered = false;
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
  setFocus(byId.has(selectedFocus) ? selectedFocus : '');
  if (!focusList.hidden) openFocusList();
  window.dispatchEvent(new CustomEvent('fragment-collection', { detail: cards }));
  render();
}
// Visitors see the published branch; a signed-in author sees the drafts waiting to be published.
let reading = writerConfig?.publish ?? writerConfig?.branch;
let session = '';
window.addEventListener('fragment-session', event => {
  session = (event as CustomEvent<string>).detail ?? '';
  if (!writerConfig?.publish) return;
  $('fragment-publish').hidden = !session;
  if (!session) { expanded = false; renderPending([]); window.clearTimeout(deployTimer); $('fragment-deploy').hidden = true; return; }
  void showPending();
  void showDeploy(true);
  if (reading === writerConfig.branch) return;
  reading = writerConfig.branch;
  void refreshCards();
});

// The stored session is read here too: the list must not depend on catching the composer's event.
if (writerConfig?.publish) {
  const stored = loadSession(writerConfig);
  if (stored) {
    session = stored;
    $('fragment-publish').hidden = false;
    reading = writerConfig.branch;
    void showPending();
    void showDeploy(true);
  }
}

// The site only changes once the deploy of the published branch finishes, so the author can watch it here.
let deployTimer = 0;
// After publishing, the run for that commit takes a moment to appear; until then the old run is not the answer.
let awaiting = '';
async function showDeploy(watch = false) {
  if (!writerConfig?.publish || !session) return;
  const panel = $('fragment-deploy');
  const text = $('fragment-deploy-text');
  const link = $('fragment-deploy-link') as HTMLAnchorElement;
  try {
    const deploy = await latestDeploy(writerConfig, session);
    const queued = awaiting !== '' && deploy.sha !== awaiting;
    if (deploy.state === 'none' && !queued) {
      panel.hidden = false;
      panel.dataset.state = 'none';
      link.hidden = true;
      text.replaceChildren(...sentences(['아직 배포 기록이 없습니다.']));
      return;
    }
    const state = queued ? 'running' : deploy.state;
    if (!queued && deploy.state !== 'running') awaiting = '';
    panel.hidden = false;
    panel.dataset.state = state;
    link.hidden = queued || !deploy.url;
    if (deploy.url) link.href = deploy.url;
    const lines = state === 'running' ? ['배포 중입니다.', '끝나면 사이트에 반영됩니다.']
      : state === 'success' ? ['마지막 배포가 끝났습니다.', '발행한 내용이 사이트에 반영되어 있습니다.']
      : state === 'failure' ? ['마지막 배포가 실패했습니다.', '사이트는 이전 내용 그대로입니다.']
      : ['마지막 배포가 취소되었습니다.', '이어지는 배포 결과를 확인해주세요.'];
    text.replaceChildren(...sentences(lines));
    window.clearTimeout(deployTimer);
    if (watch && state === 'running') deployTimer = window.setTimeout(() => void showDeploy(true), queued ? 5000 : 15000);
    if (state === 'success' && !queued) { void showPending(); void refreshCards(); }
  } catch (error) {
    // Hiding the line would leave the author guessing; point at the history instead.
    panel.hidden = false;
    panel.dataset.state = 'unknown';
    link.hidden = false;
    link.href = `https://github.com/${writerConfig.repo}/actions/workflows/deploy.yml?query=branch%3A${encodeURIComponent(writerConfig.publish)}`;
    text.replaceChildren(...sentences(['배포 상태를 확인하지 못했습니다.', error instanceof Error ? error.message : '']));
    window.clearTimeout(deployTimer);
  }
}

const kindLabel: Record<string, string> = { added: '새 카드', removed: '삭제', modified: '수정', renamed: '이름 변경', changed: '수정' };
let expanded = false;

function renderPending(cards: { path: string; id: string; status: string }[]) {
  const list = $('fragment-publish-list');
  const toggle = $('fragment-publish-toggle') as HTMLButtonElement;
  toggle.hidden = cards.length === 0;
  if (cards.length === 0) expanded = false;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? '목록 접기' : '목록 보기';
  list.hidden = !expanded;
  list.replaceChildren(...cards.map(card => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = byId.get(card.id)?.title ?? card.id;
    const kind = document.createElement('span');
    kind.className = 'fragment-publish-kind';
    kind.textContent = kindLabel[card.status] ?? card.status;
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.textContent = '제거';
    drop.setAttribute('aria-label', `${name.textContent} 발행 대기에서 제거`);
    drop.addEventListener('click', () => void discard(card, drop));
    item.append(name, kind, drop);
    return item;
  }));
}

// Taking a card out of the list restores it to whatever the live site already holds.
async function discard(card: { path: string; id: string; status: string }, button: HTMLButtonElement) {
  if (!writerConfig?.publish || !session) return;
  button.disabled = true;
  setStatus('발행 대기에서 제거하고 있습니다.');
  try {
    await discardDraftChange(writerConfig, session, card.path);
    await refreshCards();
    await showPending('발행 대기에서 제거했습니다.');
  } catch (error) {
    button.disabled = false;
    setStatus(error instanceof Error ? error.message : '제거하지 못했습니다.');
  }
}

$('fragment-publish-toggle').addEventListener('click', () => {
  expanded = !expanded;
  void showPending();
});

async function showPending(message = '') {
  if (!writerConfig?.publish || !session) return;
  const button = $('fragment-publish-run') as HTMLButtonElement;
  try {
    // Only card changes matter: a card that was created and dropped again leaves commits but nothing to publish.
    const { cards } = await countPendingDrafts(writerConfig, session);
    button.hidden = cards.length === 0;
    renderPending(cards);
    if (message) setStatus(message);
    else if (cards.length) setStatus('발행하면 사이트에 반영됩니다.', `발행 대기 카드 ${cards.length}개.`);
    else setStatus('발행할 변경이 없습니다.', '저장한 내용이 모두 사이트에 반영되어 있습니다.');
  } catch (error) {
    button.hidden = true;
    renderPending([]);
    setStatus(message || (error instanceof Error ? error.message : '발행 대기 상태를 확인하지 못했습니다.'));
  }
}

// Korean wraps by word, so each sentence stays whole instead of trailing one word onto the next line.
function setStatus(...parts: string[]) {
  $('fragment-publish-status').replaceChildren(...sentences(parts));
}

// The space between sentences is a text node: it collapses at a line break, so no line starts indented.
function sentences(parts: string[]): Node[] {
  return parts.filter(Boolean).flatMap((part, index) => {
    const span = document.createElement('span');
    span.textContent = part;
    return index ? [document.createTextNode(' '), span] : [span];
  });
}

$('fragment-publish-run').addEventListener('click', async () => {
  if (!writerConfig?.publish || !session) return;
  const button = $('fragment-publish-run') as HTMLButtonElement;
  const result = $('fragment-publish-result') as HTMLAnchorElement;
  button.disabled = true; result.hidden = true;
  setStatus('발행하고 있습니다.');
  try {
    const published = await publishDrafts(writerConfig, session);
    if (published.url) { result.href = published.url; result.hidden = false; }
    await showPending(published.published
      ? '발행했습니다. 배포가 끝나면 사이트에 반영됩니다.'
      : '이미 모두 발행되어 있습니다.');
    if (published.published) {
      awaiting = published.url?.split('/').pop() ?? '';
      void showDeploy(true);
    }
    (button as HTMLButtonElement).hidden = true;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '발행하지 못했습니다.');
  } finally {
    button.disabled = false;
  }
});
window.addEventListener('fragment-saved', () => void showPending());
window.addEventListener('fragment-deleted', () => void showPending());
async function refreshCards() {
  if (!writerConfig) return;
  const generation = ++snapshotGeneration;
  $('fragment-sync').hidden = false;
  $('fragment-sync-status').textContent = '최신 카드를 불러오고 있습니다.';
  $('fragment-sync-retry').hidden = true;
  try {
    const snapshot = await loadFragmentSnapshot(writerConfig, fetch, reading);
    if (generation !== snapshotGeneration) return;
    const next = snapshot.map(item => liveFragment(item.draft));
    authoritative = true;
    window.dispatchEvent(new CustomEvent('fragment-paths', { detail: Object.fromEntries(snapshot.map(item => [item.draft.id, item.path])) }));
    updateCollection(next);
    $('fragment-sync-status').textContent = writerConfig.publish && reading === writerConfig.branch
      ? '발행 전 초안까지 불러왔습니다.' : '최신 카드를 불러왔습니다.';
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
window.addEventListener('fragment-deleted', event => {
  snapshotGeneration++;
  authoritative = true;
  updateCollection((event as CustomEvent<PublicFragment[]>).detail);
  $('fragment-sync-status').textContent = '삭제 결과를 현재 목록에 반영했습니다.';
  $('fragment-sync-retry').hidden = true;
});

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
  input.value = state.q; category.value = state.category; syncClearButtons();
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
  depth.disabled = !focus.value;
  const data = graphData(cards, focus.value || undefined, matches, Number(depth.value));
  $('graph-status').textContent = '관계를 불러오는 중…'; $('graph-retry').hidden = true;
  const noRelations = $('graph-empty-relations');
  noRelations.hidden = !data.nodes.length || !!data.edges.length;
  noRelations.textContent = cards.every(card => !card.relations.length)
    ? '관계가 아직 등록되지 않았습니다. 현재는 개념만 표시합니다. 카드 간 관계를 지정하는 기능은 준비 중입니다.'
    : '현재 선택 범위에는 연결된 관계가 없습니다. 다른 중심 개념이나 전체 관계를 선택해보세요.';
  $('graph-accessible').replaceChildren(...data.nodes.map(node => {
    const control = button(node.data.label, () => { pinnedNode = node.data.id; highlightNode(); openCard(node.data.id); });
    control.dataset.node = node.data.id;
    control.addEventListener('mouseenter', () => highlightNode(node.data.id));
    control.addEventListener('mouseleave', () => highlightNode());
    control.addEventListener('focus', () => highlightNode(node.data.id));
    control.addEventListener('blur', () => highlightNode());
    return control;
  }));
  try {
    const [{ default: cytoscape }, { default: fcose }] = await Promise.all([import('cytoscape'), import('cytoscape-fcose')]);
    if (generation !== graphGeneration) return;
    if (!fcoseRegistered) { cytoscape.use(fcose); fcoseRegistered = true; }
    cy?.destroy();
    const dark = document.documentElement.dataset.theme === 'dark';
    const degree = new Map<string, number>();
    for (const edge of data.edges) for (const id of [edge.data.source, edge.data.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
    const maxDegree = Math.max(0, ...degree.values());
    const hubWeight = (id: string) => (maxDegree ? Math.sqrt((degree.get(id) ?? 0) / maxDegree) : 0);
    // 멀리서 볼 때도 라벨을 유지할 허브. 작은 그래프는 모든 라벨이 보이도록 전부 허브로 둔다.
    const hubCount = data.nodes.length <= 30 ? data.nodes.length : Math.min(20, Math.ceil(data.nodes.length * 0.05));
    const hubs = new Set([...data.nodes].sort((a, b) => (degree.get(b.data.id) ?? 0) - (degree.get(a.data.id) ?? 0)).slice(0, hubCount).map(node => node.data.id));
    const nodes = data.nodes.map(node => ({
      data: { ...node.data, size: graphNodeDiameter(degree.get(node.data.id) ?? 0, maxDegree), color: CATEGORIES[byId.get(node.data.id)?.category ?? ''] ?? '#8070e8' },
      classes: hubs.has(node.data.id) ? 'graph-hub' : '',
    }));
    const highlight = dark ? '#e7e1ff' : '#312269';
    // 항상 보여야 하는 라벨은 축소 비율만큼 키워 화면에서의 글자 크기를 유지한다.
    const onScreen = (value: number) => () => value / Math.min(1, cy?.zoom() ?? 1);
    const pinnedLabel = { 'min-zoomed-font-size': 0, 'font-size': onScreen(11), 'text-max-width': () => `${onScreen(96)()}px` };
    cy = cytoscape({ container: $('fragment-graph'), elements: [...nodes, ...data.edges],
      style: [
        // 화면에서 9px보다 작아지는 라벨은 숨겨 멀리서 볼 때 글자가 겹치지 않게 한다.
        { selector: 'node', style: { label: 'data(label)', 'background-color': 'data(color)', width: 'data(size)', height: 'data(size)', color: dark ? '#f2f2f6' : '#17171f', 'font-size': 11, 'min-zoomed-font-size': 9, 'text-valign': 'bottom', 'text-margin-y': 4, 'text-wrap': 'ellipsis', 'text-max-width': '96px', 'text-background-color': getComputedStyle($('fragment-graph')).backgroundColor, 'text-background-opacity': 0.7, 'text-background-padding': '1px' } },
        { selector: 'node.graph-hub', style: { ...pinnedLabel, 'font-weight': 600 } },
        { selector: 'node[outside = 1]', style: { opacity: 0.45 } },
        // 관계 이름은 강조된 노드에 붙은 선에서만 보인다.
        { selector: 'edge', style: { width: 1.3, 'line-color': '#9690ae', 'curve-style': 'bezier', opacity: 0.55, 'arrow-scale': 1.6, 'source-arrow-color': '#9690ae', 'target-arrow-color': '#9690ae' } },
        // 관계 유형은 화살촉과 선 모양으로 구분한다. 관련: 실선 · 선행: ▶ · 상위: ◇ + 긴 점선 · 비교: 양끝 ⊣⊢ + 점선.
        { selector: 'edge[type = "prerequisite"]', style: { 'target-arrow-shape': 'triangle' } },
        { selector: 'edge[type = "part-of"]', style: { 'target-arrow-shape': 'diamond', 'target-arrow-fill': 'hollow', 'line-style': 'dashed', 'line-dash-pattern': [6, 3] } },
        { selector: 'edge[type = "contrasts"]', style: { 'source-arrow-shape': 'tee', 'target-arrow-shape': 'tee', 'line-style': 'dotted' } },
        { selector: '.graph-neighbor', style: { opacity: 1 } },
        { selector: 'node.graph-neighbor', style: { ...pinnedLabel, 'border-width': 2, 'border-color': highlight, 'z-index': 10 } },
        { selector: 'node.graph-active', style: { 'border-width': 4, 'border-color': highlight, 'z-index': 11 } },
        { selector: 'edge.graph-neighbor', style: { label: 'data(label)', width: 2.5, 'line-color': dark ? '#c0b4ff' : '#6956d4', 'source-arrow-color': dark ? '#c0b4ff' : '#6956d4', 'target-arrow-color': dark ? '#c0b4ff' : '#6956d4', color: dark ? '#eeeaff' : '#463596', 'font-size': onScreen(10),
          'text-background-color': getComputedStyle($('fragment-graph')).backgroundColor, 'text-background-opacity': 1, 'text-background-padding': '2px', 'z-index': 9,
        } },
        { selector: '.graph-muted', style: { opacity: 0.12 } },
      ], layout: data.edges.length === 0
        ? { name: 'grid', cols: $('fragment-graph').clientWidth < 560 ? 2 : Math.ceil(Math.sqrt(data.nodes.length * 2)), avoidOverlap: true, avoidOverlapPadding: 24, nodeDimensionsIncludeLabels: true, animate: false, padding: 32 }
        // cose는 노드 수백 개에서 메인 스레드를 수 초간 막으므로 규모와 무관하게 fcose를 쓴다.
        // 허브일수록 강하게 밀어내고, 허브끼리 잇는 선은 길게 둔다. 허브에 붙은 선은 당기는 힘을
        // 연결 수만큼 약하게 해(ForceAtlas2의 Dissuade Hubs) 허브가 이웃에게 끌려가 한곳에 뭉치지 않고
        // 이웃들이 허브 주위로 뻗어 나가게 한다.
        : { name: 'fcose', quality: 'default', randomize: true, nodeDimensionsIncludeLabels: false, nodeSeparation: graphNodeSpacing,
          nodeRepulsion: (node: NodeSingular) => 4500 * (1 + 12 * hubWeight(node.id())),
          idealEdgeLength: (edge: EdgeSingular) => graphNodeSpacing * (1 + 2.5 * Math.min(hubWeight(edge.source().id()), hubWeight(edge.target().id()))),
          edgeElasticity: (edge: EdgeSingular) => 0.45 * Math.min(1, 4 / Math.max(degree.get(edge.source().id()) ?? 1, degree.get(edge.target().id()) ?? 1)),
          animate: false, padding: 32 } as LayoutOptions,
      minZoom: 0.1, maxZoom: 3,
    });
    if (data.edges.length) {
      const points = cy.nodes().map(node => ({ ...node.position() }));
      separateNodes(points, graphNodeSpacing);
      cy.nodes().forEach((node, index) => { node.position(points[index]); });
    }
    let restyle = 0;
    cy.on('zoom', () => {
      cancelAnimationFrame(restyle);
      restyle = requestAnimationFrame(() => { if (cy && !cy.destroyed()) cy.style().update(); });
    });
    fitGraph();
    cy.on('mouseover', 'node', event => { $('fragment-graph').style.cursor = 'pointer'; highlightNode(event.target.id()); });
    cy.on('mouseout', 'node', () => { $('fragment-graph').style.cursor = ''; highlightNode(); });
    cy.on('tap', 'node', event => { pinnedNode = event.target.id(); highlightNode(); openCard(pinnedNode); });
    cy.on('tap', event => { if (event.target === cy) { pinnedNode = ''; highlightNode(); } });
    // 노드 버튼은 그래프보다 먼저 생기므로, 계산 중에 포커스한 버튼이 있으면 준비된 뒤 강조한다.
    const focused = document.activeElement instanceof HTMLElement && $('graph-accessible').contains(document.activeElement) ? document.activeElement.dataset.node : undefined;
    if (focused) highlightNode(focused);
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
$('fragment-related-graph').addEventListener('click', () => { setFocus(state.card); closeCard(); state.view = 'graph'; url('push'); render(); focusSearch.focus(); });
// 입력 중에는 정확히 하나로 정해질 때만 바꾸고, 입력을 마쳤는데(Enter·포커스 이동) 못 찾으면 안내한다.
focusSearch.addEventListener('input', () => {
  if (document.activeElement === focusSearch) openFocusList();
  const id = resolveFocus(cards, focusSearch.value);
  if (id === undefined || id === focus.value) return;
  focus.value = id; $('graph-focus-hint').textContent = focusHint;
  void renderGraph();
});
for (const clear of clearButtons) {
  const target = $<HTMLInputElement>(clear.dataset.clears!);
  target.addEventListener('input', syncClearButtons);
  clear.addEventListener('click', () => {
    target.value = '';
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
  });
}
$('graph-focus-open').addEventListener('mousedown', event => event.preventDefault());
$('graph-focus-open').addEventListener('click', () => {
  if (!focusList.hidden) { closeFocusList(); return; }
  focusSearch.focus();
  openFocusList();
});
focusSearch.addEventListener('click', () => { if (focusList.hidden) openFocusList(); });
focusSearch.addEventListener('blur', closeFocusList);
focusSearch.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (focusList.hidden) openFocusList();
    moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === 'Enter' && !focusList.hidden && activeOption >= 0) {
    event.preventDefault();
    chooseFocus(focusItems()[activeOption].dataset.id!);
  } else if (event.key === 'Escape' && !focusList.hidden) {
    // 검색 입력창은 Esc로 글자를 지우므로, 목록이 열려 있을 때는 목록만 닫는다.
    event.preventDefault();
    closeFocusList();
  } else if (event.key === 'Tab') closeFocusList();
});
focusSearch.addEventListener('change', () => {
  if (resolveFocus(cards, focusSearch.value) === undefined) $('graph-focus-hint').textContent = `"${focusSearch.value.trim()}"와 일치하는 개념이 없습니다. 목록에서 고르거나 이름·별칭을 정확히 입력해주세요.`;
});
depth.addEventListener('change', () => void renderGraph());
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
