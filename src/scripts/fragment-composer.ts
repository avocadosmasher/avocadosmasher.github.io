import { createWriterConfig, draftFromFields, saveNewFragment, verifyWriter, WriterError, type WriterDraft } from '../lib/fragment-writer';
import { loginWriter } from '../lib/fragment-writer-login';

const dialog = document.querySelector<HTMLDialogElement>('#fragment-composer')!;
const trigger = document.querySelector<HTMLButtonElement>('#fragment-compose')!;
const form = document.querySelector<HTMLFormElement>('#composer-form')!;
const status = document.getElementById('composer-status')!;
const save = document.querySelector<HTMLButtonElement>('#composer-save')!;
const login = document.querySelector<HTMLButtonElement>('#composer-login');
const logout = document.querySelector<HTMLButtonElement>('#composer-logout');
const result = document.querySelector<HTMLAnchorElement>('#composer-result')!;
const success = document.getElementById('composer-success')!;
const closers = ['composer-close', 'composer-later'].map(id => document.getElementById(id) as HTMLButtonElement);
const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select')];
const config = dialog.dataset.writer ? createWriterConfig(JSON.parse(dialog.dataset.writer)) : undefined;
let token = '';
let busy = false;
let pending: WriterDraft | undefined;

function render() {
  save.disabled = !config || !token || busy;
  save.textContent = busy && pending ? '저장 확인 중…' : pending ? '같은 내용으로 다시 저장' : '카드 저장';
  if (login) { login.disabled = busy; login.hidden = !!token; }
  if (logout) { logout.disabled = busy; logout.hidden = !token; }
  for (const field of fields) {
    if (field instanceof HTMLSelectElement) field.disabled = !!pending;
    else field.readOnly = !!pending;
  }
  for (const closer of closers) closer.disabled = busy;
  form.setAttribute('aria-busy', String(busy));
}
trigger.addEventListener('click', () => dialog.showModal());
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
dialog.addEventListener('close', () => trigger.focus());

login?.addEventListener('click', async () => {
  if (!config || busy) return;
  busy = true; render();
  status.textContent = 'GitHub 로그인과 작성 권한을 확인하고 있습니다.';
  try {
    const candidate = await loginWriter(config);
    await verifyWriter(config, candidate);
    token = candidate;
    status.textContent = '로그인되었습니다. 카드를 저장할 수 있습니다.';
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
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!config || !token || busy) return;
  if (!pending) {
    try { pending = draftFromFields(Object.fromEntries(fields.map(field => [field.name, field.value]))); }
    catch { status.textContent = '용어, 요약, 카테고리에 공백 이외의 내용을 입력해주세요.'; return; }
  }
  busy = true; render();
  status.textContent = 'GitHub 저장 결과를 확인하고 있습니다. 페이지를 떠나지 마세요.';
  try {
    const response = await saveNewFragment(config, token, pending);
    result.href = response.url;
    result.hidden = false;
    success.textContent = `“${pending.title}” 카드를 저장했습니다. 공개 목록에는 사이트 업데이트 후 표시됩니다.`;
    form.reset(); pending = undefined;
    status.textContent = '새 카드를 작성해주세요.';
    dialog.close();
  } catch (error) {
    if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) token = '';
    status.textContent = error instanceof WriterError ? error.message : '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.';
  } finally { busy = false; render(); }
});
// Deliberately no token persistence or logging. Full refresh starts a new login.
render();
