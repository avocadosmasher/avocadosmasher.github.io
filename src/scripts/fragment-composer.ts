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
const next = document.querySelector<HTMLButtonElement>('#composer-next')!;
const fields = [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')];
const config = dialog.dataset.writer ? createWriterConfig(JSON.parse(dialog.dataset.writer)) : undefined;
let token = '';
let busy = false;
let saved = false;
let pending: WriterDraft | undefined;

function render() {
  save.disabled = !config || !token || busy || saved;
  save.textContent = saved ? '저장 완료' : busy && pending ? '저장 확인 중…' : pending ? '같은 내용으로 다시 저장' : '카드 저장';
  if (login) { login.disabled = busy; login.hidden = !!token; }
  if (logout) { logout.disabled = busy; logout.hidden = !token; }
  for (const field of fields) field.readOnly = !!pending;
  next.hidden = !saved;
  form.setAttribute('aria-busy', String(busy));
}
trigger.addEventListener('click', () => dialog.showModal());
for (const id of ['composer-close', 'composer-later']) {
  document.getElementById(id)!.addEventListener('click', () => dialog.close());
}
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
  if (!config || !token || busy || saved) return;
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
    saved = true;
    status.textContent = 'GitHub에 저장된 파일을 확인했습니다. 현재 카드 목록은 자동 갱신되지 않으며, 사이트 반영은 별도 빌드·배포 후 확인할 수 있습니다.';
  } catch (error) {
    if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) token = '';
    status.textContent = error instanceof WriterError ? error.message : '저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장해주세요.';
  } finally { busy = false; render(); }
});
next.addEventListener('click', () => {
  if (!saved || busy) return;
  form.reset(); pending = undefined; saved = false;
  result.hidden = true; result.removeAttribute('href');
  status.textContent = token ? '새 카드를 작성해주세요.' : 'GitHub에 로그인하면 카드를 저장할 수 있습니다.';
  render(); fields[0].focus();
});
// Deliberately no token persistence or logging. Full refresh starts a new login.
render();
