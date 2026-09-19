import { expect, test, type Page } from '@playwright/test';

const mobile = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

// 가로 스크롤이 생기면 좁은 화면에서 내용이 잘린다.
async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    widest: [...document.querySelectorAll<HTMLElement>('main *')]
      .filter(el => el.getBoundingClientRect().width > window.innerWidth + 1)
      .map(el => `${el.tagName.toLowerCase()}#${el.id}.${el.className}`)[0] ?? '',
  }));
  expect(overflow.widest, '뷰포트보다 넓은 요소').toBe('');
  expect(overflow.page, '문서 가로 넘침').toBeLessThanOrEqual(1);
}

// 본문 글자와 실제 배경의 대비. 밝은/어두운 테마 모두에서 읽을 수 있어야 한다.
// 테마 전환에는 0.35s 배경 전환이 있으므로 값이 안정될 때까지 다시 읽는다.
function expectContrast(page: Page, selector: string, label: string) {
  return expect.poll(() => contrast(page, selector), { message: label }).toBeGreaterThanOrEqual(4.5);
}
async function contrast(page: Page, selector: string) {
  return page.evaluate(target => {
    const element = document.querySelector(target);
    if (!element) throw new Error(`대상을 찾지 못했습니다: ${target}`);
    const channel = (value: number) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : (((value / 255) + 0.055) / 1.055) ** 2.4);
    const luminance = (color: string) => {
      const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    let node: Element | null = element;
    let background = 'rgb(255, 255, 255)';
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      const alpha = Number(value.match(/[\d.]+/g)?.[3] ?? '1');
      if (alpha === 1) { background = value; break; }
      node = node.parentElement;
    }
    const [light, dark] = [luminance(getComputedStyle(element).color), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  }, selector);
}

test('390px 밝은 테마에서 검색·페이지·팝업·그래프가 화면 안에 들어온다', async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto('/fragments/');
  await expect(page.getByText('25개의 개념 · 1 / 3 페이지')).toBeVisible();
  await expectNoOverflow(page);

  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('25개의 개념 · 2 / 3 페이지')).toBeVisible();
  await expect(page.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page');
  await expectNoOverflow(page);

  await page.getByRole('searchbox', { name: '개념 검색' }).fill('긴 설명');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);
  await expect(page.getByText('1개의 개념 · 1 / 1 페이지')).toBeVisible();
  await expectNoOverflow(page);

  await page.locator('[data-fragment-card]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(mobile.width);
  expect(box.x).toBeGreaterThanOrEqual(0);
  await expectContrast(page, '#fragment-dialog-summary', '팝업 요약 대비');
  await expectNoOverflow(page);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '관계 그래프', exact: true }).click();
  await expect(page.locator('#fragment-graph canvas').first()).toBeVisible();
  await expectNoOverflow(page);
  await page.getByRole('button', { name: '카드 보기', exact: true }).click();
  await expect(page.locator('[data-fragment-card]').first()).toBeVisible();
});

test('어두운 테마가 유지되고 1280px에서도 본문 대비가 충분하다', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/fragments/');
  await page.getByRole('button', { name: '테마 전환' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const selector of ['#fragment-count', '.fragment-card h2', '.fragment-card p', '.fragment-hint']) {
    await expectContrast(page, selector, `${selector} 대비(어두운 테마)`);
  }
  await expectNoOverflow(page);

  await page.locator('[data-fragment-card]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectContrast(page, '#fragment-dialog-body', '팝업 본문 대비(어두운 테마)');
  await page.keyboard.press('Escape');

  await page.setViewportSize(mobile);
  await page.getByRole('button', { name: '테마 전환' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  for (const selector of ['#fragment-count', '.fragment-card h2', '.fragment-hint']) {
    await expectContrast(page, selector, `${selector} 대비(밝은 테마)`);
  }
  await expectNoOverflow(page);
});

test('키보드만으로 검색·카드·팝업·그래프를 이동한다', async ({ page }) => {
  await page.setViewportSize(mobile);
  await page.goto('/fragments/');
  await page.getByRole('searchbox', { name: '개념 검색' }).focus();
  await page.keyboard.type('개념 004');
  await expect(page.locator('[data-fragment-card]')).toHaveCount(1);

  const card = page.locator('[data-fragment-card]').first();
  await card.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '닫기' })).toBeFocused();

  // 포커스는 팝업 안에서만 순환한다. 브라우저가 한 바퀴 끝에서 문서 자체에 머무는 것은 허용하고,
  // 배경 페이지의 조작 요소로 넘어가는 경우만 실패로 본다.
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press('Tab');
    const where = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) return 'document';
      return document.getElementById('fragment-dialog')!.contains(active) ? 'dialog' : `배경: ${active.tagName}#${active.id}`;
    });
    expect(['dialog', 'document'], '포커스가 배경 요소로 나감').toContain(where);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();

  await page.getByRole('button', { name: '관계 그래프', exact: true }).click();
  const node = page.locator('#graph-accessible button').first();
  await node.focus();
  await expect(page.locator('#graph-selection')).toContainText('직접 연결');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(node).toBeFocused();
});

test('페이지 이동 경계와 카테고리 필터가 함께 동작한다', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/fragments/');
  await expect(page.getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '3페이지' }).click();
  await expect(page.getByText('25개의 개념 · 3 / 3 페이지')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();

  await page.locator('#fragment-category').selectOption('DevOps');
  await expect(page.getByText('6개의 개념 · 1 / 1 페이지')).toBeVisible();
  // 3페이지에서 필터를 바꾸면 범위 밖 페이지가 남지 않는다.
  await expect(page).not.toHaveURL(/page=[23]/);
  await expectNoOverflow(page);
});
