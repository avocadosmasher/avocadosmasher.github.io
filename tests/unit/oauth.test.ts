import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOAuth, type OAuthEnv } from '../../workers/fragment-oauth/worker';
import { createWriterConfig } from '../../src/lib/fragment-writer';

// Storage is tested independently in the actual Workers runtime integration suite.
const sessions = new Map<string, { binding: string; verifier: string; expires: number }>();
const env = {
  GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret-never-public',
  OAUTH_STATE_SECRET: 'test-signing-key-with-at-least-32-bytes',
  CMS_ORIGIN: 'https://cms.example', OAUTH_CALLBACK_URL: 'https://oauth.example/callback',
  GITHUB_SCOPE: 'public_repo',
  OAUTH_SESSIONS: { idFromName: (id: string) => id, get: (id: string) => ({
    fetch: async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      const data = await request.json() as any;
      if (new URL(request.url).pathname === '/create') {
        sessions.set(id, data); return new Response(null, { status: 201 });
      }
      const value = sessions.get(id);
      if (!value || value.binding !== data.binding || value.expires <= Date.now()) return new Response(null, { status: 403 });
      sessions.delete(id);
      return Response.json({ verifier: value.verifier });
    },
  }) },
} as unknown as OAuthEnv;
const exchange = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => Response.json({ access_token: 'test-access-token', token_type: 'bearer', scope: 'public_repo' }));
async function begin() {
  const result = await handleOAuth(new Request('https://oauth.example/auth?provider=github&scope=public_repo&site_id=cms.example'), env, exchange);
  const location = new URL(result.headers.get('location')!);
  const cookie = result.headers.get('set-cookie')!.split(';')[0];
  return { result, location, cookie, state: location.searchParams.get('state')! };
}
const callback = (state: string, cookie = '', extra = 'code=test-code') => new Request(`https://oauth.example/callback?state=${state}&${extra}`, { headers: { cookie } });
afterEach(() => { sessions.clear(); exchange.mockClear(); vi.useRealTimers(); });

describe('A04-1 OAuth server', () => {
  it('binds random signed state to a secure cookie and S256 challenge', async () => {
    const a = await begin(), b = await begin();
    expect(a.result.status).toBe(302);
    expect(a.state).not.toBe(b.state);
    expect(a.location.origin).toBe('https://github.com');
    expect(a.location.searchParams.get('redirect_uri')).toBe(env.OAUTH_CALLBACK_URL);
    expect(a.location.searchParams.get('scope')).toBe('public_repo');
    expect(a.location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(a.location.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(a.result.headers.get('set-cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(a.location.href).not.toContain(env.GITHUB_CLIENT_SECRET);
  });
  it('exchanges only once with the matching verifier and clears the cookie', async () => {
    const a = await begin();
    const result = await handleOAuth(callback(a.state, a.cookie), env, exchange);
    expect(result.status).toBe(200);
    const [, options] = exchange.mock.calls[0] as unknown as [string, RequestInit];
    const body = new URLSearchParams(options.body as string);
    expect(options.redirect).toBe('manual');
    expect(body.get('client_secret')).toBe(env.GITHUB_CLIENT_SECRET);
    expect(body.get('redirect_uri')).toBe(env.OAUTH_CALLBACK_URL);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.get('code_verifier')!));
    expect(Buffer.from(digest).toString('base64url')).toBe(a.location.searchParams.get('code_challenge'));
    expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(result.headers.get('cache-control')).toBe('no-store');
    const html = await result.text();
    expect(html).toContain('authorization:github:success:');
    expect(html).toContain('test-access-token');
    expect(html).not.toContain(env.GITHUB_CLIENT_SECRET);
    expect(html).not.toContain('refresh_token');
    expect((await handleOAuth(callback(a.state, a.cookie), env, exchange)).status).toBe(403);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
  it('rejects missing, tampered, expired and cross-browser state before exchange', async () => {
    const a = await begin(), b = await begin();
    for (const request of [callback(''), callback(a.state), callback(a.state, b.cookie), callback(a.state + 'x', a.cookie)]) {
      expect((await handleOAuth(request, env, exchange)).status).toBe(403);
    }
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 601_000);
    expect((await handleOAuth(callback(a.state, a.cookie), env, exchange)).status).toBe(403);
    expect(exchange).not.toHaveBeenCalled();
  });
  it('consumes cancellation and redacts upstream failures', async () => {
    const a = await begin();
    const cancelled = await handleOAuth(callback(a.state, a.cookie, 'error=access_denied'), env, exchange);
    expect(await cancelled.text()).toContain('authorization:github:error:');
    expect(exchange).not.toHaveBeenCalled();
    for (const fail of [async () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }), async () => new Response('private upstream detail', { status: 500 }), async () => { throw new Error('private upstream detail'); }, async () => Response.json({ error: 'bad_verification_code', error_description: 'private upstream detail' }), async () => Response.json({ access_token: 'private upstream detail', token_type: 'bearer', scope: 'repo' })]) {
      const b = await begin();
      const result = await handleOAuth(callback(b.state, b.cookie), env, fail);
      const html = await result.text();
      expect(html).toContain('authorization:github:error:');
      expect(html).not.toContain('private upstream detail');
      expect(html).not.toContain('test-access-token');
    }
  });
  it('fails closed on invalid configuration, origins, scope and methods', async () => {
    for (const url of ['https://oauth.example/auth?provider=gitlab', 'https://oauth.example/auth?provider=github&scope=repo', 'https://oauth.example/auth?provider=github&site_id=evil.example', 'https://evil.example/auth?provider=github']) {
      expect((await handleOAuth(new Request(url), env, exchange)).status).toBe(400);
    }
    expect((await handleOAuth(new Request('https://oauth.example/auth', { method: 'POST' }), env, exchange)).status).toBe(405);
    for (const change of [{ GITHUB_CLIENT_SECRET: '' }, { CMS_ORIGIN: 'https://cms.example/path' }, { OAUTH_STATE_SECRET: 'short' }]) {
      expect((await handleOAuth(new Request('https://oauth.example/auth'), { ...env, ...change }, exchange)).status).toBe(503);
    }
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe('test saving isolation', () => {
  const input = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };
  it('requires explicit test targets outside the blog repository', () => {
    expect(createWriterConfig(input)).toEqual({ repo: input.repo, branch: 'cms-test', origin: input.origin });
    for (const patch of [{ repo: '' }, { repo: 'avocadosmasher/avocadosmasher.github.io' }, { repo: 'AVOCADOSMASHER/AVOCADOSMASHER.GITHUB.IO' }, { branch: '' }, { branch: 'main' }, { origin: 'http://oauth.example' }, { origin: 'https://oauth.example/path' }]) {
      expect(() => createWriterConfig({ ...input, ...patch })).toThrow();
    }
  });
});
