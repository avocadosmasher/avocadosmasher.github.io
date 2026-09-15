import { expect, test } from '@playwright/test';

test('inline composer keeps input when closed and respects the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/?q=EPT');
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await editor.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page).toHaveURL(/q=EPT/);
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
});
