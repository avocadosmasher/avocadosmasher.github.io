import { expect, test } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

test('pinned Decap completes the popup handshake and uses the token for GitHub', async ({ page, context }) => {
  const requests: string[] = [];
  await context.route('https://api.github.com/**', async route => {
    requests.push(route.request().headers().authorization || '');
    // Stop at API denial: this verifies token delivery, not real login or saving.
    await route.fulfill({ status: 403, json: { message: 'Test repository access denied' } });
  });
  await context.route('https://oauth.example/**', async route => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get('scope')).toBe('public_repo');
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'browser-test-token', provider: 'github' });
    await route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Login with GitHub/i }).click();
  await expect.poll(() => requests.some(value => value.includes('browser-test-token'))).toBe(true);
  await expect(page.getByRole('alert')).toContainText('not found');
});

test('cancellation returns a readable error to the pinned CMS without API calls', async ({ page, context }) => {
  let apiCalls = 0;
  await context.route('https://api.github.com/**', async route => { apiCalls++; await route.abort(); });
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { message: '테스트 로그인 취소' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto('/admin/');
  await page.getByRole('button', { name: /Login with GitHub/i }).click();
  await expect(page.getByText('테스트 로그인 취소', { exact: false })).toBeVisible();
  expect(apiCalls).toBe(0);
});

test('popup ignores wrong origin, wrong source and wrong handshake before delivering once', async ({ page, context }) => {
  await context.route('https://cms.example/**', route => route.fulfill({ body: '<button onclick="window.open(\'https://oauth.example/callback\')">Open</button>' }));
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('https://cms.example', { token: '</script><script>window.injected=true</script>', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.goto('https://cms.example/');
  await page.evaluate(() => {
    (window as any).messages = [];
    window.addEventListener('message', e => (window as any).messages.push(e.data));
  });
  const opened = page.waitForEvent('popup');
  await page.getByRole('button').click();
  const popup = await opened;
  await popup.waitForLoadState();
  await expect.poll(() => page.evaluate(() => (window as any).messages)).toEqual(['authorizing:github']);
  await popup.evaluate(() => {
    for (const event of [
      { origin: 'https://evil.example', source: window.opener, data: 'authorizing:github' },
      { origin: 'https://cms.example', source: window, data: 'authorizing:github' },
      { origin: 'https://cms.example', source: window.opener, data: 'wrong' },
    ]) window.dispatchEvent(new MessageEvent('message', event));
  });
  expect(await page.evaluate(() => (window as any).messages)).toEqual(['authorizing:github']);
  expect(await popup.evaluate(() => (window as any).injected)).toBeUndefined();
  await popup.evaluate(() => {
    for (let i = 0; i < 2; i++) window.dispatchEvent(new MessageEvent('message', { origin: 'https://cms.example', source: window.opener, data: 'authorizing:github' }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).messages.length)).toBe(2);
  const message = await page.evaluate(() => (window as any).messages[1]);
  expect(message).toContain('authorization:github:success:');
});
