import { test as base } from '@playwright/test';

import type { Page } from '@playwright/test';

export { expect } from '@playwright/test';

export interface Card { id: string; title: string; aliases: string[]; relations: { target: string; type: string }[]; category: string }

// Authors add, edit and delete these cards from the web, so tests read what the build actually holds.
export const cardsOf = (page: Page): Promise<Card[]> =>
  page.evaluate(() => JSON.parse(document.getElementById('fragment-data')!.textContent!));

// A production-mode build refreshes cards from GitHub. Block it so the suite checks the cards in the build itself.
// Only preview runs need this; routing every dev-server module request slows the page enough to race the tests.
export const test = process.env.TEST_PREVIEW !== '1' ? base : base.extend({
  context: async ({ context }, use) => {
    await context.route('https://api.github.com/**', route => route.abort('blockedbyclient'));
    await use(context);
  },
});
