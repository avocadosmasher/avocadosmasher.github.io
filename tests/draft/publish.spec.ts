import { expect, test, type BrowserContext } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

const repo = 'avocadosmasher/avocadosmasher.github.io';
const card = (id: string, title: string) =>
  `---\nid: ${id}\ntitle: ${title}\nsummary: ${title} 요약\ncategory: Infra\naliases: []\ntags: []\nrelations: []\n---\n`;
const cards = [
  { id: 'published', title: '공개된 카드', sha: 'a'.repeat(40) },
  { id: 'waiting', title: '발행 전 초안', sha: 'b'.repeat(40) },
];
const branches: Record<string, typeof cards> = { main: cards.slice(0, 1), 'fragments-draft': cards };

async function mock(context: BrowserContext) {
  const reads: string[] = [];
  const writes: string[] = [];
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4404', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', route => {
    const url = new URL(route.request().url());
    const tree = url.pathname.match(/\/git\/trees\/(.+)$/);
    if (tree) {
      const branch = decodeURIComponent(tree[1]);
      reads.push(branch);
      return route.fulfill({ json: { truncated: false, tree: (branches[branch] ?? []).map(entry => ({
        path: `src/content/fragments/${entry.id}.md`, type: 'blob', sha: entry.sha,
      })) } });
    }
    const blob = url.pathname.match(/\/git\/blobs\/(.+)$/);
    if (blob) {
      const entry = cards.find(item => item.sha === blob[1])!;
      return route.fulfill({ json: { sha: entry.sha, encoding: 'base64', content: Buffer.from(card(entry.id, entry.title)).toString('base64') } });
    }
    if (url.pathname.includes('/contents/')) {
      const request = route.request();
      // A new card first checks that no file already holds the path.
      if (request.method() !== 'PUT') return route.fulfill({ status: 404, json: {} });
      writes.push(request.postDataJSON().branch);
      return route.fulfill({ status: 201, json: { content: { path: url.pathname.split('/contents/')[1] }, commit: { sha: 'c'.repeat(40) } } });
    }
    return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  return { reads, writes };
}

test('visitors see the published branch and an author sees drafts after signing in', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await expect(page.locator('[data-fragment-card="waiting"]')).toHaveCount(0);
  expect(remote.reads).toEqual(['main']);
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('[data-fragment-card="waiting"]')).toHaveCount(1);
  await expect(page.locator('#fragment-sync-status')).toHaveText('발행 전 초안까지 불러왔습니다.');
  expect(remote.reads).toEqual(['main', 'fragments-draft']);
});

test('saves are written to the draft branch, never to the published one', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await page.getByLabel('용어', { exact: true }).fill('초안 카드');
  await page.getByLabel('요약', { exact: true }).fill('발행 전에는 공개되지 않는다');
  await page.getByLabel('카테고리', { exact: true }).selectOption({ index: 1 });
  await page.locator('#composer-save').click();
  await expect(page.locator('#composer-success')).toContainText('초안 카드');
  expect(remote.writes).toEqual(['fragments-draft']);
});
