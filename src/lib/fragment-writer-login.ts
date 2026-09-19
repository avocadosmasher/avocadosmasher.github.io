import { createWriterConfig, type WriterConfig } from './fragment-writer';

/** Uses the existing Worker protocol; credentials live only in the current page's memory. */
export function loginWriter(config: WriterConfig): Promise<string> {
  createWriterConfig(config);
  const url = new URL('/auth', config.origin);
  url.search = new URLSearchParams({ provider: 'github', scope: 'public_repo', site_id: location.hostname }).toString();
  const popup = window.open(url.href, '_blank', 'popup,width=640,height=720');
  if (!popup) return Promise.reject(new Error('팝업이 차단되었습니다. 이 사이트의 팝업을 허용하고 다시 로그인해주세요.'));
  return new Promise((resolve, reject) => {
    let handshaken = false;
    const finish = (token?: string, message = '로그인을 완료하지 못했습니다. 다시 시도해주세요.') => {
      window.removeEventListener('message', receive);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(closed); clearTimeout(timeout);
      popup.close();
      if (token) resolve(token); else reject(new Error(message));
    };
    const receive = (event: MessageEvent) => {
      if (event.origin !== config.origin || event.source !== popup || typeof event.data !== 'string') return;
      if (event.data === 'authorizing:github') {
        handshaken = true;
        popup.postMessage('authorizing:github', config.origin);
        return;
      }
      if (!handshaken) return;
      const prefix = 'authorization:github:success:';
      if (event.data.startsWith(prefix)) {
        try {
          const result = JSON.parse(event.data.slice(prefix.length));
          if (result.provider === 'github' && typeof result.token === 'string' && /^[A-Za-z0-9_]{1,4096}$/.test(result.token)) {
            finish(result.token); return;
          }
        } catch { /* Malformed responses must not establish a session. */ }
        finish();
      } else if (event.data.startsWith('authorization:github:error:')) {
        finish(undefined, 'GitHub 로그인이 취소되었거나 만료되었습니다. 다시 로그인해주세요.');
      }
    };
    const onPageHide = () => finish();
    const closed = setInterval(() => { if (popup.closed) finish(undefined, '로그인 창이 닫혔습니다. 다시 로그인해주세요.'); }, 400);
    const timeout = setTimeout(() => finish(undefined, '로그인 시간이 초과되었습니다. 다시 로그인해주세요.'), 120000);
    window.addEventListener('message', receive);
    window.addEventListener('pagehide', onPageHide, { once: true });
  });
}
