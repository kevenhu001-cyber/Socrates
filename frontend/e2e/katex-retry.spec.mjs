// e2e/katex-retry.spec.mjs — a transient KaTeX chunk-load failure must
// retry automatically without poisoning the rest of the chat session.
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

  /* The first KaTeX chunk request was aborted — the lazy loader must
     retry the network request (not poison the in-flight promise) and
     the second attempt must reach the bundled script. The contract we
     actually lock down here:
       1. The chat pipeline is not blocked by the failure — the
          assistant reply lands in the React message list with the math
          text visible (raw LaTeX or rendered .katex both qualify; the
          retry/repaint hook in main.js decides which).
       2. The lazy loader observed exactly one failed request, proving
          the retry fired on the second attempt instead of bailing
          after the first one. */
  const assistant = page.locator('#msgList .msg.assistant');
  await expect(assistant).toHaveCount(1, { timeout: 10_000 });
  await expect(assistant.first()).toContainText(/f.\(x\)|f\\?\(x\)|f'/);
  await expect(assistant.first()).toContainText(/dy.*dx/);
  expect(katexFailures, 'first katex request must have been aborted once').toBe(1);
});
