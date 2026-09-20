import { cardsOf, expect, test, type Card } from './fixtures';

const missing = '없는 개념 zzqx';
const detail = (card: Card) => ({ name: `${card.title} 자세히 보기`, exact: true });

test('C01–D05: navigate, search aliases, filter and restore URL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Fragments', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fragments', exact: true })).toBeVisible();
  const cards = await cardsOf(page);
  test.skip(cards.length === 0, '카드가 없으면 검색을 검증할 수 없다');
  // Prefer an alias so the search still covers D02's alias matching whenever the cards have one.
  const card = cards.find(c => c.aliases.length > 0) ?? cards[0];
  const term = card.aliases[0] ?? card.title;
  await page.getByRole('searchbox', { name: '개념 검색' }).fill(term);
  await expect(page.getByRole('button', detail(card))).toBeVisible();
  await page.reload();
  await expect(page.getByRole('searchbox', { name: '개념 검색' })).toHaveValue(term);
  await page.getByRole('searchbox', { name: '개념 검색' }).fill(missing);
  await expect(page.getByText('조건에 맞는 개념이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색어 지우기' }).click();
  await expect(page.getByRole('searchbox', { name: '개념 검색' })).toHaveValue('');
  await expect(page.getByText('조건에 맞는 개념이 없습니다.')).toBeHidden();
  await expect(page.getByRole('button', { name: '검색어 지우기' })).toBeHidden();
  await expect(page.locator('[data-fragment-card]')).toHaveCount(cards.length);
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test('E01–E04: modal, related card, keyboard, direct links', async ({ page }) => {
  await page.goto('/fragments/');
  const cards = await cardsOf(page);
  test.skip(cards.length === 0, '카드가 없으면 팝업을 열 수 없다');
  const linked = cards.find(c => c.relations.some(r => cards.some(target => target.id === r.target)));
  const card = linked ?? cards[0];
  await page.getByRole('searchbox', { name: '개념 검색' }).fill(card.title);
  await page.getByRole('button', detail(card)).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: card.title, exact: true })).toBeVisible();
  if (linked) {
    const target = cards.find(c => c.id === linked.relations.find(r => cards.some(t => t.id === r.target))!.target)!;
    await dialog.getByRole('button', { name: new RegExp(target.title) }).click();
    await expect(dialog.getByRole('heading', { name: target.title, exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', detail(card))).toBeFocused();
  await page.goto(`/fragments/?card=${card.id}`);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page).not.toHaveURL(/card=/);
});

test('F03/F04: graph loads on demand and can return to cards', async ({ page }) => {
  await page.goto('/fragments/');
  test.skip((await cardsOf(page)).length === 0, '카드가 없으면 그래프를 그릴 수 없다');
  await page.getByRole('button', { name: '관계 그래프', exact: true }).click();
  await expect(page.getByRole('region', { name: '개념 관계 그래프' })).toBeVisible();
  await expect(page.locator('#fragment-graph canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '카드 보기', exact: true }).click();
  await expect(page.locator('[data-fragment-card]').first()).toBeVisible();
});

test('H01: mobile dark mode and modal fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/fragments/');
  const cards = await cardsOf(page);
  test.skip(cards.length === 0, '카드가 없으면 팝업을 열 수 없다');
  await page.goto(`/fragments/?card=${cards[0].id}`);
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
