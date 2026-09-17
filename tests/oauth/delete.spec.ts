import { expect, test, type BrowserContext } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

async function mock(context: BrowserContext, mode = '') {
  let deleted = false;
  let version = 'a'.repeat(40);
  const writes: string[] = [];
  const path = 'src/content/fragments/legacy.md';
  const source = '---\nid: delete-me\ntitle: 삭제 테스트\nsummary: 삭제할 요약\ncategory: Infra\n---\n본문\n';
  const reference = '---\nid: reference\ntitle: 참조 카드\nsummary: 참조 설명\ncategory: Infra\nrelations: [{target: delete-me, type: related}]\n---\n';
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', async route => {
    const request = route.request(); const url = request.url();
    if (request.method() !== 'GET') {
      writes.push(request.method());
      if (url.endsWith('/git/trees')) return route.fulfill({ status: 201, json: { sha: 'd'.repeat(40) } });
      if (url.endsWith('/git/commits')) return route.fulfill({ status: 201, json: { sha: 'e'.repeat(40) } });
      if (mode === 'race') return route.fulfill({ status: 422, json: {} });
      deleted = true;
      if (mode === 'lost') return route.abort('failed');
      return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { sha: 'e'.repeat(40) } } });
    }
    if (url.includes('/git/ref/')) return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { type: 'commit', sha: 'b'.repeat(40) } } });
    if (url.includes('/git/commits/')) return route.fulfill({ json: { sha: 'b'.repeat(40), tree: { sha: 'c'.repeat(40) } } });
    if (url.includes('/git/trees/')) return route.fulfill({ json: { truncated: false, tree: deleted ? [] : [
      { path, type: 'blob', sha: version },
      ...(mode === 'reference' ? [{ path: 'src/content/fragments/ref.md', type: 'blob', sha: '9'.repeat(40) }] : []),
    ] } });
    if (url.includes('/git/blobs/')) {
      const sha = url.split('/').at(-1)!;
      return route.fulfill({ json: { sha, encoding: 'base64', content: Buffer.from(sha[0] === '9' ? reference : source).toString('base64') } });
    }
    if (url.includes('/contents/')) return route.fulfill({ json: { path, type: 'file', sha: version, encoding: 'base64', content: Buffer.from(source).toString('base64') } });
    return route.fulfill({ json: { full_name: 'tester/fragment-cms-auth-test', private: false, permissions: { push: mode !== 'permission' } } });
  });
  return { writes, conflict: () => { version = 'f'.repeat(40); } };
}

test('author can cancel then delete, with list, search, graph and another tab reflecting deletion', async ({ page, context }) => {
  const remote = await mock(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/?card=delete-me');
  await page.locator('#fragment-edit').click();
  await expect(page.locator('#composer-delete')).toBeHidden();
  await page.locator('#composer-login').click();
  await expect(page.locator('#composer-delete')).toBeVisible();
  await page.getByLabel('요약', { exact: true }).fill('보존할 초안');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#composer-delete').click();
  expect(remote.writes).toHaveLength(0);
  await expect(page.getByLabel('요약', { exact: true })).toHaveValue('보존할 초안');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#composer-delete').click();
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await expect(page.locator('#composer-success')).toContainText('삭제했습니다');
  await expect(page.locator('#fragment-compose')).toBeFocused();
  await expect(page.locator('[data-fragment-card="delete-me"]')).toHaveCount(0);
  await page.locator('#fragment-search').fill('삭제 테스트');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(0);
  expect(remote.writes).toEqual(['POST', 'POST', 'PATCH']);
  const another = await context.newPage();
  await another.goto('/fragments/?view=graph&card=delete-me');
  await expect(another.locator('#fragment-sync-status')).toContainText('최신 카드');
  await expect(another.locator('#fragment-dialog')).not.toBeVisible();
  await expect(another.locator('#graph-focus option')).toHaveCount(1);
});

for (const mode of ['reference', 'stale', 'race', 'lost', 'permission']) {
  test(`delete handles ${mode} without losing the draft or falsely removing the card`, async ({ page, context }) => {
    const remote = await mock(context, mode);
    await page.goto('/fragments/?card=delete-me');
    await page.locator('#fragment-edit').click();
    await page.locator('#composer-login').click();
    if (mode === 'permission') {
      await expect(page.locator('#composer-status')).toContainText('권한');
      await expect(page.locator('#composer-delete')).toBeHidden();
      expect(remote.writes).toHaveLength(0); return;
    }
    await expect(page.locator('#composer-delete')).toBeVisible();
    await page.getByLabel('요약', { exact: true }).fill('실패 시 보존');
    if (mode === 'stale') remote.conflict();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#composer-delete').click();
    await expect(page.locator('#composer-status')).toContainText(mode === 'reference' ? '참조 카드' : mode === 'lost' ? '삭제 결과를 확인하지 못했습니다' : '다른 곳에서');
    await expect(page.getByLabel('요약', { exact: true })).toHaveValue('실패 시 보존');
    await expect(page.locator('[data-fragment-card="delete-me"]')).toHaveCount(1);
    if (mode === 'lost') {
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#composer-delete').click();
      await expect(page.locator('#composer-success')).toContainText('이미 삭제');
      await expect(page.locator('[data-fragment-card="delete-me"]')).toHaveCount(0);
      expect(remote.writes).toHaveLength(3);
    } else expect(remote.writes).toHaveLength(mode === 'race' ? 3 : 0);
  });
}
