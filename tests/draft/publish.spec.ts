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

async function mock(context: BrowserContext, options: { ahead?: number; merge?: number; deploy?: string[] } = {}) {
  const reads: string[] = [];
  const writes: string[] = [];
  const merges: { base: string; head: string }[] = [];
  let ahead = options.ahead ?? 1;
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
    if (url.pathname.includes('/actions/workflows/')) {
      const states = options.deploy ?? [];
      const state = states.length > 1 ? states.shift()! : states[0];
      if (!state) return route.fulfill({ json: { workflow_runs: [] } });
      const [status, conclusion] = state === 'running' ? ['in_progress', null] : ['completed', state];
      return route.fulfill({ json: { workflow_runs: [{ id: 7, status, conclusion, head_sha: 'f'.repeat(40),
        html_url: 'https://github.com/avocadosmasher/avocadosmasher.github.io/actions/runs/7', updated_at: '2026-09-21T10:00:00Z' }] } });
    }
    if (url.pathname.includes('/compare/')) {
      const [base, head] = decodeURIComponent(url.pathname.split('/compare/')[1]).split('...');
      reads.push(`compare ${base}...${head}`);
      return route.fulfill({ json: { status: ahead ? 'ahead' : 'identical', ahead_by: ahead, behind_by: 0,
        files: ahead ? [{ filename: 'src/content/fragments/waiting.md', status: 'added' }] : [] } });
    }
    if (url.pathname.endsWith('/merges')) {
      merges.push(route.request().postDataJSON());
      if (options.merge && options.merge !== 201) return route.fulfill({ status: options.merge, json: {} });
      ahead = 0;
      return route.fulfill({ status: 201, json: { sha: 'd'.repeat(40) } });
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
  return { reads, writes, merges };
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
  expect(remote.reads.filter(read => !read.startsWith('compare'))).toEqual(['main', 'fragments-draft']);
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

test('an author publishes the waiting drafts with one button and one merge', async ({ page, context }) => {
  const remote = await mock(context);
  await page.goto('/fragments/');
  await expect(page.locator('#fragment-publish')).toBeHidden();
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('#fragment-publish-status')).toContainText('발행 대기 카드 1개');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await page.locator('#fragment-publish-run').click();
  await expect(page.locator('#fragment-publish-status')).toContainText('발행했습니다');
  await expect(page.locator('#fragment-publish-run')).toBeHidden();
  await expect(page.locator('#fragment-publish-result')).toBeVisible();
  expect(remote.merges).toEqual([{ base: 'main', head: 'fragments-draft', commit_message: 'chore(fragments): publish drafts from fragments-draft' }]);
});

test('a failed publish keeps the button and explains why', async ({ page, context }) => {
  const remote = await mock(context, { merge: 409 });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('#fragment-publish-run')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await page.locator('#fragment-publish-run').click();
  await expect(page.locator('#fragment-publish-status')).toContainText('저장');
  await expect(page.locator('#fragment-publish-run')).toBeVisible();
  expect(remote.merges).toHaveLength(1);
});

test('nothing to publish is stated plainly', async ({ page, context }) => {
  await mock(context, { ahead: 0 });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('#fragment-publish-status')).toContainText('발행할 변경이 없습니다');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-publish-run')).toBeHidden();
});

test('a refresh keeps the author signed in and the drafts in view', async ({ page, context }) => {
  await mock(context);
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('[data-fragment-card="waiting"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('[data-fragment-card="waiting"]')).toHaveCount(1);
  await expect(page.locator('#fragment-publish-run')).toBeVisible();
  await page.locator('#fragment-compose').click();
  await expect(page.locator('#composer-logout')).toBeVisible();
  await expect(page.locator('#composer-login')).toBeHidden();
});

test('logging out ends the session for later visits too', async ({ page, context }) => {
  await mock(context);
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('#fragment-publish-run')).toBeVisible();
  await page.locator('#composer-logout').click();
  await expect(page.locator('#fragment-publish')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-fragment-card="waiting"]')).toHaveCount(0);
  await page.locator('#fragment-compose').click();
  await expect(page.locator('#composer-login')).toBeVisible();
});

test('the waiting list can be opened and a card taken out of it', async ({ page, context }) => {
  const remote = await mock(context);
  const discards: { method: string; branch: string }[] = [];
  await context.route('https://api.github.com/**/contents/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const ref = url.searchParams.get('ref');
    if (request.method() === 'GET') {
      // The card exists only on the draft branch, so publishing it would add it to the site.
      if (ref === 'main') return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ json: { type: 'file', path: 'src/content/fragments/waiting.md', sha: 'b'.repeat(40),
        encoding: 'base64', content: Buffer.from(card('waiting', '발행 전 초안')).toString('base64') } });
    }
    discards.push({ method: request.method(), branch: request.postDataJSON().branch });
    branches['fragments-draft'] = branches.main;
    return route.fulfill({ json: { commit: { sha: 'e'.repeat(40) } } });
  });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await expect(page.locator('#fragment-publish-status')).toContainText('발행 대기 카드 1개');
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await expect(page.locator('#fragment-publish-list')).toBeHidden();
  await page.getByRole('button', { name: '목록 보기' }).click();
  const item = page.locator('#fragment-publish-list li');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('발행 전 초안');
  await expect(item).toContainText('새 카드');
  await item.getByRole('button', { name: /제거/ }).click();
  await expect(page.locator('#fragment-publish-status')).toContainText('제거했습니다');
  expect(discards).toEqual([{ method: 'DELETE', branch: 'fragments-draft' }]);
  expect(remote.merges).toHaveLength(0);
  branches['fragments-draft'] = cards;
});

test('the deploy state is shown and followed until it finishes', async ({ page, context }) => {
  test.setTimeout(60_000);
  await mock(context, { deploy: ['running', 'success'] });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-deploy')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('#fragment-deploy-text')).toContainText('배포 중입니다');
  await expect(page.locator('#fragment-deploy-link')).toBeVisible();
  await expect(page.locator('#fragment-deploy')).toHaveAttribute('data-state', 'success', { timeout: 40000 });
  await expect(page.locator('#fragment-deploy-text')).toContainText('반영되어 있습니다');
});

test('a failed deploy says the site kept its previous content', async ({ page, context }) => {
  await mock(context, { deploy: ['failure'] });
  await page.goto('/fragments/');
  await page.locator('#fragment-compose').click();
  await page.locator('#composer-login').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#fragment-deploy-text')).toContainText('이전 내용 그대로');
});
