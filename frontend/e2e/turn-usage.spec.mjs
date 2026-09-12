// e2e/turn-usage.spec.mjs
//
// The finalized assistant message renders the LobeHub-style usage footer:
// model + speed on the left, prompt/completion token totals on the right.
// The backend emits the tokens as an `event: usage` frame right before
// [DONE], so the stream mock drives the exact wire shape.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function installUsageStream(page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          const push = (frame) => controller.enqueue(encoder.encode(frame));
          push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Usage footer answer.' } }] })}\n\n`);
          push('event: usage\ndata: {"promptTokens":1200,"completionTokens":340,"totalTokens":1540}\n\n');
          push('data: [DONE]\n\n');
          controller.close();
        },
      });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await installUsageStream(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('a finalized assistant turn shows model, speed, and token totals', async ({ page }) => {
  await page.evaluate(() => {
    window.apiConfig.providers = [{
      id: 'luna',
      label: '5.6 Luna',
      model: 'luna-1',
      url: 'https://models.example.test/v1',
      isBuiltIn: false,
    }];
    window.apiConfig.activeId = 'luna';
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '55555555-5555-4555-8555-555555555555' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.submitChatMessage('Show me the usage footer');
  });

  const footer = page.locator('.msg.assistant .turn-usage').last();
  await expect(footer).toBeVisible();
  await expect(footer).toContainText('5.6 Luna');
  await expect(footer.locator('.turn-usage-speed')).toContainText('tok/s');
  const tokens = await footer.evaluate((node) => ({
    prompt: node.querySelectorAll('.turn-usage-token')[0]?.textContent || '',
    completion: node.querySelectorAll('.turn-usage-token')[1]?.textContent || '',
  }));
  expect(tokens.prompt).toContain('↑');
  expect(tokens.prompt).toContain('1.2k');
  expect(tokens.completion).toContain('↓');
  expect(tokens.completion).toContain('340');
});
