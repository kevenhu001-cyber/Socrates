// Smoke coverage for the extension workflow layer. The layer is mounted
// inside #chatView, immediately before the composer, so its height remains
// part of the normal chat layout.

import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function activateExtension(page, actionName) {
  await page.evaluate((name) => {
    const action = window[name];
    if (typeof action !== 'function') throw new Error(`${name} is not installed`);
    action();
  }, actionName);
}

async function enterChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.__testActivateMainView('chatView');
  });
}

test('workflow layer mounts empty and shows stepper on research planning', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  const layer = page.locator('#workflowLayerReactRoot .workflow-layer');
  await expect(layer).toHaveCount(0);
  expect(await page.evaluate(() => !('__socratesAgentRunBridge' in window))).toBe(true);

  await activateExtension(page, 'exploreAction');

  await expect(page.locator('#workflowLayerReactRoot .workflow-layer')).toHaveCount(1);
  await expect(page.locator('#chatView #workflowLayerReactRoot')).toHaveCount(1);
  await expect(page.locator('.agent-stepper')).toBeVisible();
  await expect(page.locator('.agent-stepper-workflow')).toHaveText('Explore');
  await expect(page.locator('.agent-stepper-stages .agent-stepper-stage')).toHaveCount(4);
  await expect(page.locator('.agent-stepper-stage-active')).toHaveText(/Plan/);
});

test('stepper advances through searching and hides after completed', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    let controller;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(nextController) {
          controller = nextController;
          nextController.enqueue(encoder.encode(
            `event: tool_use\ndata: ${JSON.stringify([{ id: 'research-web', name: 'web_search', input: { query: 'test' } }])}\n\n`,
          ));
        },
      });
      window.__finishResearchStream = () => {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Research is complete."}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      };
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
  await prepareChatWorkbench(page);
  await activateExtension(page, 'exploreAction');
  await page.evaluate(() => { window.askChatTurn('Research the sample topic.'); });

  await expect(page.locator('.agent-stepper-stage-active')).toHaveText(/Search/);
  await page.evaluate(() => window.__finishResearchStream());
  await expect(page.locator('.workflow-layer')).toHaveClass(/workflow-layer-done/);
  await expect(page.locator('#workflowLayerReactRoot .workflow-layer')).toHaveCount(0, { timeout: 5000 });
});

test('analyze planning does not render a separate analysis workbench', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await activateExtension(page, 'analyzeAction');

  await expect(page.locator('.analyze-workbench')).toHaveCount(0);
  await expect(page.getByText('Analysis tools', { exact: true })).toHaveCount(0);
  await expect(page.locator('.workflow-layer')).toHaveCount(0);
});
