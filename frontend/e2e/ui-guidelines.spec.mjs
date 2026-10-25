import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const nodes = [
  { id: 'plan', type: 'panel', title: '把复杂的问题拆成每天都能完成的小步骤', state: { hours: 2 } },
  { id: 'hours', type: 'slider', parent: 'plan', label: '每日学习时长', bind: 'hours', min: 1, max: 6, step: 1 },
  ...Array.from({ length: 6 }, (_, index) => ({ id: `step-${index}`, type: 'text', parent: 'plan', text: `第 ${index + 1} 步：先回顾概念，再通过练习检验理解。给自己留一点思考的时间。` })),
];
const answer = ['## 从一个小问题开始', '', '读懂概念，再逐步练习。', '', '```socrates-ui', ...nodes.map((node) => JSON.stringify(node)), '```'].join('\n');

for (const theme of ['light', 'dark']) for (const size of ['desktop', 'mobile']) {
  test(`result controls disclose progressively without nested scrolling: ${theme}, ${size}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
    await prepareChatWorkbench(page, { lang: 'zh', viewport: WORKBENCH_VIEWPORTS[size], messages: [
      { clientId: 'guidelines-answer', role: 'assistant', type: 'assistant', rawText: answer },
    ] });
    const result = page.locator('.intui-surface-shell');
    await expect(result).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Presentation settings stay out of the primary reading path.
    await expect(result.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
    const options = result.getByRole('button', { name: '展示模式', exact: true });
    const expand = result.locator('.intui-surface-expand');
    for (const control of [options, expand]) {
      const box = await control.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(size === 'mobile' ? 44 : 32);
      expect(box.height).toBeGreaterThanOrEqual(size === 'mobile' ? 44 : 32);
    }
    await options.focus();
    await options.press('Enter');
    const inline = page.getByRole('menuitemradio', { name: '内嵌', exact: true });
    const compact = page.getByRole('menuitemradio', { name: '紧凑', exact: true });
    await expect(inline).toBeFocused();
    await expect(inline).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(compact).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(result).toHaveAttribute('data-display-mode', 'compact');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(options).toBeFocused();
    const geometry = await result.locator('.intui-surface-document').evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      overflow: getComputedStyle(node).overflowY,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(geometry.height).toBeGreaterThan(288);
    expect(geometry.overflow).toBe('visible');
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    // The last step is reachable through the transcript's own scrollbar.
    const lastStep = result.locator('[data-intui-id="step-5"]');
    await lastStep.scrollIntoViewIfNeeded();
    await expect(lastStep).toBeInViewport();
    const lastBox = await lastStep.boundingBox();
    const composerBox = await page.locator('.composer-shell').boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(composerBox.y + 1);
    await options.click();
    await expect(compact).toBeFocused();
    await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `test-results/ui-guidelines-menu-${encodeURIComponent(theme)}-${encodeURIComponent(size)}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(options).toBeFocused();
    await expand.click();
    await expect(result).toHaveAttribute('data-display-mode', 'fullscreen');
    await page.keyboard.press('Escape');
    await expect(result).toHaveAttribute('data-display-mode', 'compact');
    await expect(expand).toBeFocused();
    await expect(result.getByRole('slider', { name: '每日学习时长' })).toHaveValue('2');
    await page.screenshot({ path: `test-results/ui-guidelines-${encodeURIComponent(theme)}-${encodeURIComponent(size)}.png` });
  });
}

for (const size of ['desktop', 'mobile']) {
  test(`card actions keep one primary CTA and retain overflow actions: ${size}`, async ({ page }) => {
    const actions = [
      { id: 'plan', type: 'panel', title: 'A useful learning plan', description: 'Adjust the plan, then save your changes.', state: { count: 2 } },
      { id: 'save', type: 'button', parent: 'plan', label: 'Save plan', primary: true, action: { type: 'increment', key: 'count', amount: 1 } },
      { id: 'count', type: 'metric', parent: 'plan', label: 'Study sessions', value: { state: 'count' } },
      { id: 'reset', type: 'button', parent: 'plan', label: 'Reset plan', action: { type: 'set', key: 'count', value: 2 } },
      { id: 'two', type: 'button', parent: 'plan', label: 'Add two sessions', action: { type: 'increment', key: 'count', amount: 2 } },
      { id: 'three', type: 'button', parent: 'plan', label: 'Add three sessions', action: { type: 'increment', key: 'count', amount: 3 } },
    ];
    const rawText = ['```socrates-ui', ...actions.map((node) => JSON.stringify(node)), '```'].join('\n');
    await prepareChatWorkbench(page, { viewport: WORKBENCH_VIEWPORTS[size], messages: [
      { clientId: 'action-plan', role: 'assistant', type: 'assistant', rawText },
    ] });
    const card = page.locator('.intui-surface-shell');
    const footer = card.locator('.intui-panel-actions');
    const metric = card.locator('[data-intui-id="count"]');
    await expect(card.getByRole('heading', { name: 'A useful learning plan', exact: true })).toHaveCount(1);
    await expect(footer.locator('.intui-button')).toHaveCount(2);
    await expect(footer.locator('.intui-button.is-primary')).toHaveCount(1);
    const metricBox = await metric.boundingBox();
    const footerBox = await footer.boundingBox();
    expect(footerBox.y).toBeGreaterThanOrEqual(metricBox.y + metricBox.height);
    await footer.getByRole('button', { name: 'Save plan', exact: true }).click();
    await expect(metric).toContainText('3');
    await footer.locator('.intui-panel-more').click();
    await page.getByRole('menuitem', { name: 'Add two sessions', exact: true }).click();
    await expect(metric).toContainText('5');
    await expect(page.getByRole('menu')).toBeHidden();
    await footer.getByRole('button', { name: 'Reset plan', exact: true }).click();
    await expect(metric).toContainText('2');
    const send = page.locator('#composerPrimaryBtn');
    const editor = page.locator('#composerRoot .rich-composer-editor');
    await expect(send).toBeDisabled();
    const disabledOpacity = await send.evaluate((node) => Number(getComputedStyle(node).opacity));
    await editor.fill('Help me refine this plan.');
    await expect(send).toBeEnabled();
    expect(await send.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(disabledOpacity);
    await page.screenshot({ path: `test-results/ui-detail-actions-${encodeURIComponent(size)}.png` });
  });
}
