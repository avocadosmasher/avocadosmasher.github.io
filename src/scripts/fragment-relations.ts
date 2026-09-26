import { inverseRelationLabels, relationLabels, searchFragments, type Fragment } from '../lib/fragments';

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
  // Cards whose relation to this one the author removed here; applied to their files on save.
  let detached: string[] = [];
  const relations = (): Fragment['relations'] => JSON.parse(value.value || '[]');
  const label = (id: string) => cards.find(card => card.id === id)?.title ?? `찾을 수 없는 카드 (${id})`;
  // The same edge read from this side: it is stored in the other card, under the opposite name.
  const incoming = () => cards.flatMap(card => card.id === currentId() || detached.includes(card.id) ? []
    : card.relations.filter(relation => relation.target === currentId()).map(relation => ({ target: card.id, type: relation.type })));
  const connected = (id: string) => relations().some(relation => relation.target === id) ||
    incoming().some(relation => relation.target === id);
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
  function entry(name: string, targetId: string, remove: () => void, note?: string) {
    const item = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${name} · ${label(targetId)}`;
    if (note) {
      const hint = document.createElement('span');
      hint.className = 'fragment-hint'; hint.textContent = note;
      text.append(' ', hint);
    }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn--ghost'; button.textContent = '제거';
    button.setAttribute('aria-label', `관계 제거: ${label(targetId)} (${name})`);
    button.addEventListener('click', () => {
      if (root.disabled) return;
      remove();
      notice.textContent = '관계를 제거했습니다. 카드 저장을 눌러 반영해주세요.';
      render(); target.focus();
    });
    item.append(text, button); return item;
  }
  function render(disabled = root.disabled) {
    root.disabled = disabled;
    choices();
    list.replaceChildren(
      ...relations().map((relation, index) => entry(relationLabels[relation.type], relation.target,
        () => { value.value = JSON.stringify(relations().filter((_, position) => position !== index)); })),
      ...incoming().map(relation => entry(inverseRelationLabels[relation.type], relation.target,
        () => { detached = [...detached, relation.target]; }, `· ${label(relation.target)} 카드에 저장됨`)),
    );
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
  return { render, detached: () => detached,
    reset: () => { query.value = ''; type.value = 'related'; target.value = ''; notice.textContent = ''; detached = []; render(); } };
}
