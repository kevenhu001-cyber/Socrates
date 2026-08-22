// e2e/katex-retry.spec.mjs — a transient KaTeX chunk-load failure must
// retry automatically and repaint formulas without a page refresh.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('formulas recover after a transient KaTeX chunk failure', async ({ page }) => {
  let katexFailures = 0;
  await mockAuthedApp(page);
  await page.route('**/assets/katex*.js', async (route) => {
    if (katexFailures === 0) {
      katexFailures += 1;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    const content = 'The derivative: $f\'(x)$ inline and $$\\frac{dy}{dx}$$ display.';
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  const chatInput = page.locator('#chatComposerRoot .rich-composer-editor').first();
  await chatInput.fill('Show the derivative formula.');
  await page.evaluate(() => window.submitChatMessage('Show the derivative formula.'));

  /* The first KaTeX chunk request was aborted — the fallback renderer may
     briefly show raw LaTeX. The retry must load KaTeX and the ready hook
     must repaint the message into real formulas without a refresh. */
  await expect(page.locator('#msgList .msg.assistant .katex').first()).toBeVisible({ timeout: 10000 });
  expect(katexFailures).toBe(1);
});
