import { expect, test } from '@playwright/test';
import { oauthPopup } from '../../workers/fragment-oauth/worker';

const repo = 'tester/fragment-cms-auth-test';
const sha = 'a'.repeat(40);
const initial = { id: 'live-card', title: '원격 카드', summary: '최신 요약', category: 'DevOps', aliases: ['찾기 별칭'], tags: ['동기화'], relations: [] };
const body = '**최신 본문**\n<script>window.injected=true</script><img src=x onerror="window.injected=true"><a href="javascript:alert(1)">위험 링크</a>';
function markdown(card = initial) { return `---\n${Object.entries(card).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${body}\n`; }

test('fresh remote cards update search, categories, details and graph, including direct URLs after reload', async ({ page, context }) => {
  let content = markdown();
  let currentSha = sha;
  let path = 'src/content/fragments/legacy.md';
  let puts = 0;
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', async route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/git/trees/')) return route.fulfill({ json: { truncated: false, tree: [{ path, type: 'blob', sha: currentSha }] } });
    if (url.includes('/git/blobs/')) return route.fulfill({ json: { sha: currentSha, encoding: 'base64', content: Buffer.from(content).toString('base64') } });
    if (url.includes('/contents/')) {
      expect(new URL(url).pathname).toBe(`/repos/${repo}/contents/${path}`);
      if (request.method() === 'PUT') {
        puts++;
        const payload = request.postDataJSON();
        expect(payload.sha).toBe(currentSha);
        content = Buffer.from(payload.content, 'base64').toString('utf8'); currentSha = 'b'.repeat(40);
        return route.fulfill({ json: { content: { path }, commit: { sha: currentSha } } });
      }
      return route.fulfill({ json: { type: 'file', path, sha: currentSha, encoding: 'base64', content: Buffer.from(content).toString('base64') } });
    }
    return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  await page.goto('/fragments/?q=찾기%20별칭&category=DevOps&card=live-card');
  await expect(page.locator('#fragment-dialog-title')).toHaveText('원격 카드');
  await expect(page.locator('#fragment-dialog-body strong')).toHaveText('최신 본문');
  await expect(page.locator('#fragment-dialog-body script,#fragment-dialog-body img')).toHaveCount(0);
  await expect(page.locator('#fragment-dialog-body a')).not.toHaveAttribute('href', /javascript:/);
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  await page.locator('#fragment-edit').click();
  await page.locator('#composer-login').click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('원격 카드');
  await page.getByLabel('용어', { exact: true }).fill('수정 즉시 반영');
  await page.getByLabel('요약', { exact: true }).fill('새 요약');
  await page.getByLabel('카테고리', { exact: true }).selectOption('Backend');
  await page.locator('#composer-save').click();
  await expect(page.locator('#fragment-composer')).not.toBeVisible();
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await expect(page.locator('[data-fragment-card="live-card"]')).toContainText('수정 즉시 반영');
  await expect(page.locator('#fragment-category option')).toHaveText(['전체 (1)', 'Backend (1)']);
  await page.locator('[data-fragment-card="live-card"]').click();
  await expect(page.locator('#fragment-dialog-title')).toHaveText('수정 즉시 반영');
  await expect(page.locator('#fragment-dialog-summary')).toHaveText('새 요약');
  await page.locator('#fragment-close').click();
  await page.locator('#fragment-search').fill('새 요약');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await page.locator('#graph-view').click();
  await expect(page.locator('#graph-accessible')).toContainText('수정 즉시 반영');
  await page.reload();
  await expect(page.locator('#graph-accessible')).toContainText('수정 즉시 반영');
  const another = await context.newPage();
  await another.goto('/fragments/?card=live-card');
  await expect(another.locator('#fragment-dialog-title')).toHaveText('수정 즉시 반영');
  expect(puts).toBe(1);
});

test('failed or partial reads retain previous cards; retry accepts an empty collection', async ({ page, context }) => {
  let mode = 'failed';
  await context.route('https://api.github.com/**', route => mode === 'failed'
    ? route.fulfill({ status: 403, json: {} })
    : route.fulfill({ json: { truncated: mode === 'partial', tree: [] } }));
  await page.goto('/fragments/');
  await expect(page.locator('#fragment-sync-status')).toContainText('이전 내용일 수 있습니다');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(3);
  mode = 'partial';
  await page.locator('#fragment-sync-retry').click();
  await expect(page.locator('#fragment-sync-retry')).toBeVisible();
  await expect(page.locator('[data-fragment-card]')).toHaveCount(3);
  mode = 'empty';
  await page.locator('#fragment-sync-retry').click();
  await expect(page.locator('#fragment-sync-status')).toHaveText('최신 카드를 불러왔습니다.');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(0);
  await expect(page.locator('#fragment-empty')).toBeVisible();
});

test('new saves appear once, remain after a stale in-flight read, and reload from GitHub', async ({ page, context }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let savedContent = '';
  let savedPath = '';
  let puts = 0;
  await context.route('https://oauth.example/**', async route => {
    const response = oauthPopup('http://127.0.0.1:4401', { token: 'writer_test_token', provider: 'github' });
    await route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await context.route('https://api.github.com/**', async route => {
    const request = route.request();
    const url = request.url();
    if (url.includes('/git/trees/')) {
      if (!savedContent) {
        await held;
        return route.fulfill({ json: { truncated: false, tree: [] } });
      }
      return route.fulfill({ json: { truncated: false, tree: [{ path: savedPath, type: 'blob', sha }] } });
    }
    if (url.includes('/git/blobs/')) return route.fulfill({ json: { sha, encoding: 'base64', content: savedContent } });
    if (url.includes('/contents/')) {
      if (request.method() === 'PUT') {
        puts++;
        savedPath = new URL(url).pathname.split('/contents/')[1];
        savedContent = request.postDataJSON().content;
        return route.fulfill({ status: 201, json: { content: { path: savedPath }, commit: { sha } } });
      }
      return route.fulfill({ status: 404, json: {} });
    }
    return route.fulfill({ json: { full_name: repo, private: false, permissions: { push: true } } });
  });
  const earlierRead = page.waitForResponse(response => response.url().includes('/git/trees/'));
  await page.goto('/fragments/');
  try {
    await page.locator('#fragment-compose').click();
    await page.getByLabel('용어', { exact: true }).fill('방금 만든 카드');
    await page.getByLabel('요약', { exact: true }).fill('목록에도 바로 표시');
    await page.getByLabel('카테고리', { exact: true }).selectOption('DevOps');
    await page.locator('#composer-login').click();
    await page.locator('#composer-save').click();
    await expect(page.locator('[data-fragment-card]', { hasText: '방금 만든 카드' })).toHaveCount(1);
  } finally { release(); }
  // The earlier empty response must not replace the saved card.
  await earlierRead;
  await expect(page.locator('[data-fragment-card]', { hasText: '방금 만든 카드' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#fragment-sync-status')).toHaveText('최신 카드를 불러왔습니다.');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await page.locator('[data-fragment-card]').click();
  await expect(page.locator('#fragment-dialog-title')).toHaveText('방금 만든 카드');
  expect(puts).toBe(1);
});
