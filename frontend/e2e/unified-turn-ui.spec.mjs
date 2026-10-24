import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const nodes = [
  { id: 'panel', type: 'panel', title: 'Estimate', state: { count: 2 } },
  { id: 'count', type: 'metric', parent: 'panel', label: 'Count', value: { state: 'count' } },
  { id: 'add', type: 'button', parent: 'panel', label: 'Add one', action: { type: 'increment', key: 'count', amount: 1 } },
  { id: 'tabs', type: 'tabs', parent: 'panel', tabs: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }] },
  { id: 'first-text', type: 'text', parent: 'tabs', tab: 'first', text: 'First view' },
  { id: 'second-text', type: 'text', parent: 'tabs', tab: 'second', text: 'Second view' },
];
const message = {
  clientId: 'unified-ui', role: 'assistant', rawText: 'The answer stays the primary content.',
  summary: 'An observation that should not duplicate the answer.',
  toolCalls: [{ id: 'ui', name: 'render_intelligent_ui', status: 'completed', textOffset: 0, input: { version: 1, nodes } }],
  turnRuntime: { version: 1, turnId: 'unified-ui', seq: 1, lifecycle: 'done', generation: 'done', uiSurfaces: [], activities: [
    { id: 'public', kind: 'reasoning_summary', text: 'Checked the assumptions.', phase: 'done', startedAt: 100, endedAt: 12100 },
  ] },
};

test('one process disclosure contains public summaries and tools while results stay visible', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message] });
  const activity = page.locator('.turn-activity-surface');
  await expect(activity).toHaveCount(1);
  await expect(page.locator('.turn-summary')).toHaveCount(0);
  await expect(activity.locator('button').first()).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.intui')).toBeVisible();
  const widths = await page.locator('.intui').evaluate((node) => ({ ui: node.clientWidth, host: node.parentElement.clientWidth }));
  expect(widths.ui).toBeGreaterThan(widths.host * .9);
  await expect(page.locator('.tool-run-prose')).toContainText(message.rawText);
  await expect(page.locator('.msg-body')).not.toContainText(message.summary);
  await activity.locator('button').first().click();
  await expect(activity.getByText('Checked the assumptions.')).toBeVisible();
  await expect(activity.locator('.tool-inline')).toBeVisible();
  const type = await activity.locator('.tool-inline-label').evaluate((node) => ({ size: getComputedStyle(node).fontSize, line: parseFloat(getComputedStyle(node).lineHeight) }));
  expect(type.size).toBe('14px');
  expect(type.line).toBeCloseTo(20, 0);
  await activity.locator('button').first().click();
  await expect(page.locator('.intui')).toBeVisible();
  await expect(activity.locator('.thinking-accordion-body')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: 'test-results/unified-turn-desktop.png' });
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} toolbar keeps secondary actions in a keyboard accessible overflow`, async ({ page }) => {
    await prepareChatWorkbench(page, { messages: [message], viewport: mobile ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop });
    const toolbar = page.locator('.msg-toolbar[data-role="assistant"]');
    await expect(toolbar.locator(':scope > button')).toHaveCount(3);
    await expect(toolbar.getByRole('button', { name: 'Helpful', exact: true })).toHaveCount(mobile ? 0 : 1);
    const more = toolbar.getByRole('button', { name: 'More actions', exact: true });
    await more.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(mobile ? 6 : 4);
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    // The overflow menu opens toward the free space, and on a bottom-anchored
    // transcript that is over the tail of the message it belongs to. Dismiss
    // with a press outside the menu: the composer editor.
    const editor = page.locator('#composerRoot .rich-composer-editor');
    await editor.click();
    await expect(menu).toBeHidden();
    await expect(editor).toBeFocused();
    if (mobile) await page.screenshot({ path: 'test-results/unified-turn-mobile.png' });
  });
}

test('display modes preserve node identity, edited values and tabs across fullscreen', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message] });
  const shell = page.locator('.intui-surface-shell');
  const count = page.locator('[data-intui-id="count"]');
  await page.getByRole('button', { name: 'Add one', exact: true }).click();
  await expect(count).toContainText('3');
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await count.evaluate((node) => { window.__originalMetricNode = node; });
  for (const mode of ['compact', 'carousel', 'pip', 'inline']) {
    await shell.locator('select').selectOption(mode);
    await expect(shell).toHaveAttribute('data-display-mode', mode);
    await expect(count).toContainText('3');
  }
  const expand = shell.locator('.intui-surface-toolbar > button').first();
  await expand.click();
  await expect(shell).toHaveAttribute('data-display-mode', 'fullscreen');
  expect(await shell.evaluate((node) => node.matches(':modal'))).toBe(true);
  await expect(page.getByRole('tab', { name: 'Second', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Second view', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/intelligent-ui-fullscreen.png' });
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-display-mode', 'inline');
  await expect(expand).toBeFocused();
  expect(await count.evaluate((node) => node === window.__originalMetricNode)).toBe(true);
  await expect(count).toContainText('3');
});

test('a live turn has one text highlight and reduced motion disables it', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Check assumptions.' });
    window.__unifiedController = ctl;
    ctl.recordTurnActivity({ type: 'public_reasoning_summary', text: 'Compared the official specifications.' });
    ctl.recordToolUse({ id: 'search', name: 'web_search', input: { query: 'official specifications' } });
  });
  const activity = page.locator('.turn-activity-surface');
  await expect(activity).toHaveCount(1);
  await expect(activity.locator('.turn-activity-dot')).toHaveCount(0);
  await expect(activity.locator('.thinking-status-label')).toHaveCSS('animation-name', 'ui-activity-breathe');
  await activity.locator('button').first().click();
  await expect(activity.locator('.tool-inline .tool-inline-tool-icon')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(activity.locator('.thinking-status-label')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => {
    const ctl = window.__unifiedController;
    ctl.recordToolResult({ id: 'search', name: 'web_search', ok: true, status: 'completed', output: 'Checked.' });
    ctl.append('The answer.');
    ctl.finish();
  });
  await expect(activity.locator('.thinking-status-label')).toHaveCSS('animation-name', 'none');
  await expect(activity.locator('button').first()).toHaveAttribute('aria-expanded', 'true');
});

test('pending approvals remain visible with activity collapsed', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{ ...message, turnRuntime: undefined, toolCalls: [{
    id: 'approval-tool', name: 'workspace_agent', status: 'running', textOffset: 0,
    approval: { runId: 'run-1', approvalId: 'approval-1', status: 'pending', kind: 'commandExecution', reason: 'Run the verification command' },
  }] }] });
  await expect(page.locator('.thinking-accordion-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tool-inline-approval')).toBeVisible();
  await expect(page.locator('[data-approval-action="accept"]')).toBeVisible();
  expect(await page.locator('.tool-inline-approval').evaluate((node) => Boolean(node.closest('.turn-activity-surface')))).toBe(false);
});
