import { cmsConfig, prepareFragmentSave } from '../lib/fragment-admin';

interface EntryData {
  toJS(): Record<string, unknown>;
  merge(value: Record<string, unknown>): EntryData;
}
interface Cms {
  init(options: { config: unknown }): void;
  registerEventListener(listener: {
    name: string;
    handler(event: { entry: { get(key: 'data'): EntryData } }): EntryData;
  }): void;
}
const cmsWindow = window as typeof window & { CMS_MANUAL_INIT?: boolean; CMS?: Cms };
const status = document.getElementById('admin-status')!;

async function start() {
  // Production editing remains unavailable until the actual OAuth connection is ready.
  if (status.dataset.local !== 'true') return;
  if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('로컬 주소에서 실행하세요.');
  const proxyUrl = 'http://127.0.0.1:8082/api/v1';
  const response = await fetch(proxyUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'info' }),
  });
  if (!response.ok || (await response.json()).repo !== 'cms') throw new Error('격리 저장 서버 연결을 확인하세요.');
  cmsWindow.CMS_MANUAL_INIT = true;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = status.dataset.vendor!;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('관리 화면 파일을 불러오지 못했습니다.'));
    document.head.append(script);
  });
  const cms = cmsWindow.CMS!;
  cms.registerEventListener({ name: 'preSave', handler: ({ entry }) => {
    const data = entry.get('data');
    return data.merge(prepareFragmentSave(data.toJS()));
  } });
  cms.init({ config: {
    ...cmsConfig, load_config_file: false,
    // Direct proxy selection prevents a failed local connection falling back to GitHub.
    backend: { name: 'proxy', proxy_url: proxyUrl },
  } });
  status.hidden = true;
}
start().catch(error => {
  status.textContent = `${error instanceof Error ? error.message : '관리 화면 연결 실패'} 페이지를 새로고침해 다시 시도하세요.`;
});
