import { expect, test, type BrowserContext } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

const repo = 'tester/fragment-cms-auth-test';
const path = 'src/content/fragments/legacy.md';
const source = '---\nid: delete-me\ntitle: 삭제 테스트\nsummary: 삭제할 요약\ncategory: Infra\n---\n본문\n';

async function loginRoute(context: BrowserContext) {
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
}

test('an expired login during save is recovered from the failure panel', async ({ page, context }) => {
  await loginRoute(context);
  let expired = true;
  const puts: string[] = [];
  await page.route('**/git/trees/**', route => route.fulfill({ status: 503, json: {} }));
  await context.route('https://api.github.com/**', async route => {
    const request = route.request();
    if (request.method() === 'PUT') {
      const file = new URL(request.url()).pathname.split('/contents/')[1];
      puts.push(file);
      if (expired) { expired = false; return route.fulfill({ status: 401, json: {} }); }
      return route.fulfill({ status: 201, json: { content: { path: file }, commit: { sha: 'a'.repeat(40) } } });
    }
    if (request.url().includes('/contents/')) return route.fulfill({ status: 404, json: {} });
    return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.getByLabel('용어', { exact: true }).fill('한글 카드');
  await page.getByLabel('요약', { exact: true }).fill('저장 테스트');
  await page.getByLabel('카테고리', { exact: true }).selectOption('DevOps');
  await page.locator('#composer-login').click();
  await page.locator('#composer-save').click();

  const panel = page.locator('#composer-error');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('만료');
  await expect(panel).toContainText('다시 저장');
  const relogin = page.locator('#composer-error-login');
  await expect(relogin).toBeVisible();
  await expect(relogin).toBeInViewport();
  await expect(page.getByLabel('요약', { exact: true })).toHaveValue('저장 테스트');
  expect(puts).toHaveLength(1);

  await relogin.click();
  await expect(panel).toContainText('다시 로그인했습니다');
  await expect(relogin).toBeHidden();
  const save = page.locator('#composer-save');
  await expect(save).toBeFocused();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await expect(page.locator('#composer-success')).toContainText('저장했습니다');
  expect(puts).toHaveLength(2);
  expect(puts[0]).toBe(puts[1]);
});

test('an expired login during delete keeps the card and finishes after re-login', async ({ page, context }) => {
  await loginRoute(context);
  let expired = true;
  let deleted = false;
  const writes: string[] = [];
  await context.route('https://api.github.com/**', async route => {
    const request = route.request(); const url = request.url();
    if (request.method() !== 'GET') {
      if (expired) { expired = false; return route.fulfill({ status: 401, json: {} }); }
      writes.push(request.method());
      if (url.endsWith('/git/trees')) return route.fulfill({ status: 201, json: { sha: 'd'.repeat(40) } });
      if (url.endsWith('/git/commits')) return route.fulfill({ status: 201, json: { sha: 'e'.repeat(40) } });
      deleted = true;
      return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { sha: 'e'.repeat(40) } } });
    }
    if (url.includes('/git/ref/')) return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { type: 'commit', sha: 'b'.repeat(40) } } });
    if (url.includes('/git/commits/')) return route.fulfill({ json: { sha: 'b'.repeat(40), tree: { sha: 'c'.repeat(40) } } });
    if (url.includes('/git/trees/')) return route.fulfill({ json: { truncated: false,
      tree: deleted ? [] : [{ path, type: 'blob', sha: 'a'.repeat(40) }] } });
    if (url.includes('/git/blobs/')) return route.fulfill({ json: { sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from(source).toString('base64') } });
    if (url.includes('/contents/')) return route.fulfill({ json: { path, type: 'file', sha: 'a'.repeat(40), encoding: 'base64', content: Buffer.from(source).toString('base64') } });
    return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/?card=delete-me');
  await page.locator('#fragment-edit').click();
  await page.locator('#composer-login').click();
  await page.getByLabel('요약', { exact: true }).fill('보존할 초안');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#composer-delete').click();

  const panel = page.locator('#composer-error');
  await expect(panel).toContainText('만료');
  await expect(panel).toContainText('카드 삭제');
  await expect(page.getByLabel('요약', { exact: true })).toHaveValue('보존할 초안');
  await expect(page.locator('[data-fragment-card="delete-me"]')).toHaveCount(1);
  expect(writes).toHaveLength(0);

  await page.locator('#composer-error-login').click();
  await expect(panel).toContainText('다시 로그인했습니다');
  const remove = page.locator('#composer-delete');
  await expect(remove).toBeFocused();
  await expect(page.getByLabel('요약', { exact: true })).toHaveValue('보존할 초안');
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.locator('#composer-success')).toContainText('삭제했습니다');
  await expect(page.locator('[data-fragment-card="delete-me"]')).toHaveCount(0);
  expect(writes).toEqual(['POST', 'POST', 'PATCH']);
});
