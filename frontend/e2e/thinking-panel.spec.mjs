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
          'data: {"choices":[{"delta":{"content":"<think>inline private thought</think>这是最终回答。"}}]}\n\n',
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

async function bootChat(page, messages = [{ clientId: 'user-think', role: 'user', rawText: 'Think it through', html: null }]) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(({ sessionId, initialMessages }) => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: initialMessages });
    window.__testActivateMainView('chatView');
    window.__thinkTurnPromise = window.askChatTurn('Think it through');
  }, { sessionId: '99999999-9999-4999-8999-999999999999', initialMessages: messages });
}

test('clicking the Thinking pill opens a summary sheet without exposing reasoning', async ({ page }) => {
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
  await expect(panel.locator('.detail-heading h2')).toHaveText(/Summary|摘要/);
  await expect(panel.locator('.thinking-summary-timeline')).toBeVisible();
  await expect(panel.locator('.thinking-summary-item[data-kind="thinking"]')).toBeVisible();
  await expect(panel).not.toContainText('先判断需要查询哪些信息。');

  await page.evaluate(() => window.__sendReasoning('然后对比多个来源。'));
  await expect(panel).not.toContainText('然后对比多个来源。');
  await expect(page.locator('.msg.assistant').last()).not.toContainText('然后对比多个来源。');

  await page.evaluate(() => {
    const bridge = window.__socratesThinkingPanelBridge;
    bridge.publish({
      type: 'tool-activity',
      messageId: bridge.getSnapshot().messageId,
      id: 'search-summary-e2e',
      name: 'web_search',
      input: { query: '2026 Nobel Prize in Physics predictions' },
      results: [{ title: 'Prediction overview' }],
      state: 'done',
    });
  });
  const toolRow = panel.locator('.thinking-summary-item[data-kind="tool"]');
  await expect(toolRow).toContainText('2026 Nobel Prize in Physics predictions');
  await expect(toolRow).toHaveAttribute('data-state', 'done');
  await expect(panel.locator('.thinking-summary-item[data-kind="thinking"]')).toBeVisible();

  await page.evaluate(() => window.__finishThinkingStream());
  await expect(pill).toHaveCount(0);
  await expect(panel.locator('.thinking-summary-item[data-kind="thinking"]')).toHaveCount(0);
  await expect(panel).not.toContainText('然后对比多个来源。');
  await expect(panel).not.toContainText('inline private thought');
  await expect(page.locator('.msg.assistant').last()).not.toContainText('inline private thought');

  await panel.locator('.thinking-panel-close').click();
  await expect(panel).toHaveCount(0);
});

test('topbar summary button reopens history for every turn after thinking has finished', async ({ page }) => {
  await installReasoningStream(page, { immediate: true });
  await bootChat(page, [
    { clientId: 'user-old', role: 'user', rawText: 'Earlier question', html: '<p>Earlier question</p>' },
    {
      clientId: 'assistant-old',
      role: 'assistant',
      type: 'assistant',
      rawText: '<think>older private note</think>Earlier answer summarizes results.',
      html: '',
      toolCalls: [{ id: 'old-search', name: 'web_search', input: { query: 'previous search' }, output: 'Done', status: 'done', results: [{ title: 'Previous result' }] }],
    },
    { clientId: 'user-think', role: 'user', rawText: 'Think it through', html: null },
  ]);

  const trigger = page.locator('#summaryBtn');
  await expect(trigger).toBeVisible();
  await page.evaluate(() => window.__finishThinkingStream());
  await page.evaluate(() => window.__thinkTurnPromise);
  await expect(page.locator('.msg.assistant .thinking-status')).toHaveCount(0);

  await trigger.click();
  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const earlierTurn = panel.locator('.thinking-history-turn').filter({ hasText: 'Earlier question' });
  await earlierTurn.locator('.thinking-history-trigger').click();
  await expect(earlierTurn).toContainText('Earlier answer summarizes results.');
  await expect(earlierTurn).toContainText('previous search');
  await expect(panel).toContainText('Think it through');
  await expect(panel).toContainText('这是最终回答');
  await expect(panel).not.toContainText('older private note');
  await expect(panel).not.toContainText('inline private thought');

  await panel.locator('.thinking-panel-close').click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(panel).toBeVisible();
  const reopenedEarlierTurn = panel.locator('.thinking-history-turn').filter({ hasText: 'Earlier question' });
  await reopenedEarlierTurn.locator('.thinking-history-trigger').click();
  await expect(reopenedEarlierTurn).toContainText('previous search');
  await panel.locator('.thinking-panel-close').click();
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

test('thinking summary opens as a mobile bottom sheet', async ({ page }) => {
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
  expect(box.height).toBeGreaterThan(0.45 * 844);
  expect(box.height).toBeLessThanOrEqual(0.82 * 844);
  expect(box.y + box.height).toBeGreaterThan(840);
  await expect(panel.locator('.thinking-summary-timeline')).toBeVisible();
  await page.evaluate(() => {
    const bridge = window.__socratesThinkingPanelBridge;
    bridge.publish({
      type: 'tool-activity',
      messageId: bridge.getSnapshot().messageId,
      id: 'mobile-search-summary',
      name: 'web_search',
      input: { query: '2026 Nobel Prize in Physics predictions' },
      results: [{ title: 'Prediction overview' }],
      state: 'done',
    });
  });
  await expect(panel.locator('.thinking-summary-item[data-kind="tool"]')).toContainText('Nobel Prize');
  await page.screenshot({ path: 'test-results/thinking-summary-sheet-mobile.png' });

  await panel.locator('.thinking-panel-close').click();
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => window.__finishThinkingStream());
});

test('mobile summary history is reachable from a touch-sized topbar button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installReasoningStream(page, { immediate: true });
  await bootChat(page);

  const trigger = page.locator('#summaryBtn');
  await expect(trigger).toBeVisible();
  const bounds = await trigger.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.thinking-history-turn')).toContainText('Think it through');
  await page.evaluate(() => window.__finishThinkingStream());
  await panel.locator('.thinking-panel-close').click();
});

test('the thinking placeholder is clickable before reasoning arrives', async ({ page }) => {
  await installReasoningStream(page, { immediate: false });
  await bootChat(page);

  /* P_thinking-unified — the pre-first-token line is the same pill shape
     as every other live phase; only the label differs. */
  const dot = page.locator('.msg.assistant .thinking-status').last();
  await expect(dot).toBeVisible();
  await expect(dot).toHaveAttribute('role', 'button');
  const spinner = dot.locator('.thinking-spinner');
  await expect(spinner).toBeVisible();
  await dot.click();

  const panel = page.locator('[data-thinking-panel="1"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.detail-heading h2')).toHaveText(/Summary|摘要/);
  await expect(panel.locator('.thinking-summary-timeline')).toBeVisible();
  await expect(panel.locator('.thinking-summary-item[data-kind="thinking"]')).toBeVisible();

  await page.evaluate(() => window.__sendReasoning('稍等，我先整理思路。'));
  await expect(panel).not.toContainText('稍等，我先整理思路。');
  await expect(page.locator('.msg.assistant').last()).not.toContainText('稍等，我先整理思路。');
  await page.evaluate(() => window.__finishThinkingStream());
  await expect(panel).not.toContainText('稍等，我先整理思路。');
  await expect(panel).not.toContainText('inline private thought');
});
