import { expect, test } from '@playwright/test';

// H02 인수: 500개 카드·1,500개 관계 규모에서 검색 응답과 그래프 열기 시간을 측정한다.
// 목표는 계획서의 제안 목표(검색 p95 200ms, 그래프 조작 가능까지 2초)이며 확정 SLA가 아니다.
const queries = [
  '개념 250', '005', 'AI', '묶음-2', '존재하지않음', '조합형', 'Fixture 10', 'DevOps',
  'Backend', '개념', '', '007', 'part', '긴 설명', 'Frontend', '묶음-1', '999', '개념 499', '한글', '스크롤',
];

test('검색 갱신이 500개 카드 규모에서도 p95 200ms 목표 안에 든다', async ({ page }, testInfo) => {
  await page.goto('/fragments/');
  await expect(page.getByText('500개의 개념 · 1 / 42 페이지')).toBeVisible();

  // input 이벤트는 render()를 동기 실행하므로, 디스패치 전후 performance.now() 차이가
  // 브라우저 안에서 실제로 걸린 검색+DOM 갱신 시간이다(테스트 러너 왕복 지연 제외).
  const durations = await page.evaluate((qs) => {
    const input = document.getElementById('fragment-search') as HTMLInputElement;
    return qs.map((q) => {
      const start = performance.now();
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return performance.now() - start;
    });
  }, queries);

  const sorted = [...durations].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  await testInfo.attach('search-durations-ms', { body: JSON.stringify({ durations, p95 }, null, 2), contentType: 'application/json' });
  expect(p95, `검색 p95 (${p95.toFixed(1)}ms), 전체: ${sorted.map(d => d.toFixed(1)).join(', ')}`).toBeLessThanOrEqual(200);
});

test('그래프 열기가 1,500개 관계 규모에서도 2초 목표 안에 조작 가능해진다', async ({ page }, testInfo) => {
  await page.goto('/fragments/');
  await expect(page.getByText('500개의 개념 · 1 / 42 페이지')).toBeVisible();

  const start = Date.now();
  await page.getByRole('button', { name: '관계 그래프', exact: true }).click();
  await expect(page.locator('#fragment-graph canvas').first()).toBeVisible();
  await expect(page.locator('#graph-status')).toHaveText('500개 개념 · 1500개 관계');
  const elapsed = Date.now() - start;
  await testInfo.attach('graph-render-ms', { body: String(elapsed), contentType: 'text/plain' });
  expect(elapsed, `그래프 렌더+관계 표시 소요 (${elapsed}ms)`).toBeLessThanOrEqual(2000);

  // 렌더링 완료 후 실제 조작(노드 선택 → 팝업)이 가능한지 확인한다.
  const nodeButton = page.locator('#graph-accessible button').first();
  await nodeButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
