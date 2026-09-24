import { expect, test } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

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
