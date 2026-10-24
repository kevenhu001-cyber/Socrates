import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

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
    const surface = page.locator('.thinking-accordion');
    const toggle = surface.locator('.thinking-accordion-toggle');
    const body = surface.locator('.thinking-accordion-body');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(() => body.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(mobile ? 44 : 32);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(surface.locator('.tool-inline')).toBeVisible();
    for (let i = 0; i < 4; i++) await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect.poll(() => body.evaluate((node) => node.getBoundingClientRect().height)).toBe(0);
    await expect(body).toHaveAttribute('inert', '');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toggle.click();
    for (const target of [body, surface.locator('.thinking-accordion-chev')]) {
      expect(await target.evaluate((node) => Math.max(...getComputedStyle(node).transitionDuration.split(',').map(parseFloat)))).toBeLessThanOrEqual(0.001);
    }
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
    await page.locator('.thinking-accordion-toggle').click();
    const row = page.locator('[data-tcid="output-polish"]');
    await row.locator(':scope > summary').click();
    const copy = row.locator('.tool-inline-detail-actions .tool-inline-action').last();
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
    const surface = page.locator('.thinking-accordion');
    const caption = surface.locator('.thinking-status-label');
    await expect(surface).toHaveAttribute('data-live', 'true');
    await expect(caption).toHaveCSS('animation-name', 'ui-activity-breathe');
    await expect(surface.locator('.turn-activity-dot')).toHaveCount(0);
    await expect(surface.locator('.thinking-accordion-left > .tool-inline-tool-icon')).toBeVisible();
    await page.mouse.move(0, 0);
    if (mobile) await page.screenshot({ path: 'test-results/activity-polish-live-mobile.png' });
    else await page.screenshot({ path: 'test-results/activity-polish-live-desktop.png' });
    await surface.locator('.thinking-accordion-toggle').click();
    await expect(surface.locator('.thinking-accordion-text')).toBeVisible();
    const summary = await surface.locator('.thinking-accordion-text').boundingBox();
    const surfaceBox = await surface.boundingBox();
    expect(summary.x - surfaceBox.x).toBeLessThanOrEqual(20);
    await page.evaluate(() => {
      const messages = window.stateStore.read('messages').map((entry) => entry.role === 'assistant' ? {
        ...entry, type: 'assistant', _streamSettled: true,
        toolCalls: entry.toolCalls.map((call) => ({ ...call, status: 'completed', output: '已完成资料核对。' })),
      } : entry);
      window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
      window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'reference-complete' });
    });
    await expect(surface).not.toHaveAttribute('data-live', 'true');
    await expect(caption).toHaveCSS('animation-name', 'none');
    await expect(surface.locator('.thinking-accordion-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(0, 0);
    if (mobile) await page.screenshot({ path: 'test-results/activity-polish-complete-mobile.png', animations: 'disabled' });
    else await page.screenshot({ path: 'test-results/activity-polish-complete-desktop.png', animations: 'disabled' });
  });
}
