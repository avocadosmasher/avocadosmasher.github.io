import { createWriterConfig, deleteFragment, draftFromFields, loadFragment, saveExistingFragment, saveNewFragment, saveRelationChanges, verifyWriter, WriterError, type WriterDraft, type ExistingFragment } from '../lib/fragment-writer';
import { loginWriter } from '../lib/fragment-writer-login';
import { liveFragment } from '../lib/fragment-live';
import { relationEditor } from './fragment-relations';

const dialog = document.querySelector<HTMLDialogElement>('#fragment-composer')!;
const trigger = document.querySelector<HTMLButtonElement>('#fragment-compose')!;
const form = document.querySelector<HTMLFormElement>('#composer-form')!;
const status = document.getElementById('composer-status')!;
const errorPanel = document.getElementById('composer-error')!;
function showFailure(title: string, message: string) {
  status.textContent = message;
  document.getElementById('composer-error-title')!.textContent = title;
  document.getElementById('composer-error-message')!.textContent = message;
  errorPanel.hidden = false;
  errorPanel.focus();
  errorPanel.scrollIntoView({ block: 'nearest' });
}
const save = document.querySelector<HTMLButtonElement>('#composer-save')!;
const remove = document.querySelector<HTMLButtonElement>('#composer-delete')!;
const login = document.querySelector<HTMLButtonElement>('#composer-login');
const logout = document.querySelector<HTMLButtonElement>('#composer-logout');
const result = document.querySelector<HTMLAnchorElement>('#composer-result')!;
const success = document.getElementById('composer-success')!;
const closers = ['composer-close', 'composer-later'].map(id => document.getElementById(id) as HTMLButtonElement);
const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[name],textarea[name],select[name]')];
const config = dialog.dataset.writer ? createWriterConfig(JSON.parse(dialog.dataset.writer)) : undefined;
let token = '';
let busy = false;
let pending: WriterDraft | undefined;
let existing: ExistingFragment | undefined;
let editingId = '';
const relations = relationEditor(() => editingId);
let returnFocus: HTMLElement = trigger;
const edit = document.querySelector<HTMLButtonElement>('#fragment-edit')!;
const editPaths: Record<string, string> = JSON.parse(document.getElementById('fragment-edit-paths')!.textContent ?? '{}');
window.addEventListener('fragment-paths', event => {
  const paths = (event as CustomEvent<Record<string, string>>).detail;
  for (const id of Object.keys(editPaths)) delete editPaths[id];
  Object.assign(editPaths, paths);
});
const heading = document.getElementById('composer-title')!;
const categoryField = form.elements.namedItem('category') as HTMLSelectElement;
type Session = { values: Record<string, string>; pending?: WriterDraft; existing?: ExistingFragment; message: string };
const sessions = new Map<string, Session>();
function values() { return Object.fromEntries(fields.map(field => [field.name, field.value])); }
function remember() { sessions.set(editingId, { values: values(), pending, existing, message: status.textContent ?? '' }); }
function fill(values: Record<string, string>) {
  categoryField.querySelector('[data-legacy]')?.remove();
  if (values.category && ![...categoryField.options].some(option => option.value === values.category)) {
    const option = new Option(`${values.category} (기존 카테고리)`, values.category);
    option.dataset.legacy = 'true'; categoryField.add(option);
  }
  for (const field of fields) field.value = values[field.name] ?? (field.name === 'relations' ? '[]' : '');
  relations.reset();
}
function switchSession(id: string) {
  errorPanel.hidden = true;
  remember(); editingId = id;
  const session = sessions.get(id);
  pending = session?.pending; existing = session?.existing;
  fill(session?.values ?? {});
  status.textContent = session?.message ?? (id ? '수정할 카드의 원문을 불러와주세요.' : '새 카드를 작성해주세요.');
  heading.textContent = id ? '카드 수정' : '새 카드 작성';
}

function render() {
  relations.render(!!pending || busy || (!!editingId && !existing));
  remove.hidden = !config || !token || !existing || !editingId;
  remove.disabled = busy || !!pending;
  save.disabled = !config || !token || busy || (!!editingId && !existing);
  save.textContent = busy && pending ? '저장 확인 중…' : pending ? '같은 내용으로 다시 저장' : editingId ? '수정 저장' : '카드 저장';
  edit.hidden = !config;
  edit.textContent = token ? '카드 수정' : '로그인하고 수정';
  if (login) { login.disabled = busy; login.hidden = !!token; }
  if (logout) { logout.disabled = busy; logout.hidden = !token; }
  for (const field of fields) {
    if (field instanceof HTMLSelectElement) field.disabled = !!pending || busy || (!!editingId && !existing);
    else field.readOnly = !!pending || busy || (!!editingId && !existing);
  }
  for (const closer of closers) closer.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}
trigger.addEventListener('click', () => { switchSession(''); returnFocus = trigger; render(); dialog.showModal(); });
async function fetchExisting() {
  if (!config || !token || !editingId || existing) return;
  existing = await loadFragment(config, token, editPaths[editingId] ?? '', editingId);
  const draft = existing.draft;
  fill({ ...draft, aliases: draft.aliases.join(', '), tags: draft.tags.join(', '), relations: JSON.stringify(draft.relations) } as unknown as Record<string, string>);
  status.textContent = '최신 내용을 불러왔습니다. 같은 파일과 ID로 저장합니다. 연결된 개념도 수정할 수 있습니다.';
}
edit.addEventListener('click', async () => {
  if (!config || busy || !edit.dataset.cardId) return;
  switchSession(edit.dataset.cardId); returnFocus = edit; dialog.showModal();
  if (existing || !token) { render(); return; }
  busy = true; render(); status.textContent = '최신 카드 내용을 불러오고 있습니다.';
  try { await fetchExisting(); }
  catch (error) {
    if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) token = '';
    status.textContent = error instanceof Error ? error.message : '카드를 불러오지 못했습니다. 닫은 뒤 다시 시도해주세요.';
  }
  finally { busy = false; render(); }
});
for (const closer of closers) {
  closer.addEventListener('click', () => { if (!busy) dialog.close(); });
}
// A drag starting in a field and ending outside must not dismiss the editor.
function outside(event: MouseEvent) {
  const rect = dialog.getBoundingClientRect();
  return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
}
let startedOutside = false;
dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
dialog.addEventListener('pointercancel', () => { startedOutside = false; });
dialog.addEventListener('click', event => {
  if (startedOutside && outside(event) && !busy) dialog.close();
  startedOutside = false;
});
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { remember(); returnFocus.focus(); });

login?.addEventListener('click', async () => {
  if (!config || busy) return;
  busy = true; render();
  status.textContent = 'GitHub 로그인과 작성 권한을 확인하고 있습니다.';
  try {
    const candidate = await loginWriter(config);
    await verifyWriter(config, candidate);
    token = candidate;
    status.textContent = '로그인되었습니다. 카드를 저장할 수 있습니다.';
    await fetchExisting();
  } catch (error) {
    token = '';
    status.textContent = error instanceof Error ? error.message : '로그인을 완료하지 못했습니다.';
  } finally { busy = false; render(); }
});
logout?.addEventListener('click', () => {
  if (busy) return;
  token = '';
  status.textContent = '로그아웃했습니다. 입력 내용은 이 페이지에 유지됩니다.';
  render();
});
remove.addEventListener('click', async () => {
  if (!config || !token || !existing || busy || pending) return;
  if (!window.confirm(`“${existing.draft.title}” 카드를 삭제할까요? 저장하지 않은 수정 내용도 사라집니다. 다른 카드가 참조하고 있으면 삭제하지 않습니다.`)) return;
  errorPanel.hidden = true;
  busy = true; render();
  status.textContent = '최신 버전과 관계를 확인하고 삭제하고 있습니다. 페이지를 떠나지 마세요.';
  try {
    const response = await deleteFragment(config, token, existing);
    const title = existing.draft.title;
    const next = response.snapshot.map(item => liveFragment(item.draft));
    result.href = response.url; result.hidden = false;
    success.textContent = response.recovered ? `“${title}” 카드가 이미 삭제된 것을 확인했습니다.` : `“${title}” 카드를 삭제했습니다.`;
    sessions.delete(editingId); form.reset(); fill({}); existing = undefined; pending = undefined;
    status.textContent = '삭제를 확인했습니다.';
    document.getElementById('fragment-close')!.click();
    returnFocus = trigger; dialog.close();
    window.dispatchEvent(new CustomEvent('fragment-paths', { detail: Object.fromEntries(response.snapshot.map(item => [item.draft.id, item.path])) }));
    window.dispatchEvent(new CustomEvent('fragment-deleted', { detail: next }));
  } catch (error) {
    if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) token = '';
    showFailure('카드 삭제를 완료하지 못했습니다', error instanceof WriterError && error.code !== 'network' ? error.message : '삭제 결과를 확인하지 못했습니다. 입력과 목록은 유지했습니다. 다시 삭제를 눌러 확인해주세요.');
  } finally { busy = false; render(); }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!config || !token || busy || (editingId && !existing)) return;
  errorPanel.hidden = true;
  if (!pending) {
    try { pending = draftFromFields(values(), existing?.draft); }
    catch { status.textContent = '용어, 요약, 카테고리에 공백 이외의 내용을 입력해주세요.'; return; }
  }
  busy = true; render();
  status.textContent = 'GitHub 저장 결과를 확인하고 있습니다. 페이지를 떠나지 마세요.';
  try {
    // Render before writing so a display failure cannot be mistaken for a failed GitHub save.
    const savedCard = liveFragment(pending);
    const savedPath = existing?.path ?? `src/content/fragments/${pending.id}.md`;
    const relationsChanged = JSON.stringify(pending.relations) !== JSON.stringify(existing?.draft.relations ?? []);
    const response = relationsChanged ? await saveRelationChanges(config, token, pending, existing)
      : existing ? await saveExistingFragment(config, token, existing, pending) : await saveNewFragment(config, token, pending);
    result.href = response.url;
    result.hidden = false;
    success.textContent = `“${pending.title}” 카드를 저장했습니다. 목록과 상세에도 반영했습니다.`;
    form.reset(); fill({}); pending = undefined; existing = undefined;
    sessions.delete(editingId);
    status.textContent = editingId ? '저장했습니다. 다시 수정하면 최신 원문을 불러옵니다.' : '새 카드를 작성해주세요.';
    if (editingId) {
      document.getElementById('fragment-close')!.click();
      returnFocus = trigger;
    }
    dialog.close();
    editPaths[savedCard.id] = savedPath;
    window.dispatchEvent(new CustomEvent('fragment-saved', { detail: { card: savedCard, path: savedPath } }));
  } catch (error) {
    if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) token = '';
    if (error instanceof WriterError && ['snapshot', 'rate-limit', 'relation'].includes(error.code)) pending = undefined;
    showFailure('카드 저장을 완료하지 못했습니다', error instanceof WriterError ? error.message : '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.');
  } finally { busy = false; render(); }
});
// Deliberately no token persistence or logging. Full refresh starts a new login.
render();
