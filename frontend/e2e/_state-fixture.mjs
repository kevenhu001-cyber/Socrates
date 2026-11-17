import { test as base } from '@playwright/test';
import { enableTestState } from './_state-init.mjs';

export { expect } from '@playwright/test';

export const test = base.extend({
  context: async ({ context }, use) => {
    await enableTestState(context);
    await use(context);
  },
});
