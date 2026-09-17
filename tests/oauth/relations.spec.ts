import { expect, test, type BrowserContext } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';
import { markdownForDraft, parseFragmentSource } from '../../src/lib/fragment-writer';

async function mock(context: BrowserContext, mode = '') {
  const paths = { a: 'src/content/fragments/legacy-a.md', b: 'src/content/fragments/legacy-b.md' };
  const files = new Map(Object.entries(paths).map(([id, path]) => [path, {
    sha: id.repeat(40), source: `---\nid: ${id}\ntitle: 카드 ${id.toUpperCase()}\nsummary: 설명\ncategory: Infra\naliases: [${id === 'b' ? '대상 별칭' : '출발'}]\n---\n본문\n`,
  }]));
  const writes: any[] = []; let entry: any; let version = 1; let failures = mode === 'lost' ? 1 : 0;
  let snapshotFailure = ''; let mutation = false;
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== 'GET') {
      const body = request.postDataJSON(); writes.push(body);
      if (url.pathname.endsWith('/git/trees')) { entry = body.tree[0]; return route.fulfill({ json: { sha: 'd'.repeat(40) } }); }
      if (url.pathname.endsWith('/git/commits')) return route.fulfill({ json: { sha: 'e'.repeat(40) } });
      if (mode === 'race') return route.fulfill({ status: 422, json: {} });
      if (entry.sha === null) files.delete(entry.path);
      else files.set(entry.path, { source: entry.content, sha: (++version).toString(16).padStart(40, '0') });
      if (failures-- > 0) return route.abort('failed');
      return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { sha: 'e'.repeat(40) } } });
    }
    if (url.pathname.includes('/git/ref/')) { mutation = true; return route.fulfill({ json: { ref: 'refs/heads/cms-test', object: { type: 'commit', sha: 'c'.repeat(40) } } }); }
    if (mutation && /\/git\/(trees|blobs)\//.test(url.pathname)) {
      if (snapshotFailure === 'server') return route.fulfill({ status: 500, json: {} });
      if (snapshotFailure === 'limit' || (mode === 'anonymous-limit' && url.pathname.endsWith(`/git/trees/${'c'.repeat(40)}`) && !request.headers().authorization)) {
        return route.fulfill({ status: 403, headers: { 'X-RateLimit-Remaining': '0', 'Access-Control-Expose-Headers': 'X-RateLimit-Remaining' }, json: {} });
      }
    }
    if (url.pathname.includes('/git/commits/')) return route.fulfill({ json: { sha: 'c'.repeat(40), tree: { sha: 'd'.repeat(40) } } });
    if (url.pathname.includes('/git/trees/')) return route.fulfill({ json: { truncated: false, tree: [...files].map(([path, file]) => ({ path, type: 'blob', sha: file.sha })) } });
    if (url.pathname.includes('/git/blobs/')) {
      const sha = url.pathname.split('/').at(-1)!;
      const file = [...files.values()].find(file => file.sha === sha)!;
      return route.fulfill({ json: { sha, encoding: 'base64', content: Buffer.from(file.source).toString('base64') } });
    }
    if (url.pathname.includes('/contents/')) {
      const path = url.pathname.split('/contents/')[1]; const file = files.get(path)!;
      return route.fulfill({ json: { path, type: 'file', sha: file.sha, encoding: 'base64', content: Buffer.from(file.source).toString('base64') } });
    }
    return route.fulfill({ json: { full_name: 'tester/fragment-cms-auth-test', private: false, permissions: { push: true } } });
  });
  return { files, writes, paths, removeTarget: () => files.delete(paths.b), failSnapshot: (failure: string) => { snapshotFailure = failure; } };
}

test('add relation, reopen it, block target deletion, remove relation, then delete target entirely through the UI', async ({ page, context }) => {
  const remote = await mock(context, 'anonymous-limit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/?card=a');
  await page.locator('#fragment-edit').click(); await page.locator('#composer-login').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('카드 A');
  await expect(page.locator('#composer-relation-target option[value="a"]')).toHaveCount(0);
  await page.getByLabel('관계 카드 검색').fill('대상 별칭');
  await page.getByLabel('관계 대상').selectOption('b');
  await page.getByLabel('관계 유형').selectOption('prerequisite');
  await page.getByRole('button', { name: '관계 추가', exact: true }).click();
  await expect(page.getByRole('button', { name: '관계 추가', exact: true })).toBeDisabled();
  await expect(page.locator('#composer-relation-target option[value="b"]')).toHaveJSProperty('disabled', true);
  await page.getByLabel('관계 유형').selectOption('related');
  await expect(page.getByRole('button', { name: '관계 추가', exact: true })).toBeDisabled();
  await expect(page.locator('#composer-relation-list li')).toHaveCount(1);
  await page.keyboard.press('Escape'); await page.locator('#fragment-edit').click();
  await expect(page.locator('#composer-relation-list')).toContainText('선행 개념 · 카드 B');
  await page.locator('#composer-save').click();
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  expect(parseFragmentSource(remote.files.get(remote.paths.a)!.source).relations).toEqual([{ target: 'b', type: 'prerequisite' }]);
  const another = await context.newPage(); await another.goto('/fragments/?card=a');
  await expect(another.locator('#fragment-dialog-relations')).toContainText('선행 개념 · 카드 B');
  await another.locator('#fragment-edit').click(); await another.locator('#composer-login').click();
  await expect(another.locator('#composer-relation-list')).toContainText('선행 개념 · 카드 B');
  await another.close();
  await page.locator('[data-fragment-card="b"]').click(); await page.locator('#fragment-edit').click();
  await expect(page.locator('#composer-delete')).toBeVisible();
  await expect(page.locator('#composer-relation-target option[value="a"]')).toHaveJSProperty('disabled', true);
  page.once('dialog', dialog => dialog.accept()); await page.locator('#composer-delete').click();
  await expect(page.locator('#composer-status')).toContainText('카드 A');
  await expect(page.locator('#composer-error')).toBeFocused();
  await expect(page.locator('#composer-error')).toBeInViewport();
  await expect(page.locator('#composer-error')).toContainText('관계 제거 → 수정 저장');
  expect(remote.files.has(remote.paths.b)).toBe(true);
  await page.keyboard.press('Escape'); await page.locator('#fragment-close').click();
  await page.locator('[data-fragment-card="a"]').click(); await page.locator('#fragment-edit').click();
  await page.getByRole('button', { name: '관계 제거: 카드 B (선행 개념)', exact: true }).click();
  await page.locator('#composer-save').click(); await expect(page.locator('#fragment-composer')).not.toBeVisible();
  expect(parseFragmentSource(remote.files.get(remote.paths.a)!.source).relations).toEqual([]);
  await page.locator('[data-fragment-card="b"]').click(); await page.locator('#fragment-edit').click();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#composer-delete').click();
  await expect(page.locator('#composer-success')).toContainText('삭제했습니다');
  expect(remote.files.has(remote.paths.b)).toBe(false);
  await expect(page.locator('[data-fragment-card="b"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

for (const failure of ['limit', 'server']) {
  test(`snapshot ${failure} shows an actionable error and permits editing and retry`, async ({ page, context }) => {
    const remote = await mock(context);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/fragments/?card=a');
    await page.locator('#fragment-edit').click(); await page.locator('#composer-login').click();
    await expect(page.getByLabel('용어', { exact: true })).toHaveValue('카드 A');
    await page.getByLabel('관계 대상').selectOption('b');
    await page.getByRole('button', { name: '관계 추가', exact: true }).click();
    remote.failSnapshot(failure);
    await page.locator('#composer-save').click();
    await expect(page.locator('#composer-error')).toContainText(failure === 'limit' ? '요청 한도' : '요청을 보내지 않았습니다');
    await expect(page.locator('#composer-error')).toBeFocused();
    await expect(page.locator('#composer-error')).toBeInViewport();
    await expect(page.getByLabel('용어', { exact: true })).toBeEditable();
    await expect(page.locator('#composer-relation-list')).toContainText('카드 B');
    expect(remote.writes).toHaveLength(0);
    remote.failSnapshot('');
    await page.locator('#composer-save').click();
    await expect(page.locator('#fragment-composer')).not.toBeVisible();
    expect(remote.writes).toHaveLength(3);
  });
}

for (const mode of ['missing', 'race', 'lost']) {
  test(`relation save ${mode} preserves input and supports safe retry`, async ({ page, context }) => {
    const remote = await mock(context, mode);
    await page.goto('/fragments/?card=a');
    await page.locator('#fragment-edit').click(); await page.locator('#composer-login').click();
    await expect(page.getByLabel('용어', { exact: true })).toHaveValue('카드 A');
    await page.getByLabel('관계 대상').selectOption('b');
    await page.getByRole('button', { name: '관계 추가', exact: true }).click();
    if (mode === 'missing') remote.removeTarget();
    await page.locator('#composer-save').click();
    await expect(page.locator('#composer-status')).toContainText(mode === 'missing' ? '관계 대상' : mode === 'race' ? '다른 곳에서' : '응답');
    await expect(page.locator('#composer-relation-list')).toContainText('카드 B');
    await expect(page.getByLabel('용어', { exact: true })).toHaveValue('카드 A');
    if (mode === 'lost') {
      await page.locator('#composer-save').click();
      await expect(page.locator('#fragment-composer')).not.toBeVisible();
      expect(remote.writes).toHaveLength(3);
    } else expect(remote.writes).toHaveLength(mode === 'missing' ? 0 : 3);
  });
}

test('new-card relations remain separate from an existing-card draft and are stored with the new ID', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/'); await expect(page.locator('#fragment-sync-status')).toContainText('최신 카드');
  await page.locator('#fragment-compose').click(); await page.locator('#composer-login').click();
  await expect(page.locator('#composer-save')).toBeEnabled();
  await page.getByLabel('용어', { exact: true }).fill('새 관계 카드');
  await page.getByLabel('요약', { exact: true }).fill('설명');
  await page.getByLabel('카테고리', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('관계 대상').selectOption('b');
  await page.getByLabel('관계 유형').selectOption('contrasts');
  await page.getByRole('button', { name: '관계 추가', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('[data-fragment-card="a"]').click(); await page.locator('#fragment-edit').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('카드 A');
  await expect(page.locator('#composer-relation-list li')).toHaveCount(0);
  await page.keyboard.press('Escape'); await page.locator('#fragment-close').click();
  await page.locator('#fragment-compose').click();
  await expect(page.locator('#composer-relation-list')).toContainText('비교 개념 · 카드 B');
  await page.locator('#composer-save').click(); await expect(page.locator('#fragment-composer')).not.toBeVisible();
  const created = [...remote.files.values()].map(file => parseFragmentSource(file.source)).find(card => card.title === '새 관계 카드')!;
  expect(created.relations).toEqual([{ target: 'b', type: 'contrasts' }]);
  expect(markdownForDraft(created)).toContain(created.id);
  await page.locator('#fragment-compose').click();
  await expect(page.locator('#composer-relation-list li')).toHaveCount(0);
});
