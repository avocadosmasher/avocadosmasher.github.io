import { expect, test } from '@playwright/test';

test('admin without explicit local mode does not contact a proxy or GitHub', async ({ page }) => {
  const backendRequests: string[] = [];
  page.on('request', request => {
    if (/8082|api.github.com|decap-cms-3/.test(request.url())) backendRequests.push(request.url());
  });
  await page.goto('/admin/');
  await expect(page.getByRole('status')).toHaveText('웹 편집 인증 연결을 준비 중입니다.');
  await expect(page.getByRole('status')).toHaveAttribute('data-local', 'false');
  expect(backendRequests).toEqual([]);
});
