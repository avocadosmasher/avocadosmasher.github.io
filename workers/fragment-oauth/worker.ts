import type { DurableObjectNamespace, DurableObjectState } from '@cloudflare/workers-types';

export interface OAuthEnv {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  OAUTH_STATE_SECRET: string;
  CMS_ORIGIN: string;
  OAUTH_CALLBACK_URL: string;
  GITHUB_SCOPE: string;
  OAUTH_SESSIONS: DurableObjectNamespace;
}
const encoder = new TextEncoder();
const ttl = 600_000;
const cookieName = '__Host-fragment-oauth';
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (value: string) => base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function sign(value: string, secret: string) {
  return base64(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(value))));
}
async function verify(value: string, signature: string, secret: string) {
  if (!/^[\w-]{43}$/.test(signature)) return false;
  const bytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
  return crypto.subtle.verify('HMAC', await signingKey(secret), bytes, encoder.encode(value));
}
function headers() {
  return new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
}
function plain(message: string, status: number) { return new Response(message, { status, headers: headers() }); }
function cookie(value: string, age: number) {
  return `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
}
function validEnv(env: OAuthEnv) {
  const cms = new URL(env.CMS_ORIGIN), callback = new URL(env.OAUTH_CALLBACK_URL);
  return cms.protocol === 'https:' && cms.origin === env.CMS_ORIGIN &&
    callback.protocol === 'https:' && callback.href === callback.origin + '/callback' &&
    !!env.GITHUB_CLIENT_ID && !!env.GITHUB_CLIENT_SECRET && env.OAUTH_STATE_SECRET.length >= 32 &&
    env.GITHUB_SCOPE === 'public_repo' && !!env.OAUTH_SESSIONS;
}
const jsonForScript = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Decap's pinned Netlify authenticator handshake. No secrets or refresh tokens here. */
export function oauthPopup(origin: string, result: { token: string; provider: 'github' } | { message: string }) {
  const nonce = random();
  const message = `authorization:github:${'token' in result ? 'success' : 'error'}:${JSON.stringify(result)}`;
  const h = headers();
  h.set('Content-Type', 'text/html; charset=utf-8');
  h.set('Set-Cookie', cookie('', 0));
  h.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  return new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>GitHub 인증</title><p>관리 화면으로 돌아가세요. 창이 남아 있으면 닫고 다시 로그인할 수 있습니다.</p><script nonce="${nonce}">
(() => {
  const target = window.opener, origin = ${jsonForScript(origin)};
  if (!target) return;
  const receive = (event) => {
    if (event.source !== target || event.origin !== origin || event.data !== 'authorizing:github') return;
    window.removeEventListener('message', receive);
    target.postMessage(${jsonForScript(message)}, origin);
  };
  window.addEventListener('message', receive);
  target.postMessage('authorizing:github', origin);
})();
</script></html>`, { headers: h });
}

export async function handleOAuth(request: Request, env: OAuthEnv, upstream: typeof fetch = fetch): Promise<Response> {
  try { if (!validEnv(env)) return plain('OAuth configuration unavailable.', 503); }
  catch { return plain('OAuth configuration unavailable.', 503); }
  const url = new URL(request.url);
  if (url.origin !== new URL(env.OAUTH_CALLBACK_URL).origin) return plain('Invalid origin.', 400);
  if (request.method !== 'GET') return plain('Method not allowed.', 405);
  if (!['/auth', '/callback'].includes(url.pathname)) return plain('Not found.', 404);
  try {
    if (url.pathname === '/auth') {
      const { searchParams: p } = url;
      if (p.get('provider') !== 'github' || (p.has('scope') && p.get('scope') !== env.GITHUB_SCOPE) ||
          (p.has('site_id') && p.get('site_id') !== new URL(env.CMS_ORIGIN).hostname)) return plain('Invalid authentication request.', 400);
      const id = random(), binding = random(), verifier = random(), expires = Date.now() + ttl;
      const payload = `${id}.${expires}`;
      const state = `${payload}.${await sign(payload, env.OAUTH_STATE_SECRET)}`;
      const stored = await env.OAUTH_SESSIONS.get(env.OAUTH_SESSIONS.idFromName(id)).fetch('https://session/create', {
        method: 'POST', body: JSON.stringify({ binding: await digest(binding), verifier, expires }),
      });
      if (!stored.ok) throw new Error('Storage unavailable');
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: env.OAUTH_CALLBACK_URL,
        scope: env.GITHUB_SCOPE, state, code_challenge: await digest(verifier), code_challenge_method: 'S256' }).toString();
      const h = headers();
      h.set('Location', authorize.href); h.set('Set-Cookie', cookie(binding, ttl / 1000));
      return new Response(null, { status: 302, headers: h });
    }
    const state = url.searchParams.get('state') || '';
    const [id, timestamp, signature, extra] = state.split('.');
    const binding = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
    if (extra || !/^[\w-]{43}$/.test(id || '') || !/^\d{13}$/.test(timestamp || '') ||
        Number(timestamp) <= Date.now() || Number(timestamp) > Date.now() + ttl || !/^[\w-]{43}$/.test(binding) ||
        !await verify(`${id}.${timestamp}`, signature || '', env.OAUTH_STATE_SECRET)) return plain('Invalid or expired authentication session. Start login again.', 403);
    const session = await env.OAUTH_SESSIONS.get(env.OAUTH_SESSIONS.idFromName(id)).fetch('https://session/consume', {
      method: 'POST', body: JSON.stringify({ binding: await digest(binding) }),
    });
    if (!session.ok) return plain('Invalid or expired authentication session. Start login again.', 403);
    const { verifier } = await session.json() as { verifier: string };
    if (url.searchParams.has('error') || !url.searchParams.get('code')) {
      return oauthPopup(env.CMS_ORIGIN, { message: 'GitHub 로그인이 취소되었거나 요청이 만료되었습니다. 다시 로그인하세요.' });
    }
    try {
      const response = await upstream('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET,
          code: url.searchParams.get('code')!, redirect_uri: env.OAUTH_CALLBACK_URL, code_verifier: verifier }).toString(),
        // Workers supports manual/follow only. Reject 3xx below without forwarding secrets.
        signal: AbortSignal.timeout(10_000), redirect: 'manual',
      });
      if (!response.ok) throw new Error('Exchange failed');
      const data = await response.json() as Record<string, unknown>;
      if (data.error || typeof data.access_token !== 'string' || !data.access_token ||
          data.token_type !== 'bearer' || typeof data.scope !== 'string' ||
          !data.scope.split(/[ ,]+/).includes('public_repo') || data.scope.split(/[ ,]+/).some(scope => scope !== 'public_repo')) throw new Error('Invalid token');
      return oauthPopup(env.CMS_ORIGIN, { token: data.access_token, provider: 'github' });
    } catch {
      return oauthPopup(env.CMS_ORIGIN, { message: 'GitHub 인증에 실패했습니다. 다시 로그인하세요.' });
    }
  } catch { return plain('OAuth service unavailable. Start login again.', 503); }
}

interface Session { binding: string; verifier: string; expires: number }
/** Per-login object: transactional consumption prevents concurrent/replayed callbacks. */
export class OAuthSession {
  constructor(private readonly ctx: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return plain('Method not allowed.', 405);
    const data = await request.json() as Session;
    const path = new URL(request.url).pathname;
    return this.ctx.storage.transaction(async storage => {
      const current = await storage.get<Session>('session');
      if (path === '/create') {
        if (current) return plain('Already exists.', 409);
        await storage.put('session', data);
        await storage.setAlarm(data.expires);
        return new Response(null, { status: 201 });
      }
      if (path !== '/consume') return plain('Not found.', 404);
      if (!current || current.expires <= Date.now() || current.binding !== data.binding) return plain('Invalid session.', 403);
      await storage.delete('session');
      return Response.json({ verifier: current.verifier });
    });
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

export default { fetch: (request: Request, env: OAuthEnv) => handleOAuth(request, env) };
