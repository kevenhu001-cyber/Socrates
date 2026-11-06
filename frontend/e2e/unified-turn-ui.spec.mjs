import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';
import { TURN, toolRow } from './_turn-ui.mjs';

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
  const activity = page.locator(TURN.surface);
  const toggle = activity.locator(TURN.toggle);
  await expect(activity).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.intui')).toBeVisible();
  const widths = await page.locator('.intui').evaluate((node) => ({ ui: node.clientWidth, host: node.parentElement.clientWidth }));
  expect(widths.ui).toBeGreaterThan(widths.host * .9);
  await expect(page.locator('.tool-run-prose')).toContainText(message.rawText);
  await expect(page.locator('.msg-body')).not.toContainText(message.summary);
  await toggle.click();
  await expect(activity.getByText('Checked the assumptions.')).toBeVisible();
  await expect(toolRow(activity, 'ui')).toBeVisible();
  /* Row text sits on the same small label step as the thinking line. */
  const type = await toolRow(activity, 'ui').locator(TURN.verb).evaluate((node) => ({ size: parseFloat(getComputedStyle(node).fontSize), line: parseFloat(getComputedStyle(node).lineHeight) }));
  const labelSize = await activity.locator(TURN.label).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(type.size).toBe(labelSize);
  expect(type.line).toBeGreaterThanOrEqual(type.size);
  await toggle.click();
  await expect(page.locator('.intui')).toBeVisible();
  await expect(activity.locator(TURN.body)).toBeHidden();
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
    /* The overflow carries the workbench entry first, then the turn's own
       secondary actions. */
    await expect(menu.getByRole('menuitem', { name: 'Open in Workbench' })).toHaveCount(1);
    await expect(menu.getByRole('menuitem')).toHaveCount(mobile ? 7 : 5);
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
  await expect(page.getByRole('tab')).toHaveCount(0);
  await shell.locator('.intui-surface-expand').click();
  await page.getByRole('tab', { name: 'Second', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-display-mode', 'inline');
  await count.evaluate((node) => { window.__originalMetricNode = node; });
  for (const mode of ['compact', 'carousel', 'pip', 'inline']) {
    await shell.getByRole('button', { name: 'Display mode', exact: true }).click();
    await page.getByRole('menuitemradio', { name: { compact: 'Compact', carousel: 'Carousel', pip: 'Floating', inline: 'Inline' }[mode], exact: true }).click();
    await expect(shell).toHaveAttribute('data-display-mode', mode);
    await expect(count).toContainText('3');
  }
  await shell.getByRole('button', { name: 'Display mode', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Floating', exact: true }).click();
  await shell.getByRole('button', { name: 'Inline', exact: true }).click();
  await expect(shell).toHaveAttribute('data-display-mode', 'inline');
  await expect(count).toContainText('3');
  const expand = shell.locator('.intui-surface-toolbar > button').first();
  await expand.click();
  await expect(shell).toHaveAttribute('data-display-mode', 'fullscreen');
  expect(await shell.evaluate((node) => node.matches(':modal'))).toBe(false);
  await expect(page.getByRole('tab', { name: 'Second', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Second view', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/intelligent-ui-fullscreen.png' });
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-display-mode', 'inline');
  await expect(expand).toBeFocused();
  expect(await count.evaluate((node) => node === window.__originalMetricNode)).toBe(true);
  await expect(count).toContainText('3');
});

test('a live turn shows one spark glyph and reduced motion freezes it', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Check assumptions.' });
    window.__unifiedController = ctl;
    ctl.recordTurnActivity({ type: 'public_reasoning_summary', text: 'Compared the official specifications.' });
    ctl.recordToolUse({ id: 'search', name: 'web_search', input: { query: 'official specifications' } });
  });
  const activity = page.locator(TURN.surface);
  await expect(activity).toHaveCount(1);
  await expect(activity.locator('.turn-activity-dot')).toHaveCount(0);
  /* The working cue is one glyph ahead of a still caption: twelve dots on a
     sphere turning in 3D, near dots larger and more opaque than far ones; no
     sweeping hairline, no breathing text. The turn is a Web Animation of
     transform and opacity only, so it runs on the compositor. */
  const spark = activity.locator(`${TURN.indicator} .thinking-spark`);
  const dots = spark.locator('.thinking-spark-dot');
  const dotPose = () => dots.evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).transform).join(' '));
  await expect(spark).toHaveCount(1);
  await expect(spark).toHaveAttribute('data-testid', 'thinking-spark');
  await expect(dots).toHaveCount(12);
  await expect(spark).toHaveAttribute('data-motion', 'running');
  /* Script animations only: the reduced-motion reset can leave stray 0.01ms CSS transitions. */
  const motion = await dots.evaluateAll((nodes) => nodes.map((n) => n.getAnimations().filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).map((a) => ({
    state: a.playState,
    iterations: a.effect.getTiming().iterations,
    props: [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((key) => !['offset', 'easing', 'composite', 'computedOffset'].includes(key))))].sort().join(','),
  }))));
  expect(motion).toHaveLength(12);
  for (const list of motion) expect(list).toEqual([{ state: 'running', iterations: Infinity, props: 'opacity,transform' }]);
  const depth = await dots.evaluateAll((nodes) => nodes.map((n) => {
    const style = getComputedStyle(n);
    const m = new DOMMatrixReadOnly(style.transform);
    return { s: Math.hypot(m.a, m.b), o: Number(style.opacity) };
  }));
  const scales = depth.map((d) => d.s);
  const opacities = depth.map((d) => d.o);
  expect(Math.max(...scales)).toBeGreaterThan(Math.min(...scales) * 1.4);
  expect(Math.max(...opacities)).toBeGreaterThan(Math.min(...opacities) * 2);
  const firstPose = await dotPose();
  await expect.poll(dotPose).not.toBe(firstPose);
  const captionOpacity = () => activity.locator(TURN.label).evaluate((node) => parseFloat(getComputedStyle(node.parentElement).opacity));
  await page.waitForTimeout(800);
  expect(await captionOpacity()).toBe(1);
  await activity.locator(TURN.toggle).click();
  await expect(toolRow(activity, 'search').locator('.tool-inline-tool-icon')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  /* Reduced motion keeps the glyph as one still frame. */
  await expect(spark).toBeVisible();
  await expect(spark).toHaveAttribute('data-motion', 'static');
  await expect(dots).toHaveCount(12);
  expect(await dots.evaluateAll((nodes) => nodes.reduce((sum, n) => sum + n.getAnimations().filter((a) => !(a instanceof CSSTransition) && !(a instanceof CSSAnimation)).length, 0))).toBe(0);
  const stillPose = await dotPose();
  await page.waitForTimeout(400);
  expect(await dotPose()).toBe(stillPose);
  expect(await captionOpacity()).toBe(1);
  await page.evaluate(() => {
    const ctl = window.__unifiedController;
    ctl.recordToolResult({ id: 'search', name: 'web_search', ok: true, status: 'completed', output: 'Checked.' });
    ctl.append('The answer.');
    ctl.finish();
  });
  await expect(activity.locator(TURN.indicator)).toHaveCount(0);
  expect(await captionOpacity()).toBe(1);
  await expect(activity.locator(TURN.toggle)).toHaveAttribute('aria-expanded', 'true');
});

test('pending approvals remain visible with activity collapsed', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{ ...message, turnRuntime: undefined, toolCalls: [{
    id: 'approval-tool', name: 'workspace_agent', status: 'running', textOffset: 0,
    approval: { runId: 'run-1', approvalId: 'approval-1', status: 'pending', kind: 'commandExecution', reason: 'Run the verification command' },
  }] }] });
  await expect(page.locator(TURN.toggle)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(TURN.approval)).toBeVisible();
  await expect(page.locator('[data-approval-action="accept"]')).toBeVisible();
  expect(await page.locator(TURN.approval).evaluate((node) => Boolean(node.closest('[data-testid="turn-activity"]')))).toBe(false);
});
