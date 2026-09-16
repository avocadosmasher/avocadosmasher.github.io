import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, connected = false) {
  const titles = ['다른 세션에서 수정 확인하는 아주 긴 개념 이름입니다', '아아 테스트와 긴 이름', '변경 테스트입니다', '독립된 개념', 'test', '또 다른 테스트', '마지막 개념'];
  const cards = titles.map((title, index) => ({ id: `node-${index}`, title, summary: '그래프 확인', category: 'DevOps',
    relations: connected && index < 2 ? [{ target: `node-${index + 1}`, type: 'related' }] : [] }));
  await page.route('https://api.github.com/**', async route => {
    const url = route.request().url();
    if (url.includes('/git/trees/')) return route.fulfill({ json: { truncated: false, tree: cards.map((card, index) => ({ path: `src/content/fragments/${card.id}.md`, type: 'blob', sha: String(index + 1).repeat(40) })) } });
    const sha = new URL(url).pathname.split('/').at(-1)!;
    const card = cards[Number(sha[0]) - 1];
    const source = `---\n${Object.entries(card).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n본문\n`;
    return route.fulfill({ json: { sha, encoding: 'base64', content: Buffer.from(source).toString('base64') } });
  });
  await page.goto('/fragments/?view=graph');
  await expect(page.locator('#graph-status')).toContainText('7개 개념');
}

for (const width of [1280, 390]) {
  test(`long labels do not overlap at ${width}px and missing relations are explained`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixture(page);
    await expect(page.locator('#graph-empty-relations')).toContainText('관계가 아직 등록되지 않았습니다');
    const boxes = await page.locator('#fragment-graph').evaluate(element => {
      const cy = (element as any)._cyreg.cy;
      return cy.nodes().map((node: any) => node.renderedBoundingBox({ includeLabels: true }));
    });
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const overlap = boxes[a].x1 < boxes[b].x2 && boxes[a].x2 > boxes[b].x1 && boxes[a].y1 < boxes[b].y2 && boxes[a].y2 > boxes[b].y1;
      expect(overlap, `labels ${a}/${b}`).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('hover and keyboard focus highlight only the node and its direct neighbors; clicks still open cards', async ({ page }) => {
  await fixture(page, true);
  const canvas = page.locator('#fragment-graph');
  await canvas.scrollIntoViewIfNeeded();
  // Canvas layout and its scroll offset settle asynchronously; retry a real pointer move.
  await expect(async () => {
    const position = await canvas.evaluate(element => (element as any)._cyreg.cy.getElementById('node-0').renderedPosition());
    await canvas.hover({ position: { x: position.x + 1, y: position.y + 1 } });
    await expect(page.locator('#graph-selection')).toContainText('직접 연결 1개', { timeout: 500 });
  }).toPass();
  const highlighted = await canvas.evaluate(element => (element as any)._cyreg.cy.nodes().filter((node: any) => Number(node.style('opacity')) > 0.5).map((node: any) => node.id()));
  expect(highlighted.sort()).toEqual(['node-0', 'node-1']);
  await page.mouse.move(0, 0);
  await expect(page.locator('#graph-selection')).toContainText('노드에 마우스를');
  const middle = page.locator('#graph-accessible button').nth(1);
  await middle.focus();
  await expect(page.locator('#graph-selection')).toContainText('직접 연결 2개');
  await middle.press('Enter');
  await expect(page.locator('#fragment-dialog-title')).toHaveText('아아 테스트와 긴 이름');
  await page.keyboard.press('Escape');
  await expect(middle).toBeFocused();
  await page.locator('#graph-focus').selectOption('node-0');
  await expect(page.locator('#graph-status')).toContainText('2개 개념');
  await page.locator('#graph-focus').selectOption('');
  await expect(page.locator('#graph-status')).toContainText('7개 개념');
});
