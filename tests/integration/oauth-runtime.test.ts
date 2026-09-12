import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import { afterAll, describe, expect, it } from 'vitest';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

const script = ts.transpileModule(readFileSync('workers/fragment-oauth/worker.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const exchanges: string[] = [];
const mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-08-06',
  // All outgoing requests terminate here; no live GitHub connection is possible.
  outboundService: async request => {
    if (request.url !== 'https://github.com/login/oauth/access_token' || request.method !== 'POST') {
      return new Response('Unexpected outbound request', { status: 502 });
    }
    exchanges.push(await request.text());
    return Response.json({ token_type: 'bearer', scope: 'public_repo', access_token: 'runtime-test-token' });
  },
  durableObjects: { OAUTH_SESSIONS: { className: 'OAuthSession', useSQLite: true } },
  bindings: { GITHUB_CLIENT_ID: 'runtime-client', GITHUB_CLIENT_SECRET: 'runtime-private-secret',
    OAUTH_STATE_SECRET: 'runtime-state-key-at-least-32-bytes', CMS_ORIGIN: 'https://cms.example',
    OAUTH_CALLBACK_URL: 'https://oauth.example/callback', GITHUB_SCOPE: 'public_repo' },
});
afterAll(async () => { await mf.dispose(); });
describe('OAuth in local Workers runtime', () => {
  it('exchanges a code through the runtime with outbound network mocked', async () => {
    const start = await mf.dispatchFetch('https://oauth.example/auth?provider=github', { redirect: 'manual' });
    const location = new URL(start.headers.get('location')!);
    const state = location.searchParams.get('state');
    const response = await mf.dispatchFetch(`https://oauth.example/callback?state=${state}&code=runtime-code`, {
      headers: { cookie: start.headers.get('set-cookie')!.split(';')[0] },
    });
    expect(await response.text()).toContain('runtime-test-token');
    expect(exchanges).toHaveLength(1);
    const params = new URLSearchParams(exchanges[0]);
    expect(params.get('client_secret')).toBe('runtime-private-secret');
    expect(params.get('redirect_uri')).toBe('https://oauth.example/callback');
    expect(params.get('code_verifier')).toMatch(/^[\w-]{43}$/);
  });
  it('runs the Worker and consumes concurrent callback state once', async () => {
    const start = await mf.dispatchFetch('https://oauth.example/auth?provider=github&scope=public_repo', { redirect: 'manual' });
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    const headers = { cookie: start.headers.get('set-cookie')!.split(';')[0] };
    const responses = await Promise.all([1, 2].map(() => mf.dispatchFetch(`https://oauth.example/callback?state=${state}&error=access_denied`, { headers })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 403]);
    const html = await responses.find(r => r.status === 200)!.text();
    expect(html).toContain('authorization:github:error:');
    expect(html).not.toContain('runtime-private-secret');
  }, 30_000);
  it('rejects expired storage records and preserves valid records after wrong binding', async () => {
    // Miniflare's recursive RPC type mapper loses the namespace get() overload.
    // The runtime bridge exposes the standard namespace/stub fetch API verified here.
    const ns = await mf.getDurableObjectNamespace('OAUTH_SESSIONS') as unknown as DurableObjectNamespace;
    const stub = ns.get(ns.idFromName('storage-test'));
    const call = (path: string, body: unknown) => stub.fetch(`https://session/${path}`, { method: 'POST', body: JSON.stringify(body) });
    await call('create', { binding: 'valid', verifier: 'verifier', expires: Date.now() + 60_000 });
    expect((await call('consume', { binding: 'invalid' })).status).toBe(403);
    expect(await (await call('consume', { binding: 'valid' })).json()).toEqual({ verifier: 'verifier' });
    expect((await call('consume', { binding: 'valid' })).status).toBe(403);
    await call('create', { binding: 'valid', verifier: 'expired', expires: Date.now() - 1 });
    expect((await call('consume', { binding: 'valid' })).status).toBe(403);
  });
});
