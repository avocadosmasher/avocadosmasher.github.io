import { cardsOf, expect, test } from './fixtures';

test('composer offers the blog sidebar categories and preserves a selection', async ({ page }) => {
  await page.goto('/blog/');
  const categories = await page.locator('#sidebar [data-cat]').evaluateAll(items =>
    items.map(item => item.getAttribute('data-cat')!).filter(value => value !== '전체'));
  expect(categories.length).toBeGreaterThan(0);
  await page.goto('/fragments/');
  await page.getByRole('button', { name: '새 카드', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '새 카드 작성' });
  const category = editor.getByLabel('카테고리', { exact: true });
  await expect(category.locator('option')).toHaveText(['카테고리를 선택해주세요', ...categories]);
  await expect(category).toHaveValue('');
  expect(await category.evaluate((element: HTMLSelectElement) => element.validity.valueMissing)).toBe(true);
  await category.selectOption(categories.at(-1)!);
  await page.mouse.click(2, 2);
  await page.getByRole('button', { name: '새 카드', exact: true }).click();
  await expect(category).toHaveValue(categories.at(-1)!);
});

test('inline composer keeps input when closed and respects the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/');
  // The query only has to survive the composer, so take a term from the build instead of naming a card.
  const [card] = await cardsOf(page);
  const query = card?.title ?? '없는 개념 zzqx';
  await page.goto(`/fragments/?q=${encodeURIComponent(query)}`);
  const trigger = page.getByRole('button', { name: '새 카드', exact: true });
  await trigger.click();
  const editor = page.getByRole('dialog', { name: '새 카드 작성' });
  await expect(editor).toBeVisible();
  await editor.getByLabel('용어', { exact: true }).fill('새 개념');
  await editor.getByLabel('요약', { exact: true }).fill('개념 설명');
  await expect(editor.getByRole('button', { name: '카드 저장' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(editor.getByLabel('용어', { exact: true })).toHaveValue('새 개념');
  await editor.getByLabel('용어', { exact: true }).click();
  await expect(editor).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(editor).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(editor.getByLabel('용어', { exact: true })).toHaveValue('새 개념');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.getByRole('button', { name: '닫기', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(query);
  await expect(page.getByRole('searchbox', { name: '개념 검색' })).toHaveValue(query);
  if (card) await expect(page.getByRole('button', { name: `${card.title} 자세히 보기`, exact: true })).toBeVisible();
});
