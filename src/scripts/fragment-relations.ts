import { relationLabels, searchFragments, type Fragment } from '../lib/fragments';

export function relationEditor(currentId: () => string) {
  const root = document.querySelector<HTMLFieldSetElement>('#composer-relations')!;
  const value = document.querySelector<HTMLInputElement>('#composer-relation-value')!;
  const query = document.querySelector<HTMLInputElement>('#composer-relation-search')!;
  const target = document.querySelector<HTMLSelectElement>('#composer-relation-target')!;
  const type = document.querySelector<HTMLSelectElement>('#composer-relation-type')!;
  const add = document.querySelector<HTMLButtonElement>('#composer-relation-add')!;
  const list = document.getElementById('composer-relation-list')!;
  const notice = document.getElementById('composer-relation-notice')!;
  let cards: Fragment[] = JSON.parse(document.getElementById('fragment-data')!.textContent ?? '[]');
  const relations = (): Fragment['relations'] => JSON.parse(value.value || '[]');
  const label = (id: string) => cards.find(card => card.id === id)?.title ?? `찾을 수 없는 카드 (${id})`;
  const connected = (id: string) => relations().some(relation => relation.target === id) ||
    cards.some(card => card.id === id && card.relations.some(relation => relation.target === currentId()));
  function choices() {
    const previous = target.value;
    const matches = searchFragments(cards, query.value, '').filter(card => card.id !== currentId());
    target.replaceChildren(new Option(matches.length ? '카드를 선택해주세요' : '검색 결과가 없습니다', ''), ...matches.map(card => {
      const option = new Option(`${card.title} · ${card.category}${cards.filter(item => item.title === card.title).length > 1 ? ` · ${card.id}` : ''}${connected(card.id) ? ' · 이미 연결됨' : ''}`, card.id);
      option.disabled = connected(card.id); return option;
    }));
    if (matches.some(card => card.id === previous && !connected(card.id))) target.value = previous;
    add.disabled = root.disabled || !target.value;
  }
  function render(disabled = root.disabled) {
    root.disabled = disabled;
    choices();
    list.replaceChildren(...relations().map((relation, index) => {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${relationLabels[relation.type]} · ${label(relation.target)}`;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'btn btn--ghost'; remove.textContent = '제거';
      remove.setAttribute('aria-label', `관계 제거: ${label(relation.target)} (${relationLabels[relation.type]})`);
      remove.addEventListener('click', () => {
        if (root.disabled) return;
        value.value = JSON.stringify(relations().filter((_, position) => position !== index));
        notice.textContent = '관계를 제거했습니다. 카드 저장을 눌러 반영해주세요.';
        render(); target.focus();
      });
      item.append(text, remove); return item;
    }));
  }
  query.addEventListener('input', choices);
  target.addEventListener('change', choices);
  query.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); target.focus(); } });
  add.addEventListener('click', () => {
    if (root.disabled || !target.value || target.value === currentId() || !cards.some(card => card.id === target.value)) return;
    const next = relations();
    if (connected(target.value)) {
      notice.textContent = '이미 추가된 관계입니다.'; return;
    }
    next.push({ target: target.value, type: type.value as Fragment['relations'][number]['type'] });
    value.value = JSON.stringify(next);
    notice.textContent = '관계를 추가했습니다. 카드 저장을 눌러 반영해주세요.';
    render();
  });
  window.addEventListener('fragment-collection', event => { cards = (event as CustomEvent<Fragment[]>).detail; render(); });
  return { render, reset: () => { query.value = ''; type.value = 'related'; target.value = ''; notice.textContent = ''; render(); } };
}
