import { expect, test } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';

test('A03-2: CMS loads only isolated cards and opens the editor', async ({ page, request }) => {
  const before = await Promise.all((await readdir('src/content/fragments')).sort().map(async name => [name, await readFile(`src/content/fragments/${name}`, 'utf8')]));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/');
  const login = page.getByRole('button', { name: /login/i });
  await login.click();
  await expect(page.getByText('CMS 격리 연결 확인', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByText('CMS 격리 연결 확인', { exact: true }).click();
  await expect(page.getByLabel('용어', { exact: true })).toHaveValue('CMS 격리 연결 확인');
  await expect(page.getByLabel('요약', { exact: true })).toHaveValue('운영 콘텐츠와 분리된 연결 확인용 카드');
  const response = await request.post('http://127.0.0.1:8082/api/v1', {
    data: { action: 'entriesByFolder', params: { branch: 'main', folder: 'src/content/fragments', extension: 'md', depth: 1 } },
  });
  expect(response.ok()).toBe(true);
  const entries = await response.json();
  expect(entries).toHaveLength(1);
  expect(JSON.stringify(entries)).toContain('cms-connection');
  const outside = await request.post('http://127.0.0.1:8082/api/v1', {
    data: { action: 'getEntry', params: { branch: 'main', path: '../../src/content/fragments/ept.md' } },
  });
  expect(outside.ok()).toBe(false);
  const after = await Promise.all((await readdir('src/content/fragments')).sort().map(async name => [name, await readFile(`src/content/fragments/${name}`, 'utf8')]));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('A03-2: proxy failure keeps CMS closed and shows a retry instruction', async ({ page }) => {
  const cmsRequests: string[] = [];
  page.on('request', request => {
    if (/api.github.com|decap-cms-3/.test(request.url())) cmsRequests.push(request.url());
  });
  await page.route('http://127.0.0.1:8082/api/v1', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/admin/');
  await expect(page.getByRole('status')).toContainText('격리 저장 서버 연결을 확인하세요.');
  await expect(page.getByRole('status')).toContainText('새로고침');
  expect(cmsRequests).toEqual([]);
});
