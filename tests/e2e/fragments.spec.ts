import { expect, test } from './fixtures';

test('C01–D05: navigate, search aliases, filter and restore URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Fragments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fragments', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '개념 검색' }).fill('extended page tables');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: '개념 검색' })).toHaveValue('extended page tables');
  await page.getByRole('searchbox', { name: '개념 검색' }).fill('없는 개념');
  await expect(page.getByText('조건에 맞는 개념이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.getByRole('searchbox', { name: '개념 검색' })).toHaveValue('');
  await expect(page.getByText('조건에 맞는 개념이 없습니다.')).toBeHidden();
  await expect(page.getByRole('button', { name: '검색어 지우기' })).toBeHidden();
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test('E01–E04: modal, related card, keyboard, direct links', async ({ page }) => {
  await page.goto('/fragments/?q=EPT');
  await page.getByRole('button', { name: 'EPT 자세히 보기', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'EPT', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /GPA/ }).click();
  await expect(dialog.getByRole('heading', { name: 'GPA', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'EPT 자세히 보기', exact: true })).toBeFocused();
  await page.goto('/fragments/?card=ept');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page).not.toHaveURL(/card=/);
});

test('F03/F04: graph loads on demand and can return to cards', async ({ page }) => {
  await page.goto('/fragments/');
  await page.getByRole('button', { name: '관계 그래프', exact: true }).click();
  await expect(page.getByRole('region', { name: '개념 관계 그래프' })).toBeVisible();
  await expect(page.locator('#fragment-graph canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '카드 보기', exact: true }).click();
  await expect(page.locator('[data-fragment-card]').first()).toBeVisible();
});

test('H01: mobile dark mode and modal fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/?card=ept');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '테마 전환' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('A01/H03: existing routes and published posts still respond', async ({ request }) => {
  for (const path of ['/', '/blog/', '/tags/', '/about/']) expect((await request.get(path)).status()).toBe(200);
  const posts = await (await request.get('/search.json')).json();
  expect(posts.length).toBeGreaterThan(0);
  for (const post of posts) expect((await request.get(post.url)).status()).toBe(200);
});
