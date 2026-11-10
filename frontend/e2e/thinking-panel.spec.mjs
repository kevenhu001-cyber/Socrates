import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { TURN, openActivity, toolRow, toolRowButton } from './_turn-ui.mjs';

async function installStream(page, immediate = true) {
  await page.evaluate((immediate) => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    let ref;
    window.__thinkingStreamReady = false;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const body = new ReadableStream({ start(controller) {
        ref = controller;
        window.__thinkingStreamReady = true;
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
  await page.waitForFunction(() => window.__thinkingStreamReady === true, null, { timeout: 15_000 });
  return page.locator('.msg.assistant').last();
}

test('intent stays in the unified activity and completed observations do not duplicate the answer', async ({ page }) => {
  const bubble = await startTurn(page);
  await expect(bubble.locator(TURN.surface)).toHaveCount(1);
  await expect(bubble.locator(TURN.label)).toHaveAttribute('role', 'status');
  await expect(bubble.locator(TURN.label)).toHaveText('Thinking…');
  await expect(bubble.locator(TURN.indicator)).toBeVisible();
  await expect(bubble.locator(TURN.spinner)).toHaveCount(0);
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing the comparison.', phase: 'initial' }));
  const toggle = bubble.locator(TURN.toggle);
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(bubble.locator(TURN.stepTitle).first()).toHaveText('Preparing the comparison.');
  await expect(bubble.locator(TURN.stepTitle).first()).toBeVisible();
  await page.evaluate(() => window.__pushThinkingFrame('', { choices: [{ delta: { reasoning_content: 'another private thought' } }] }));
  await expect(bubble).not.toContainText('another private thought');
  await page.evaluate(() => window.__finishThinking());
  await expect(bubble).toContainText('The final answer.');
  /* Settled: no spinner, no live status role, no live surface. */
  await expect(bubble.locator(TURN.spinner)).toHaveCount(0);
  await expect(bubble.locator(`${TURN.label}[role="status"]`)).toHaveCount(0);
  await expect(bubble.locator(`${TURN.wrapper}[data-live="true"]`)).toHaveCount(0);
  await expect(bubble).not.toContainText('private');
  await expect(page.locator('[data-thinking-panel], #thinkingPanelReactRoot, #summaryBtn')).toHaveCount(0);
});

test('the running tool names itself on its row, and its detail opens inline', async ({ page }) => {
  const bubble = await startTurn(page);
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [{ id: 'search-inline', name: 'web_search', input: { query: 'public query' } }]));
  const row = toolRow(bubble, 'search-inline');
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(bubble.locator(TURN.surface)).toHaveCount(1);
  await expect(bubble.locator('.stream-cursor')).toHaveCount(0);
  /* The collapsed header names the action; time is secondary metadata. */
  await expect(bubble.locator(TURN.label)).toContainText('public query');
  await expect(bubble.locator(TURN.duration)).toContainText(/\d/);
  await expect(bubble.locator(TURN.duration)).toHaveAttribute('aria-live', 'off');
  await expect(row.locator(TURN.spinner)).toHaveCount(1);
  await openActivity(bubble);
  await expect(toolRowButton(bubble, 'search-inline')).toContainText('public query');
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', { id: 'search-inline', name: 'web_search', ok: true, output: 'Found a source', results: [{ title: 'Source', url: 'https://example.test' }], status: 'completed' }));
  await expect(row).toHaveAttribute('data-state', 'done');
  // Keyboard: the row is a button that opens the call's detail inline.
  const trigger = toolRowButton(bubble, 'search-inline');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const detail = page.locator(TURN.detail);
  await expect(detail).toBeVisible();
  await expect(detail.locator(TURN.source)).toBeVisible();
  await expect(detail.locator(TURN.sourceTitle)).toHaveText('Source');
  await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0);
  await page.evaluate(() => window.__finishThinking());
});

test('parallel tools keep their order, DOM identity, and open details as later calls settle', async ({ page }) => {
  const bubble = await startTurn(page, false);
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [
    { id: 'first-slow', name: 'Read', input: { file_path: 'slow.ts' } },
    { id: 'second-fast', name: 'web_search', input: { query: 'fast source' } },
  ]));
  await openActivity(bubble);
  const first = toolRow(bubble, 'first-slow');
  await expect(first).toBeVisible();
  const handle = await first.elementHandle();
  await toolRowButton(bubble, 'first-slow').click();
  const detail = page.locator(TURN.detail);
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-testid="tool-detail-section-input"]')).toContainText('slow.ts');
  const detailHandle = await detail.elementHandle();
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', {
    id: 'second-fast', name: 'web_search', ok: true, status: 'completed', output: 'Found source',
    results: [{ title: 'Source', url: 'https://example.test/fast' }],
  }));
  await expect(toolRow(bubble, 'second-fast')).toHaveAttribute('data-state', 'done');
  /* A sibling settling neither closes nor remounts the open panel. */
  await expect(detail).toBeVisible();
  expect(await page.evaluate((node) => node === document.querySelector('[data-testid="tool-detail"]'), detailHandle)).toBe(true);
  expect(await page.evaluate((node) => node === document.querySelector('.rn-tool-row[data-tcid="first-slow"]'), handle)).toBe(true);
  expect(await bubble.locator(TURN.row).evaluateAll((nodes) => nodes.map((node) => node.dataset.tcid))).toEqual(['first-slow', 'second-fast']);
  await page.evaluate(() => window.__pushThinkingFrame('tool_result', { id: 'first-slow', name: 'Read', ok: true, status: 'completed', output: 'export const value = 1;' }));
  await expect(first).toHaveAttribute('data-state', 'done');
  expect(await page.evaluate((node) => node === document.querySelector('.rn-tool-row[data-tcid="first-slow"]'), handle)).toBe(true);
  expect(await page.evaluate((node) => node === document.querySelector('[data-testid="tool-detail"]'), detailHandle)).toBe(true);
  await expect(detail.locator(TURN.codeOutput).filter({ hasText: 'export const value = 1;' })).toBeVisible();
  await expect(page.locator(TURN.detail)).toHaveCount(1);
  await page.evaluate(() => window.__finishPlain());
});

test('a task preview does not leave a thought header on a plain answer', async ({ page }) => {
  const bubble = await startTurn(page, false);
  await page.evaluate(() => window.__pushThinkingFrame('turn_summary', { summary: 'Preparing an answer.', phase: 'initial' }));
  await openActivity(bubble);
  await expect(bubble.locator(TURN.stepTitle).first()).toHaveText('Preparing an answer.');
  await page.evaluate(() => window.__finishPlain());
  await expect(bubble).toContainText('A direct answer.');
  await expect(bubble.locator(TURN.surface)).toHaveCount(0);
});

test('a long public summary has a short disclosure title, without repeating the body', async ({ page }) => {
  const bubble = await startTurn(page);
  const text = 'Comparing the assumptions across the official specifications and independently checking the numerical results';
  await page.evaluate((text) => window.__pushThinkingFrame('turn_activity', { type: 'public_reasoning_summary', text }), text);
  await openActivity(bubble);
  const step = bubble.locator(TURN.step).first();
  await expect(step).toHaveText('Activity summary');
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(bubble.locator(TURN.stepSummary)).toHaveText(text);
  await expect(bubble.locator(TURN.stepSummary)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(bubble.locator(TURN.stepSummary)).toHaveCount(0);
  await page.evaluate(() => window.__finishThinking());
});

for (const theme of ['light', 'dark']) {
  for (const mobile of [false, true]) {
    test(`activity rail hierarchy: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
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
      const process = bubble.locator(TURN.toggle);
      await expect(process).toHaveAttribute('aria-expanded', 'false');
      await expect(bubble.locator(TURN.label)).toHaveText('使用了 3 个工具');
      await process.hover();
      const headerBounds = await process.boundingBox();
      const surfaceBounds = await bubble.locator(TURN.surface).boundingBox();
      expect(headerBounds.width).toBeLessThan(surfaceBounds.width);
      expect(headerBounds.height).toBeGreaterThanOrEqual(mobile ? 44 : 32);
      await process.click();
      await page.mouse.move(0, 0);
      await expect(process).toBeVisible();
      await expect(bubble).not.toContainText('private reasoning');
      /* Every call is one row: no aggregate group header to open first. */
      await page.mouse.move(0, 0);
      await expect(bubble.locator(TURN.row)).toHaveCount(3);
      const rail = bubble.getByTestId('thinking-timeline');
      await expect(rail).toHaveCSS('border-left-width', '1px');
      expect(await rail.evaluate((node) => getComputedStyle(node).borderLeftColor)).not.toBe('rgba(0, 0, 0, 0)');
      for (const row of await bubble.locator(`${TURN.row} [data-testid^="tool-row-"][role="button"]`).all()) {
        await expect(row).toBeVisible();
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      }
      const brand = toolRow(bubble, 'github-jobs').locator('.is-connector-brand svg');
      await expect(brand).toBeVisible();
      const tool = toolRow(bubble, 'search-example');
      /* The object is clipped to one line; the full query lives in the panel. */
      const label = tool.locator(TURN.stepTitle);
      await expect(label).toHaveText(/检查 GitHub Actions/);
      const labelType = await label.evaluate((node) => ({ size: getComputedStyle(node).fontSize, lineHeight: getComputedStyle(node).lineHeight }));
      const headerSize = await bubble.locator(TURN.label).evaluate((node) => getComputedStyle(node).fontSize);
      expect(labelType.size).toBe(headerSize);
      expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 || getComputedStyle(node).textOverflow === 'ellipsis')).toBe(true);
      /* Rows sit inside the column; a long object may not push the surface. */
      const overflow = await bubble.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await bubble.scrollIntoViewIfNeeded();
      if (mobile && theme === 'light') await page.screenshot({ path: 'test-results/activity-reference-mobile-light.png' });
      else if (mobile) await page.screenshot({ path: 'test-results/activity-reference-mobile-dark.png' });
      else if (theme === 'light') await page.screenshot({ path: 'test-results/activity-reference-desktop-light.png' });
      else await page.screenshot({ path: 'test-results/activity-reference-desktop-dark.png' });
      await toolRowButton(bubble, 'search-example').click();
      const detail = page.locator(TURN.detail);
      await expect(detail).toBeVisible();
      await expect(detail.locator('[data-testid="tool-detail-section-input"]')).toContainText(longQuery.slice(0, 20));
      await expect(detail.locator(TURN.source)).toBeVisible();
      expect(await bubble.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      await bubble.screenshot({ path: `test-results/activity-detail-${encodeURIComponent(mobile ? 'mobile' : 'desktop')}-${encodeURIComponent(theme)}.png` });
      await expect(page.locator('.tool-run-sheet, [data-thinking-panel], vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

test('the live caption shimmers and the sphere turns, both respecting reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const bubble = await startTurn(page);
  /* The caption's own sweep: a light band crosses the glyphs while the turn
     runs. It is one element's background-position — no JS. */
  const label = bubble.locator(TURN.label);
  await expect.poll(() => label.evaluate((el) => getComputedStyle(el).animationName)).toBe('ui-shimmer-sweep');
  await page.screenshot({ path: 'test-results/thinking-text-shimmer.png' });
  /* The working glyph ahead of the caption: twelve dots on a sphere, driven
     by the Web Animations API so the turn runs on the compositor. */
  const spark = bubble.locator(TURN.indicator);
  await expect(spark).toHaveCount(1);
  const dots = spark.locator('.thinking-spark-dot');
  await expect(dots).toHaveCount(12);
  const motion = await dots.evaluateAll((nodes) => nodes.map((n) => n.getAnimations()
    .filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation))
    .map((a) => ({ state: a.playState, iterations: a.effect.getTiming().iterations }))));
  expect(motion).toHaveLength(12);
  for (const list of motion) expect(list).toEqual([{ state: 'running', iterations: Infinity }]);
  /* Reduced motion freezes both: the shimmer stops and the sphere holds one
     still frame instead of turning. */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  expect(await label.evaluate((el) => getComputedStyle(el).animationName)).not.toBe('ui-shimmer-sweep');
  await expect(spark.locator('.thinking-spark')).toHaveAttribute('data-motion', 'static');
  const still = await dots.evaluateAll((nodes) => nodes.map((n) => n.getAnimations()
    .filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length));
  expect(still.reduce((sum, n) => sum + n, 0)).toBe(0);
  await page.evaluate(() => window.__finishPlain());
});

test('the running row spins on the compositor and stops when the turn settles', async ({ page }) => {
  const bubble = await startTurn(page);
  await page.evaluate(() => window.__pushThinkingFrame('tool_use', [{ id: 'spinning-tool', name: 'web_search', input: { query: 'motion' } }]));
  await openActivity(bubble);
  const spinner = bubble.locator(TURN.spinner);
  await expect(spinner).toHaveCount(1);
  const transform = () => spinner.evaluate((el) => {
    const computed = getComputedStyle(el).transform;
    return computed && computed !== 'none' ? computed : el.style.transform;
  });
  const first = await transform();
  await expect.poll(transform, { timeout: 5_000 }).not.toBe(first);
  // Reduced motion freezes the arc instead of stopping mid-turn.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const frozen = await transform();
  await page.waitForTimeout(400);
  expect(await transform()).toBe(frozen);
  await page.evaluate(() => {
    window.__pushThinkingFrame('tool_result', { id: 'spinning-tool', name: 'web_search', ok: true, status: 'completed', output: 'Done.' });
    window.__finishPlain();
  });
  await expect(bubble.locator(TURN.spinner)).toHaveCount(0);
  await expect(bubble.locator(TURN.indicator)).toHaveCount(0);
  await expect(bubble.locator(TURN.label)).toHaveText('Used 1 tool');
});
