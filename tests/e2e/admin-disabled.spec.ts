import { expect, test } from './fixtures';

test('admin without explicit local mode does not contact a proxy or GitHub', async ({ page }) => {
  const backendRequests: string[] = [];
  page.on('request', request => {
    if (/8082|api.github.com|decap-cms-3/.test(request.url())) backendRequests.push(request.url());
  });
  await page.goto('/admin/');
  await expect(page.getByRole('status')).toHaveText('웹 편집 인증 연결을 준비 중입니다.');
  await expect(page.getByRole('status')).toHaveAttribute('data-local', 'false');
  expect(backendRequests).toEqual([]);
  await page.goto('/fragments/');
  // Only the fixture leak matters here; an author may legitimately leave no cards at all.
  const cards = JSON.parse(await page.locator('#fragment-data').textContent() ?? '[]');
  expect(cards.some((card: { id: string }) => ['cms-connection', 'stable-existing-id'].includes(card.id))).toBe(false);
});
