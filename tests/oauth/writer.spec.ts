import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

const repo = 'tester/fragment-cms-auth-test';
async function loginRoute(context: BrowserContext, result = { token: 'writer_test_token', provider: 'github' as const }) {
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', result);
    await route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
}
async function openForm(page: Page) {
  await page.goto('/fragments/');
  await page.getByRole('button', { name: '새 카드', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 카드 작성' });
  await dialog.getByLabel('용어', { exact: true }).fill('한글 카드');
  await dialog.getByLabel('요약', { exact: true }).fill('저장 테스트');
  await dialog.getByLabel('카테고리', { exact: true }).fill('테스트');
  return dialog;
}

test('native composer logs in, validates, saves once and links the commit', async ({ page, context }) => {
  let puts = 0;
  await loginRoute(context);
  await context.route('https://api.github.com/**', async route => {
    expect(route.request().headers().authorization).toBe('Bearer writer_test_token');
    if (route.request().method() === 'PUT') {
      puts++;
      const payload = route.request().postDataJSON();
      expect(payload.branch).toBe('cms-test');
      expect(payload.sha).toBeUndefined();
      expect(Buffer.from(payload.content, 'base64').toString('utf8')).toContain('title: "한글 카드"');
      await route.fulfill({ status: 201, json: { content: { path: new URL(route.request().url()).pathname.split('/contents/')[1] }, commit: { sha: 'a'.repeat(40) } } });
    } else if (route.request().url().includes('/contents/')) await route.fulfill({ status: 404, json: {} });
    else await route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  const dialog = await openForm(page);
  await expect(dialog.getByRole('button', { name: '카드 저장', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  const save = dialog.getByRole('button', { name: '카드 저장', exact: true });
  await expect(save).toBeEnabled();
  await dialog.getByLabel('요약', { exact: true }).fill('   ');
  await save.click();
  await expect(dialog.getByRole('status')).toContainText('공백');
  expect(puts).toBe(0);
  await dialog.getByLabel('요약', { exact: true }).fill('저장 테스트');
  await save.dblclick();
  await expect(dialog.getByRole('link', { name: 'GitHub에서 저장 결과 확인' })).toHaveAttribute('href', `https://github.com/${repo}/commit/${'a'.repeat(40)}`);
  expect(puts).toBe(1);
  await expect(dialog.getByRole('button', { name: '저장 완료', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('writer_test_token');
});

test('lost PUT response preserves the draft and retry verifies the existing file', async ({ page, context }) => {
  await loginRoute(context);
  let content = '';
  let path = '';
  let puts = 0;
  await context.route('https://api.github.com/**', async route => {
    if (route.request().method() === 'PUT') {
      puts++; content = route.request().postDataJSON().content; path = new URL(route.request().url()).pathname;
      await route.abort('failed');
    } else if (route.request().url().includes('/contents/')) {
      if (content) {
        expect(new URL(route.request().url()).pathname).toBe(path);
        await route.fulfill({ json: { type: 'file', encoding: 'base64', content } });
      } else await route.fulfill({ status: 404, json: {} });
    } else await route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  await dialog.getByRole('button', { name: '카드 저장', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('응답');
  await expect(dialog.getByLabel('용어', { exact: true })).toHaveValue('한글 카드');
  await dialog.getByRole('button', { name: '같은 내용으로 다시 저장' }).click();
  await expect(dialog.getByRole('link', { name: 'GitHub에서 저장 결과 확인' })).toBeVisible();
  expect(puts).toBe(1);
});

test('read-only GitHub access does not enable save and keeps input', async ({ page, context }) => {
  await loginRoute(context);
  await context.route('https://api.github.com/**', route => route.fulfill({ json: { full_name: repo, private: false, permissions: { push: false } } }));
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('권한');
  await expect(dialog.getByRole('button', { name: '카드 저장', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('용어', { exact: true })).toHaveValue('한글 카드');
  await expect(dialog.getByRole('button', { name: 'GitHub 로그인', exact: true })).toBeEnabled();
});

test('expired token can reauthenticate and retry the same draft', async ({ page, context }) => {
  await loginRoute(context);
  const paths: string[] = [];
  await context.route('https://api.github.com/**', async route => {
    if (route.request().method() === 'PUT') {
      const path = new URL(route.request().url()).pathname.split('/contents/')[1]; paths.push(path);
      await route.fulfill(paths.length === 1 ? { status: 401, json: {} } : { status: 201,
        json: { content: { path }, commit: { sha: 'b'.repeat(40) } } });
    } else if (route.request().url().includes('/contents/')) await route.fulfill({ status: 404, json: {} });
    else await route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  await dialog.getByRole('button', { name: '카드 저장', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('만료');
  await expect(dialog.getByLabel('요약', { exact: true })).toHaveValue('저장 테스트');
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  await dialog.getByRole('button', { name: '같은 내용으로 다시 저장' }).click();
  await expect(dialog.getByRole('link', { name: 'GitHub에서 저장 결과 확인' })).toBeVisible();
  expect(paths).toHaveLength(2);
  expect(paths[0]).toBe(paths[1]);
  await dialog.getByRole('button', { name: '로그아웃', exact: true }).click();
  await dialog.getByRole('button', { name: '다른 카드 작성', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '카드 저장', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('용어', { exact: true })).toBeEmpty();
});

test('cancelling OAuth keeps the draft and permits another login', async ({ page, context }) => {
  let apiCalls = 0;
  await context.route('https://api.github.com/**', async route => { apiCalls++; await route.abort(); });
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { message: 'Cancelled' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const dialog = await openForm(page);
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('취소');
  await expect(dialog.getByLabel('용어', { exact: true })).toHaveValue('한글 카드');
  await expect(dialog.getByRole('button', { name: 'GitHub 로그인', exact: true })).toBeEnabled();
  expect(apiCalls).toBe(0);
});

test('wrong message origin/source and unsolicited success cannot authenticate', async ({ page, context }) => {
  let apiCalls = 0;
  await context.route('https://api.github.com/**', async route => { apiCalls++; await route.abort(); });
  await context.route('https://oauth.example/**', route => route.fulfill({ body: '<p>Waiting</p>' }));
  const dialog = await openForm(page);
  const opened = page.waitForEvent('popup');
  await dialog.getByRole('button', { name: 'GitHub 로그인', exact: true }).click();
  const popup = await opened;
  await popup.waitForLoadState();
  await popup.evaluate(() => window.opener.postMessage('authorization:github:success:{"provider":"github","token":"forged_token"}', 'http://127.0.0.1:4401'));
  await page.evaluate(() => {
    for (const data of ['authorizing:github', 'authorization:github:success:{"provider":"github","token":"forged_token"}']) {
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://oauth.example', source: window, data }));
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', source: window, data }));
    }
  });
  await popup.close();
  await expect(dialog.getByRole('status')).toContainText('닫혔습니다');
  await expect(dialog.getByRole('button', { name: '카드 저장', exact: true })).toBeDisabled();
  expect(apiCalls).toBe(0);
});
