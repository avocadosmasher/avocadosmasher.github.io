import { expect, test, type BrowserContext } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

const repo = 'tester/fragment-cms-auth-test';
const path = 'src/content/fragments/ept.md';
const original = '---\nid: ept\ntitle: 최신 EPT\nsummary: 원격 요약\ncategory: Infra\naliases: [Extended Page Tables]\ntags: [메모리]\nrelations:\n  - target: gpa\n    type: prerequisite\n---\n**원격 본문**\n';
async function mock(context: BrowserContext, mode = 'normal') {
  let source = original;
  let sha = 'a'.repeat(40);
  const writes: any[] = [];
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', async route => {
    const request = route.request();
    if (!request.url().includes('/contents/')) return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
    expect(new URL(request.url()).pathname).toBe(`/repos/${repo}/contents/${path}`);
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON(); writes.push(payload);
      expect(payload.sha).toBe(sha);
      source = Buffer.from(payload.content, 'base64').toString('utf8'); sha = 'b'.repeat(40);
      if (mode === 'lost') return route.abort('failed');
      return route.fulfill({ json: { content: { path }, commit: { sha } } });
    }
    expect(new URL(request.url()).searchParams.get('ref')).toBe('cms-test');
    await route.fulfill({ json: { type: 'file', path, sha, encoding: 'base64', content: Buffer.from(source).toString('base64') } });
  });
  return { writes, source: () => source, conflict: () => { sha = 'c'.repeat(40); } };
}
test('edit loads remote content, preserves file/ID/relations and reopens the saved version in another session', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/?card=ept');
  await page.getByRole('button', { name: '로그인하고 수정' }).click();
  const editor = page.getByRole('dialog', { name: '카드 수정', exact: true });
  await expect(editor.getByRole('button', { name: '수정 저장' })).toBeDisabled();
  await editor.getByRole('button', { name: 'GitHub 로그인' }).click();
  await expect(editor.getByLabel('용어', { exact: true })).toHaveValue('최신 EPT');
  await expect(editor.getByLabel('카테고리', { exact: true })).toHaveValue('Infra');
  await expect(editor.getByLabel('보충 설명')).toHaveValue('**원격 본문**\n');
  await editor.getByLabel('용어', { exact: true }).fill('수정한 EPT');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-edit')).toBeFocused();
  await page.locator('#fragment-edit').click();
  await expect(editor.getByLabel('용어', { exact: true })).toHaveValue('수정한 EPT');
  await editor.getByRole('button', { name: '수정 저장' }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.locator('#composer-success')).toContainText('수정한 EPT');
  expect(remote.writes).toHaveLength(1);
  expect(remote.source()).toContain('id: "ept"');
  expect(remote.source()).toContain('relations: [{"target":"gpa","type":"prerequisite"}]');
  expect(remote.source()).toContain('category: "Infra"');
  const another = await context.newPage();
  await another.goto('/fragments/?card=ept');
  await another.locator('#fragment-edit').click();
  await another.locator('#composer-login').click();
  await expect(another.getByLabel('용어', { exact: true })).toHaveValue('수정한 EPT');
  expect(remote.writes).toHaveLength(1);
});
test('a lost update response retries without a second write', async ({ page, context }) => {
  const remote = await mock(context, 'lost');
  await page.goto('/fragments/?card=ept');
  await page.locator('#fragment-edit').click();
  await page.locator('#composer-login').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('최신 EPT');
  await page.getByLabel('요약', { exact: true }).fill('응답 유실 수정');
  await page.locator('#composer-save').click();
  await expect(page.locator('#composer-status')).toContainText('응답');
  await page.getByRole('button', { name: '같은 내용으로 다시 저장' }).click();
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  expect(remote.writes).toHaveLength(1);
});
test('concurrent edits keep input and do not overwrite; new-card draft stays separate', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.getByLabel('용어', { exact: true }).fill('새 카드 초안');
  await page.keyboard.press('Escape');
  await page.locator('[data-fragment-card="ept"]').click();
  await page.locator('#fragment-edit').click();
  await page.locator('#composer-login').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('최신 EPT');
  await page.getByLabel('용어', { exact: true }).fill('보존할 수정');
  remote.conflict();
  await page.locator('#composer-save').click();
  await expect(page.locator('#composer-status')).toContainText('다른 곳에서');
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('보존할 수정');
  expect(remote.writes).toHaveLength(0);
  await page.keyboard.press('Escape');
  await page.locator('#fragment-close').click();
  await page.locator('#fragment-compose').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('새 카드 초안');
  await page.keyboard.press('Escape');
  await page.locator('[data-fragment-card="ept"]').click();
  await page.locator('#fragment-edit').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('보존할 수정');
});
