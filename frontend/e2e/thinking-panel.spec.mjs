import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function installStream(page, immediate = true) {
  await page.evaluate((immediate) => {
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
  await boot(page, [{ clientId: 'user-think', role: 'user', rawText: 'Think it through', html: null }]);
  await installStream(page, immediate);
  await page.evaluate(() => { window.__thinkTurnPromise = window.askChatTurn('Think it through'); });
  return page.locator('.msg.assistant').last();
}

test('intent stays in the unified activity and completed observations do not duplicate the answer', async ({ page }) => {
  const bubble = await startTurn(page);
  await expect(bubble.locator('.thinking-status')).toHaveCount(1);
  await expect(bubble.locator('.thinking-spinner, .turn-summary-sparkle')).toHaveCount(0);
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing the comparison.', phase: 'initial' }));
  await expect(bubble.locator('.turn-activity-intent')).toHaveText('Preparing the comparison.');
  await expect(bubble.locator('.turn-summary > summary')).toHaveCount(0);
  await page.evaluate(() => window.__pushThinkingFrame('', { choices: [{ delta: { reasoning_content: 'another private thought' } }] }));
  await expect(bubble).not.toContainText('another private thought');
  await page.evaluate(() => window.__finishThinking());
  await expect(bubble).toContainText('The final answer.');
  await expect(bubble.locator('.thinking-status')).toHaveCount(0);
  await expect(bubble.locator('.turn-activity-surface')).toHaveCount(0);
  await expect(bubble).not.toContainText('private');
  await expect(page.locator('[data-thinking-panel], #thinkingPanelReactRoot, #summaryBtn')).toHaveCount(0);
});

test('tool status owns live progress without a duplicate activity list', async ({ page }) => {
  const bubble = await startTurn(page);
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [{ id: 'search-inline', name: 'web_search', input: { query: 'public query' } }]));
  const row = bubble.locator('.tool-inline[data-tcid="search-inline"]');
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(bubble.locator('.thinking-status')).toHaveCount(1);
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
  await expect(bubble.locator('.thinking-status-label')).toHaveText('Searching "public query"…');
  await bubble.locator('.thinking-accordion-toggle').click();
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', { id: 'search-inline', name: 'web_search', ok: true, output: 'Found a source', results: [{ title: 'Source', url: 'https://example.test' }], status: 'completed' }));
  await expect(row).toHaveAttribute('data-state', 'done');
  // Native disclosure keyboard interaction still opens the execution detail.
  await row.locator(':scope > summary').focus();
  await page.keyboard.press('Enter');
  await expect(row.locator(':scope > summary')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.tool-inline-src')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(row.locator(':scope > summary')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.__finishThinking());
});

test('parallel tools keep their order, DOM identity, and open details as later calls settle', async ({ page }) => {
  const bubble = await startTurn(page, false);
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [
    { id: 'first-slow', name: 'Read', input: { file_path: 'slow.ts' } },
    { id: 'second-fast', name: 'web_search', input: { query: 'fast source' } },
  ]));
  await bubble.locator('.thinking-accordion-toggle').click();
  const first = bubble.locator('[data-tcid="first-slow"]');
  const trigger = first.locator(':scope > summary');
  await expect(first).toBeVisible();
  await trigger.click();
  const handle = await first.elementHandle();
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', {
    id: 'second-fast', name: 'web_search', ok: true, status: 'completed', output: 'Found source',
    results: [{ title: 'Source', url: 'https://example.test/fast' }],
  }));
  await expect(bubble.locator('[data-tcid="second-fast"]')).toHaveAttribute('data-state', 'done');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(await page.evaluate((node) => node === document.querySelector('[data-tcid="first-slow"]'), handle)).toBe(true);
  expect(await bubble.locator('.tool-inline').evaluateAll((nodes) => nodes.map((node) => node.dataset.tcid))).toEqual(['first-slow', 'second-fast']);
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', { id: 'first-slow', name: 'Read', ok: true, status: 'completed', output: 'export const value = 1;' }));
  await expect(first).toHaveAttribute('data-state', 'done');
  expect(await page.evaluate((node) => node === document.querySelector('[data-tcid="first-slow"]'), handle)).toBe(true);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => window.__finishPlain());
});

test('a task preview does not leave a thought header on a plain answer', async ({ page }) => {
  const bubble = await startTurn(page, false);
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing an answer.', phase: 'initial' }));
  await expect(bubble.locator('.turn-activity-intent')).toHaveText('Preparing an answer.');
  await page.evaluate(() => window.__finishPlain());
  await expect(bubble).toContainText('A direct answer.');
  await expect(bubble.locator('.turn-summary')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  for (const mobile of [false, true]) {
    test(`ChatGPT activity hierarchy: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const lead = '修复已经触发新一轮检查。我会继续查看构建步骤和日志。';
      const tail = '前端构建已经通过，接下来确认完整单元测试和端到端检查的结果。';
      const longQuery = '检查 GitHub Actions 主工作流运行任务及完整测试日志，确认失败步骤和分支状态';
      await boot(page, [
        { clientId: 'user-example', role: 'user', rawText: '继续检查 CI 的运行情况。' },
        {
          clientId: 'answer-example', role: 'assistant', rawText: lead + '\n\n' + tail,
          reasoningContent: 'private reasoning', summary: '检查 CI 工作流运行任务',
          toolCalls: [
            { id: 'github-jobs', name: 'oc_github_list_workflow_run_jobs', input: { run_id: 42 }, output: 'Build passed', status: 'completed', textOffset: lead.length + 2 },
            { id: 'github-logs', name: 'oc_github_get_job_logs', input: { job_id: 43 }, output: 'All checks passed', status: 'completed', textOffset: lead.length + 2 },
            { id: 'search-example', name: 'web_search', input: { query: longQuery }, status: 'completed', textOffset: lead.length + 2, results: [{ title: '工作流说明', url: 'https://example.test/guide' }] },
          ],
        },
      ], { theme, lang: 'zh' });
      await expect(page).toHaveTitle(/Socrates/i);
      expect(new URL(page.url()).pathname).toBe('/');
      const bubble = page.locator('.msg.assistant').last();
      const process = bubble.locator('.thinking-accordion-toggle');
      await expect(bubble.locator('.turn-summary-text')).toHaveCount(0);
      await process.click();
      await page.mouse.move(0, 0);
      await expect(process).toBeVisible();
      await expect(bubble).not.toContainText('private reasoning');
      await expect(bubble.locator('.tool-run-summary, .turn-summary > summary')).toHaveCount(0);
      await expect(bubble.locator('.tool-inline')).toHaveCount(3);
      for (const row of await bubble.locator('.tool-inline').all()) {
        await expect(row).toBeVisible();
        await expect(row.locator(':scope > summary')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      }
      const brand = bubble.locator('[data-tcid="github-jobs"] .is-connector-brand svg');
      await expect(brand).toBeVisible();
      await expect(bubble.locator('[data-tcid="github-jobs"] .tool-inline-label')).toHaveText('检查 GitHub Actions 工作流步骤');
      const tool = bubble.locator('[data-tcid="search-example"]');
      const label = tool.locator('.tool-inline-label');
      await expect(label).toHaveText('已搜索「' + longQuery + '」');
      const type = await label.evaluate((node) => ({ size: getComputedStyle(node).fontSize, color: getComputedStyle(node).color, whiteSpace: getComputedStyle(node).whiteSpace, height: node.getBoundingClientRect().height }));
      await expect(process).toHaveCSS('font-size', type.size);
      expect(parseFloat(type.size)).toBe(14);
      expect(type.whiteSpace).toBe('normal');
      await expect(process).toHaveCSS('font-weight', '500');
      if (mobile) expect(type.height).toBeGreaterThan(30);
      const overflow = await bubble.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await bubble.scrollIntoViewIfNeeded();
      if (mobile && theme === 'light') await page.screenshot({ path: 'test-results/activity-reference-mobile-light.png' });
      else if (mobile) await page.screenshot({ path: 'test-results/activity-reference-mobile-dark.png' });
      else if (theme === 'light') await page.screenshot({ path: 'test-results/activity-reference-desktop-light.png' });
      else await page.screenshot({ path: 'test-results/activity-reference-desktop-dark.png' });
      await tool.locator(':scope > summary').click();
      await expect(tool.locator('.tool-inline-src')).toBeVisible();
      await expect(tool.locator(':scope > summary')).toHaveAttribute('aria-expanded', 'true');
      await expect(process).toBeVisible();
      await expect(page.locator('.tool-run-sheet, [data-thinking-panel], vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
