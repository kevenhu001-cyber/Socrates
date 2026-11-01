import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { publishChatRuntime } from './_lib.mjs';
import { TURN, openToolDetail, toolRow } from './_turn-ui.mjs';

const message = {
  clientId: 'activity-polish', role: 'assistant', rawText: 'The comparison is ready.',
  _activity: { type: 'public_reasoning_summary', text: 'Compared the original sources and checked the result.' },
  toolCalls: [{
    id: 'output-polish', name: 'Read', input: { file_path: 'comparison.txt' },
    output: 'A concise comparison from the original sources.', status: 'completed', textOffset: 0,
  }],
};

for (const mobile of [false, true]) {
  test(`activity disclosure settles without hidden space or overflow (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepareChatWorkbench(page, { messages: [message], viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    const surface = page.locator(TURN.surface);
    const toggle = surface.locator(TURN.toggle);
    const body = surface.locator(TURN.body);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => body.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(32);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toolRow(surface, 'output-polish')).toBeVisible();
    for (let i = 0; i < 4; i++) await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect.poll(() => body.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
    /* Collapsed content leaves the accessibility tree (was `inert`). */
    await expect(body).toHaveAttribute('aria-hidden', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    /* RNW reports the media change asynchronously; let it reach the RN
       reduced-motion hook before the toggle is pressed. */
    await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await toggle.click();
    /* Reduced motion: the body is fully shown on the first frame, no reveal. */
    expect(await body.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const fallback of ['native', 'success', 'failure', 'throws']) {
  test(`tool copy reports the actual clipboard result (${fallback})`, async ({ page }) => {
    await prepareChatWorkbench(page, { messages: [message] });
    await page.evaluate((fallback) => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { if (fallback !== 'native') throw new Error('Clipboard denied'); },
      } });
      document.execCommand = () => {
        if (fallback === 'throws') throw new Error('Fallback denied');
        return fallback === 'success';
      };
    }, fallback);
    const detail = await openToolDetail(page, page.locator('.msg.assistant').last(), 'output-polish');
    const copy = detail.locator(TURN.codeCopy).last();
    await copy.focus();
    await copy.click();
    await expect(copy).toHaveText(['native', 'success'].includes(fallback) ? 'Copied' : 'Copy failed');
    await expect(copy).toBeFocused();
    await expect(page.locator('body > textarea')).toHaveCount(0);
    await expect(copy).toHaveText('Copy');
  });
}

for (const mobile of [false, true]) {
  test(`reference activity caption is quiet and stops animating on completion (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
    const lead = '我会先核对官方发布页与原始资料，再按相同口径整理对比结果。';
    await prepareChatWorkbench(page, { lang: 'zh', viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, messages: [
      { clientId: 'reference-question', role: 'user', rawText: '帮我比较几种模型，并核对原始资料。' },
      { ...message, type: 'streaming', _streamSettled: false, rawText: lead + '\n\n',
        _activity: { type: 'public_reasoning_summary', text: '核对官方发布信息，统一比较口径。' },
        toolCalls: [{ id: 'reference-search', name: 'web_search', input: { query: '模型官方发布与评测说明' }, textOffset: lead.length + 2 }],
      },
    ] });
    const wrapper = page.locator(TURN.wrapper);
    const surface = page.locator(TURN.surface);
    const caption = surface.locator(TURN.label);
    await expect(wrapper).toHaveAttribute('data-live', 'true');
    await expect(caption).toHaveAttribute('role', 'status');
    await expect(surface.locator(TURN.progress)).toHaveCount(1);
    /* Status is spoken as words: no status dots anywhere in the activity. */
    await expect(surface.locator('.turn-activity-dot')).toHaveCount(0);
    await expect(surface.locator(`${TURN.toggle} .tool-inline-tool-icon`)).toBeVisible();
    await page.mouse.move(0, 0);
    if (mobile) await page.screenshot({ path: 'test-results/activity-polish-live-mobile.png' });
    else await page.screenshot({ path: 'test-results/activity-polish-live-desktop.png' });
    await surface.locator(TURN.toggle).click();
    const step = surface.locator(TURN.step).first();
    await expect(step).toBeVisible();
    const summary = await step.boundingBox();
    const surfaceBox = await surface.boundingBox();
    /* Shallow indent only: the timeline's 4px inset + 1px rail + 16px gap
       (21px) is the whole offset; no nested card padding on top of it. */
    expect(summary.x - surfaceBox.x).toBeLessThanOrEqual(24);
    await page.evaluate(() => {
      const messages = window.stateStore.read('messages').map((entry) => entry.role === 'assistant' ? {
        ...entry, type: 'assistant', _streamSettled: true,
        toolCalls: entry.toolCalls.map((call) => ({ ...call, status: 'completed', output: '已完成资料核对。' })),
      } : entry);
      window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
    });
    await publishChatRuntime(page, { type: 'state-synced', reason: 'reference-complete' });
    await expect(wrapper).not.toHaveAttribute('data-live', 'true');
    await expect(surface.locator(TURN.progress)).toHaveCount(0);
    await expect(caption).not.toHaveAttribute('role', 'status');
    await expect(surface.locator(TURN.toggle)).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(0, 0);
    if (mobile) await page.screenshot({ path: 'test-results/activity-polish-complete-mobile.png', animations: 'disabled' });
    else await page.screenshot({ path: 'test-results/activity-polish-complete-desktop.png', animations: 'disabled' });
  });
}
