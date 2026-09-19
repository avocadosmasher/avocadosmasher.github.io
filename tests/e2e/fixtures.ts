import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

// A production-mode build refreshes cards from GitHub. Block it so the suite checks the cards in the build itself.
// Only preview runs need this; routing every dev-server module request slows the page enough to race the tests.
export const test = process.env.TEST_PREVIEW !== '1' ? base : base.extend({
  context: async ({ context }, use) => {
    await context.route('https://api.github.com/**', route => route.abort('blockedbyclient'));
    await use(context);
  },
});
