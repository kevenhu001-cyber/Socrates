import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

function installReasoningStream(page, { immediate = true } = {}) {
  return page.addInitScript((opts) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controllerRef;
      const body = new ReadableStream({
        start(controller) {
          controllerRef = controller;
          if (opts.immediate) {
            controller.enqueue(encoder.encode(
              'data: {"choices":[{"delta":{"reasoning_content":"先判断需要查询哪些信息。"}}]}\n\n',
            ));
          }
        },
      });
      window.__sendReasoning = (text) => controllerRef.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"reasoning_content":"' + text + '"}}]}\n\n',
      ));
      window.__finishThinkingStream = () => {
        controllerRef.enqueue(encoder.encode(
          'data: {"choices":[{"delta":{"content":"这是最终回答。"}}]}\n\n',
        ));
        controllerRef.enqueue(encoder.encode('data: [DONE]\n\n'));
        controllerRef.close();
      };
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  }, { immediate });
}

async function bootChat(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '99999999-9999-4999-8999-999999999999';
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-think', role: 'user', rawText: 'Think it through', html: null }] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__thinkTurnPromise = window.askChatTurn('Think it through');
  });
}

test('clicking the Thinking pill opens the right drawer and streams live reasoning', async ({ page }) => {
  await installReasoningStream(page, { immediate: true });
  await bootChat(page);

  const pill = page.locator('.msg.assistant .thinking-status').last();
  await expect(pill).toBeVisible();
  await expect(pill).toHaveAttribute('role', 'button');
  const stableStatus = await pill.evaluate((node) => {
    const label = node.querySelector('.thinking-status-label');
    const labelStyle = getComputedStyle(label);
    const dotStyle = getComputedStyle(node, '::before');
    return {
      labelAnimation: labelStyle.animationName,
      dotAnimation: dotStyle.animationName,
      labelFill: labelStyle.webkitTextFillColor,
    };
  });
  expect(stableStatus.labelAnimation).toBe('none');
  expect(stableStatus.dotAnimation).toBe('none');
  expect(stableStatus.labelFill).not.toBe('transparent');
  await pill.click();

  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.thinking-panel-text')).toContainText('先判断需要查询哪些信息。');

  await page.evaluate(() => window.__sendReasoning('然后对比多个来源。'));
  await expect(panel.locator('.thinking-panel-text')).toContainText('然后对比多个来源。');

  await page.evaluate(() => window.__finishThinkingStream());
  await expect(pill).toHaveCount(0);
  await expect(panel.locator('.thinking-panel-text')).toContainText('然后对比多个来源。');

  await panel.locator('.thinking-panel-close').click();
  await expect(panel).toHaveCount(0);
});

test('thinking drawer closes via Escape and backdrop click', async ({ page }) => {
  await installReasoningStream(page, { immediate: true });
  await bootChat(page);

  const pill = page.locator('.msg.assistant .thinking-status').last();
  await expect(pill).toBeVisible();
  await pill.click();
  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);

  await expect(pill).toBeVisible();
  await pill.click();
  await expect(panel).toBeVisible();
  await page.locator('[data-thinking-panel-backdrop="1"]').click({ position: { x: 12, y: 12 } });
  await expect(panel).toHaveCount(0);

  await page.evaluate(() => window.__finishThinkingStream());
});

test('thinking panel is a 40% bottom sheet on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReasoningStream(page, { immediate: true });
  await bootChat(page);

  const pill = page.locator('.msg.assistant .thinking-status').last();
  await expect(pill).toBeVisible();
  await pill.click();

  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThan(0.38 * 844);
  expect(box.height).toBeLessThan(0.42 * 844);
  expect(box.y + box.height).toBeGreaterThan(840);

  await panel.locator('.thinking-panel-close').click();
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => window.__finishThinkingStream());
});

test('the thinking placeholder is clickable before reasoning arrives', async ({ page }) => {
  await installReasoningStream(page, { immediate: false });
  await bootChat(page);

  const dot = page.locator('.msg.assistant .thinking-dot').last();
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute('role', 'button');
  const spinner = dot.locator('.thinking-spinner');
  await expect(spinner).toBeVisible();
  await dot.click();

  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.thinking-panel-empty')).toBeVisible();

  await page.evaluate(() => window.__sendReasoning('稍等，我先整理思路。'));
  await expect(panel.locator('.thinking-panel-text')).toContainText('稍等');
  await page.evaluate(() => window.__finishThinkingStream());
  await expect(panel.locator('.thinking-panel-text')).toContainText('稍等');
});
