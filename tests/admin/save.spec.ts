import { expect, test, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function publish(page: Page) {
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Publish now', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
}

async function waitForCollection(page: Page, title: string) {
  // File persistence and Astro's asynchronous content watcher finish separately.
  await expect.poll(async () => {
    const response = await page.request.get('/fragments/');
    return response.ok() && (await response.text()).includes(title);
  }, { timeout: 10000 }).toBe(true);
}

test('A03-3: create, edit, reopen and collect the same Markdown card', async ({ page, browser }) => {
  const { content } = JSON.parse(await readFile('.fragment-test/admin-run.json', 'utf8'));
  expect(path.relative(path.resolve('.fragment-test/cms-runs'), content)).not.toMatch(/^\.\./);
  expect(content).not.toBe(path.resolve('.fragment-test/cms/src/content/fragments'));
  const original = await Promise.all((await readdir('src/content/fragments')).sort().map(async name => [name, await readFile(`src/content/fragments/${name}`, 'utf8')]));
  const before = await readdir(content);
  await page.goto('/admin/');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByRole('link', { name: 'Create entry of type Fragments' }).click();
  await page.getByLabel('용어', { exact: true }).fill('저장 계약 테스트');
  await page.getByLabel('요약', { exact: true }).fill('첫 요약');
  await page.getByLabel('카테고리', { exact: true }).fill('Test');
  await page.getByLabel('별칭 (optional)', { exact: true }).fill('Save Alias');
  await page.getByLabel('태그 (optional)', { exact: true }).fill('저장검증');
  await page.getByRole('switch').click();
  await page.locator('[contenteditable="true"][role="textbox"]').fill('**첫 본문**: 한글과 "따옴표"');
  await publish(page);
  await expect.poll(async () => (await readdir(content)).filter(name => !before.includes(name))).toHaveLength(1);
  const filename = (await readdir(content)).find(name => !before.includes(name))!;
  const savedPath = path.join(content, filename);
  const first = await readFile(savedPath, 'utf8');
  const id = first.match(/^id: (.+)$/m)?.[1];
  expect(id).toMatch(/^fragment-[a-f0-9-]+$/);
  expect(filename).toBe(`${id}.md`);
  expect(first).toContain('첫 요약');
  expect(first).toContain('첫 본문');
  expect(first).toContain('**첫 본문');
  await page.getByLabel('용어', { exact: true }).fill('수정된 저장 계약');
  await page.getByLabel('요약', { exact: true }).fill('수정 후 요약');
  await page.getByLabel('별칭 (optional)', { exact: true }).fill('');
  await page.getByLabel('태그 (optional)', { exact: true }).fill('');
  await page.locator('[contenteditable="true"][role="textbox"]').fill('수정된 본문: 한글과 "따옴표"');
  await publish(page);
  await expect.poll(() => readFile(savedPath, 'utf8')).toContain('수정 후 요약');
  expect((await readdir(content)).sort()).toEqual([...before, filename].sort());
  expect((await readFile(savedPath, 'utf8')).match(/^id: (.+)$/m)?.[1]).toBe(id);
  await waitForCollection(page, '수정된 저장 계약');
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto(`http://127.0.0.1:4400/admin/#/collections/fragments/entries/${id}`);
    await other.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(other.getByLabel('용어', { exact: true })).toHaveValue('수정된 저장 계약');
    await expect(other.getByLabel('요약', { exact: true })).toHaveValue('수정 후 요약');
    await expect(other.getByLabel('별칭 (optional)', { exact: true })).toHaveValue('');
    await expect(other.getByLabel('태그 (optional)', { exact: true })).toHaveValue('');
    await expect(other.locator('[contenteditable="true"][role="textbox"]')).toContainText('수정된 본문');
    const publicPage = await context.newPage();
    await publicPage.goto(`http://127.0.0.1:4400/fragments/?card=${id}`);
    await expect(publicPage.getByRole('dialog')).toBeVisible();
    await expect(publicPage.getByRole('dialog')).toContainText('수정된 저장 계약');
    await expect(publicPage.getByRole('dialog')).toContainText('수정 후 요약');
    await expect(publicPage.getByRole('dialog')).toContainText('수정된 본문: 한글과 "따옴표"');
  } finally { await context.close(); }
  expect(await Promise.all((await readdir('src/content/fragments')).sort().map(async name => [name, await readFile(`src/content/fragments/${name}`, 'utf8')]))).toEqual(original);
});

test('A03-3: editing legacy content preserves its distinct filename, ID and relationships', async ({ page }) => {
  const { content } = JSON.parse(await readFile('.fragment-test/admin-run.json', 'utf8'));
  const before = (await readdir(content)).sort();
  const file = path.join(content, 'legacy-card.md');
  await page.goto('/admin/#/collections/fragments/entries/legacy-card');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('기존 카드 저장 검증');
  await page.getByLabel('용어', { exact: true }).fill('기존 카드 제목 수정');
  await publish(page);
  await expect.poll(() => readFile(file, 'utf8')).toContain('기존 카드 제목 수정');
  const raw = await readFile(file, 'utf8');
  expect(raw).toContain('id: stable-existing-id');
  expect(raw).toContain('target: cms-connection');
  expect(raw).toContain('type: related');
  expect(raw).toContain('기존 본문을 보존합니다.');
  expect((await readdir(content)).sort()).toEqual(before);
  await page.reload();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('기존 카드 제목 수정');
  await waitForCollection(page, '기존 카드 제목 수정');
  const publicPage = await page.context().newPage();
  await publicPage.goto('/fragments/?card=stable-existing-id');
  await expect(publicPage.getByRole('dialog')).toContainText('기존 카드 제목 수정');
  await expect(publicPage.getByRole('dialog')).toContainText('CMS 격리 연결 확인');
});
