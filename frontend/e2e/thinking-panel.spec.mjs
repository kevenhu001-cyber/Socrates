import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function installStream(page, immediate = true) {
  await page.addInitScript((immediate) => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    let ref;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const body = new ReadableStream({ start(controller) {
        ref = controller;
        if (immediate) controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"private reasoning"}}]}\n\n'));
      } });
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
    window.__pushThinkingFrame = (event, data) => ref.enqueue(encoder.encode(
      (event ? `event: ${event}\n` : '') + `data: ${JSON.stringify(data)}\n\n`,
    ));
    window.__finishThinking = () => {
      window.__pushThinkingFrame('', { choices: [{ delta: { content: '<think>private inline</think>The final answer.' } }] });
      window.__pushThinkingFrame('turn_summary', { summary: 'Checked the sources and compared the findings.' });
      ref.enqueue(encoder.encode('data: [DONE]\n\n'));
      ref.close();
    };
    window.__finishPlain = () => {
      window.__pushThinkingFrame('', { choices: [{ delta: { content: 'A direct answer.' } }] });
      ref.enqueue(encoder.encode('data: [DONE]\n\n'));
      ref.close();
    };
  }, immediate);
}

async function boot(page, messages = [], { theme = 'light', lang = 'en' } = {}) {
  await mockAuthedApp(page, { lang });
  await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
  const historical = messages.some((message) => message.role === 'assistant');
  if (historical) await page.route(/\/api\/(?:v2\/)?sessions\/99999999-9999-4999-8999-999999999999(?:\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: '99999999-9999-4999-8999-999999999999', topic: '处理过程', title: '处理过程', mode: 'chat', kind: 'chat', phase: 'chat', messages, kbNodes: [], mistakes: [] }),
  }));
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  if (historical) {
    await page.waitForFunction(() => typeof window.loadSession === 'function');
    await page.evaluate(() => window.loadSession('99999999-9999-4999-8999-999999999999'));
    return;
  }
  await page.evaluate((messages) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '99999999-9999-4999-8999-999999999999' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__testActivateMainView('chatView');
  }, messages);
}

async function startTurn(page, immediate = true) {
  await installStream(page, immediate);
  await boot(page, [{ clientId: 'user-think', role: 'user', rawText: 'Think it through', html: null }]);
  await page.evaluate(() => { window.__thinkTurnPromise = window.askChatTurn('Think it through'); });
  return page.locator('.msg.assistant').last();
}

test('one inline disclosure updates during reasoning and collapses on completion', async ({ page }) => {
  const bubble = await startTurn(page);
  const disclosure = bubble.locator('.turn-summary');
  const trigger = disclosure.locator('summary');
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble.locator('.thinking-status')).toHaveCount(1);
  await expect(bubble.locator('.thinking-spinner, .turn-summary-sparkle')).toHaveCount(0);
  await expect(disclosure.locator('.turn-summary-detail')).toBeVisible();
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing the comparison.', phase: 'initial' }));
  await expect(disclosure.locator('.turn-summary-text')).toHaveText('Preparing the comparison.');
  await page.evaluate(() => window.__pushThinkingFrame('', { choices: [{ delta: { reasoning_content: 'another private thought' } }] }));
  await expect(disclosure.locator('.turn-summary-text')).toHaveText('Preparing the comparison.');
  await expect(disclosure.locator('.turn-summary-thinking-text')).toHaveCount(0);
  await expect(bubble).not.toContainText('another private thought');
  await page.evaluate(() => window.__finishThinking());
  await expect(bubble).toContainText('The final answer.');
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  // Auto-collapse once thinking ends
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(disclosure.locator('.turn-summary-detail')).toHaveCount(0);
  await expect(trigger).toHaveText(/Thought (?:complete|for \d+s)/);
  // Manual click expands the public summary, never the provider reasoning.
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(disclosure.locator('.turn-summary-text')).toHaveText('Checked the sources and compared the findings.');
  await expect(disclosure.locator('.turn-summary-thinking-text')).toHaveCount(0);
  await expect(bubble).not.toContainText('another private thought');
  await expect(bubble).not.toContainText('private inline');
  await expect(page.locator('[data-thinking-panel], #thinkingPanelReactRoot, #summaryBtn')).toHaveCount(0);
  await trigger.click();
  await expect(disclosure.locator('.turn-summary-detail')).toHaveCount(0);
});

test('waiting disclosure works with native keyboard controls and does not reset on deltas', async ({ page }) => {
  const bubble = await startTurn(page, false);
  const trigger = bubble.locator('.turn-summary > summary');
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble.locator('.turn-summary-text')).toBeVisible();
  await page.evaluate(() => window.__pushThinkingFrame('', { choices: [{ delta: { reasoning_content: 'private reasoning' } }] }));
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble).not.toContainText('private reasoning');
  await page.keyboard.press('Space');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.__finishThinking());
});

test('tool status owns live progress without a duplicate activity list', async ({ page }) => {
  const bubble = await startTurn(page);
  await bubble.locator('.turn-summary > summary').click();
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [{ id: 'search-inline', name: 'web_search', input: { query: 'public query' } }]));
  const row = bubble.locator('.tool-inline[data-tcid="search-inline"]');
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
  await expect(bubble.locator('.turn-summary-activities')).toHaveCount(0);
  await expect(bubble.getByText('Searching "public query"…', { exact: true })).toHaveCount(1);
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', { id: 'search-inline', name: 'web_search', ok: true, output: 'Found a source', results: [{ title: 'Source', url: 'https://example.test' }], status: 'completed' }));
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(bubble.locator('.tool-inline')).toHaveCount(1);
  await expect(bubble).not.toContainText('private');
  await page.evaluate(() => window.__finishThinking());
});

test('a task preview does not leave a thought header on a plain answer', async ({ page }) => {
  const bubble = await startTurn(page, false);
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing an answer.', phase: 'initial' }));
  await bubble.locator('.turn-summary > summary').click();
  await expect(bubble.locator('.turn-summary-text')).toHaveText('Preparing an answer.');
  await page.evaluate(() => window.__finishPlain());
  await expect(bubble).toContainText('A direct answer.');
  await expect(bubble.locator('.turn-summary')).toHaveCount(0);
});

for (const mobile of [false, true]) {
  test(`compact process and tool rows: ${mobile ? 'mobile dark' : 'desktop light'}`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page, [
      { clientId: 'user-example', role: 'user', rawText: '帮我比较这两种方案。' },
      {
        clientId: 'answer-example', role: 'assistant',
        rawText: '两种方案各有适用条件。方案 A 更容易开始，方案 B 更适合需要精细控制的场景。\n\n建议先用方案 A 验证需求，再根据实际结果决定是否切换。',
        reasoningContent: 'private reasoning', summary: '已查阅资料并对比了适用条件。',
        toolCalls: [{ id: 'search-example', name: 'web_search', input: { query: '两种方案的适用条件' }, status: 'completed', textOffset: 0, results: [{ title: '方案说明与适用条件', url: 'https://example.test/guide' }] }],
      },
    ], { theme: mobile ? 'dark' : 'light', lang: 'zh' });
    await expect(page).toHaveTitle(/Socrates/i);
    const bubble = page.locator('.msg.assistant').last();
    const tool = bubble.locator('.tool-inline');
    await expect(tool).toHaveCount(1);
    await expect(bubble.locator('.turn-summary > summary')).toHaveText('思考完成');
    await expect(bubble).not.toContainText('private reasoning');
    const arrowGap = await tool.evaluate((node) => {
      const label = node.querySelector('.tool-inline-label').getBoundingClientRect();
      return node.querySelector('.tool-inline-chev').getBoundingClientRect().left - label.right;
    });
    expect(arrowGap).toBeLessThanOrEqual(10);
    await bubble.scrollIntoViewIfNeeded();
    if (mobile) await page.screenshot({ path: 'test-results/activity-mobile-dark-closed.png' });
    else await page.screenshot({ path: 'test-results/activity-desktop-light-closed.png' });
    await bubble.locator('.turn-summary > summary').click();
    await tool.locator('summary').click();
    await expect(bubble.locator('.turn-summary-text')).toHaveText('已查阅资料并对比了适用条件。');
    await expect(bubble.locator('.turn-summary-thinking-text')).toHaveCount(0);
    await expect(tool.locator('.tool-inline-src')).toBeVisible();
    await expect(bubble.locator('.turn-summary-activities')).toHaveCount(0);
    for (const control of [bubble.locator('.turn-summary > summary'), tool.locator(':scope > summary')]) {
      await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
    const sourceSection = tool.locator('.tool-inline-detail-section[data-kind="sources"]');
    await expect(sourceSection).toHaveCSS('box-shadow', 'none');
    await expect(sourceSection).toHaveCSS('border-top-width', '0px');
    await expect(sourceSection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
    if (mobile) await page.screenshot({ path: 'test-results/activity-mobile-dark-open.png' });
    else await page.screenshot({ path: 'test-results/activity-desktop-light-open.png' });
  });
}

for (const theme of ['light', 'dark']) {
  for (const mobile of [false, true]) {
    test(`inline summaries and tool details stay readable: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const summaryText = '已搜索相关资料，并核对了来源。'.repeat(12);
      await boot(page, [
        { clientId: 'user-a', role: 'user', rawText: '帮我对比一下这些资料。' },
        { clientId: 'answer-a', role: 'assistant', rawText: '资料已经整理好，以下是对比结果。', reasoningContent: 'private reasoning', summary: summaryText, toolCalls: [{ id: 'source-a', name: 'web_search', input: { query: '很长的搜索关键词用于检查手机端换行和箭头对齐'.repeat(3) }, output: 'Found sources', status: 'completed', textOffset: 0, results: [{ title: '来源标题', url: 'https://example.test/source' }] }] },
        { clientId: 'user-b', role: 'user', rawText: '再解释一下结论。' },
        { clientId: 'answer-b', role: 'assistant', rawText: '这是补充说明。', reasoningContent: 'another private reasoning', summary: '已补充解释结论。' },
      ], { theme, lang: 'zh' });
      const bubbles = page.locator('.msg.assistant');
      const first = bubbles.nth(0);
      const second = bubbles.nth(1);
      const trigger = first.locator('.turn-summary > summary');
      await expect(trigger).toHaveText('思考完成');
      await expect(first.locator('.turn-summary-detail')).toHaveCount(0);
      await expect(second.locator('.turn-summary > summary')).toHaveText('思考完成');
      await expect(first).not.toContainText('private reasoning');
      await expect(second).not.toContainText('another private reasoning');
      await trigger.click();
      await expect(first.locator('.turn-summary-text')).toHaveText(summaryText);
      await expect(first.locator('.turn-summary-thinking-text')).toHaveCount(0);
      await expect(second.locator('.turn-summary-detail')).toHaveCount(0);
      await first.locator('.tool-inline > summary').click();
      await expect(first.locator('.tool-inline-src')).toBeVisible();
      await expect(page.locator('.tool-run-sheet, [data-thinking-panel]')).toHaveCount(0);
      const sizing = await trigger.evaluate((node) => ({ height: node.getBoundingClientRect().height, animation: getComputedStyle(node).animationName }));
      expect(sizing.height).toBeGreaterThanOrEqual(mobile ? 44 : 32);
      expect(sizing.animation).toBe('none');
      const spacing = await trigger.evaluate((node) => {
        const label = node.querySelector('.turn-summary-label').getBoundingClientRect();
        const arrow = node.querySelector('.turn-summary-chevron').getBoundingClientRect();
        return { gap: arrow.left - label.right, width: node.getBoundingClientRect().width };
      });
      expect(spacing.gap).toBeLessThanOrEqual(10);
      expect(spacing.width).toBeLessThan(180);
      await expect(first.locator('.turn-summary-activities')).toHaveCount(0);
      const overflow = await first.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await first.scrollIntoViewIfNeeded();
      if (mobile && theme === 'light') await page.screenshot({ path: 'test-results/process-light-mobile.png' });
      else if (mobile) await page.screenshot({ path: 'test-results/process-dark-mobile.png' });
      else if (theme === 'light') await page.screenshot({ path: 'test-results/process-light-desktop.png' });
      else await page.screenshot({ path: 'test-results/process-dark-desktop.png' });
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
