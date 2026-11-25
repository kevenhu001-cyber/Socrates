import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';
import { TURN, toolRow } from './_turn-ui.mjs';

const nodes = [
  { id: 'panel', type: 'panel', title: 'Estimate', state: { count: 2 } },
  { id: 'count', type: 'metric', parent: 'panel', label: 'Count', value: { state: 'count' } },
  {
    id: 'add',
    type: 'button',
    parent: 'panel',
    label: 'Add one',
    action: { type: 'increment', key: 'count', amount: 1 },
  },
  {
    id: 'tabs',
    type: 'tabs',
    parent: 'panel',
    tabs: [
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ],
  },
  { id: 'first-text', type: 'text', parent: 'tabs', tab: 'first', text: 'First view' },
  { id: 'second-text', type: 'text', parent: 'tabs', tab: 'second', text: 'Second view' },
];
const message = {
  clientId: 'unified-ui',
  role: 'assistant',
  rawText: 'The answer stays the primary content.',
  summary: 'An observation that should not duplicate the answer.',
  toolCalls: [
    {
      id: 'ui',
      name: 'render_intelligent_ui',
      status: 'completed',
      textOffset: 0,
      input: { version: 1, nodes },
    },
  ],
  turnRuntime: {
    version: 1,
    turnId: 'unified-ui',
    seq: 1,
    lifecycle: 'done',
    generation: 'done',
    uiSurfaces: [],
    activities: [
      {
        id: 'public',
        kind: 'reasoning_summary',
        text: 'Checked the assumptions.',
        phase: 'done',
        startedAt: 100,
        endedAt: 12100,
      },
    ],
  },
};

test('public summaries disclose separately while tool rows and results stay visible', async ({
  page,
}) => {
  await prepareChatWorkbench(page, { messages: [message] });
  const activity = page.locator(TURN.surface);
  const toggle = activity.locator(TURN.toggle);
  await expect(activity).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.intui')).toBeVisible();
  await expect(toolRow(page, 'ui')).toBeVisible();
  const widths = await page
    .locator('.intui')
    .evaluate((node) => ({ ui: node.clientWidth, host: node.parentElement.clientWidth }));
  expect(widths.ui).toBeGreaterThan(widths.host * 0.9);
  await expect(page.locator('.tool-run-prose')).toContainText(message.rawText);
  await expect(page.locator('.msg-body')).not.toContainText(message.summary);
  await toggle.click();
  await expect(activity.getByText('Checked the assumptions.')).toBeVisible();
  await expect(toolRow(page, 'ui')).toBeVisible();
  /* Tool activity uses a quieter type step than prose. */
  const type = await toolRow(page, 'ui')
    .locator(TURN.stepTitle)
    .evaluate((node) => ({
      size: parseFloat(getComputedStyle(node).fontSize),
      line: parseFloat(getComputedStyle(node).lineHeight),
    }));
  const proseSize = await page
    .locator('.tool-run-prose p')
    .first()
    .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(type.size).toBeLessThanOrEqual(proseSize);
  expect(type.line).toBeGreaterThanOrEqual(type.size);
  await toggle.click();
  await expect(page.locator('.intui')).toBeVisible();
  await expect(activity.locator(TURN.body)).toBeHidden();
  await page.screenshot({ path: 'test-results/unified-turn-desktop.png' });
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} toolbar keeps secondary actions in a keyboard accessible overflow`, async ({
    page,
  }) => {
    await prepareChatWorkbench(page, {
      messages: [message],
      viewport: mobile ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop,
    });
    const toolbar = page.locator('.msg-toolbar[data-role="assistant"]');
    await expect(toolbar.locator(':scope > button')).toHaveCount(3);
    await expect(toolbar.getByRole('button', { name: 'Helpful', exact: true })).toHaveCount(
      mobile ? 0 : 1,
    );
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

test('inline results preserve node identity, edited values and tabs', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message] });
  const shell = page.locator('.intui-surface-shell');
  const count = page.locator('[data-intui-id="count"]');
  await page.getByRole('button', { name: 'Add one', exact: true }).click();
  await expect(count).toContainText('3');
  await expect(shell).toHaveAttribute('data-display-mode', 'inline');
  /* Views are switchable where the result sits: no separate expanded state. */
  const secondTab = page.getByRole('tab', { name: 'Second', exact: true });
  await expect(secondTab).toHaveCount(1);
  await expect(page.getByText('First view', { exact: true })).toBeVisible();
  await count.evaluate((node) => {
    window.__originalMetricNode = node;
  });
  await secondTab.click();
  await expect(secondTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Second view', { exact: true })).toBeVisible();
  await expect(page.getByText('First view', { exact: true })).toHaveCount(0);
  expect(await count.evaluate((node) => node === window.__originalMetricNode)).toBe(true);
  await expect(count).toContainText('3');
  await page.screenshot({ path: 'test-results/intelligent-ui-inline-tabs.png' });
});

test('a live tool names its action and spins once beside the public summary', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Check assumptions.' });
    window.__unifiedController = ctl;
    ctl.recordTurnActivity({
      type: 'public_reasoning_summary',
      text: 'Compared the official specifications.',
    });
    ctl.recordToolUse({
      id: 'search',
      name: 'web_search',
      input: { query: 'official specifications' },
    });
  });
  const activity = page.locator(TURN.surface);
  await expect(activity).toHaveCount(1);
  await expect(activity.locator('.turn-activity-dot')).toHaveCount(0);
  const row = toolRow(page, 'search');
  const label = row.locator(TURN.stepTitle);
  await expect(label).toContainText('official specifications');
  await expect(activity.locator(TURN.indicator)).toHaveCount(0);
  const spinner = row.locator(TURN.spinner);
  await expect(spinner).toHaveCount(1);
  await activity.locator(TURN.toggle).click();
  await expect(activity.getByText('Compared the official specifications.').first()).toBeVisible();
  const pose = () =>
    spinner.evaluate((node) => {
      const computed = getComputedStyle(node).transform;
      return computed && computed !== 'none' ? computed : node.style.transform;
    });
  const firstPose = await pose();
  await expect.poll(pose, { timeout: 5_000 }).not.toBe(firstPose);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  /* Reduced motion freezes the arc in place instead of stopping mid-turn. */
  await page.waitForTimeout(300);
  const stillPose = await pose();
  await page.waitForTimeout(400);
  expect(await pose()).toBe(stillPose);
  expect(await label.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await page.evaluate(() => {
    const ctl = window.__unifiedController;
    ctl.recordToolResult({
      id: 'search',
      name: 'web_search',
      ok: true,
      status: 'completed',
      output: 'Checked.',
    });
    ctl.append('The answer.');
    ctl.finish();
  });
  await expect(row.locator(TURN.spinner)).toHaveCount(0);
  await expect(activity.locator(TURN.toggle)).toHaveAttribute('aria-expanded', 'true');
});

test('pending approvals remain visible with activity collapsed', async ({ page }) => {
  await prepareChatWorkbench(page, {
    messages: [
      {
        ...message,
        turnRuntime: undefined,
        toolCalls: [
          {
            id: 'approval-tool',
            name: 'workspace_agent',
            status: 'running',
            textOffset: 0,
            approval: {
              runId: 'run-1',
              approvalId: 'approval-1',
              status: 'pending',
              kind: 'commandExecution',
              reason: 'Run the verification command',
            },
          },
        ],
      },
    ],
  });
  await expect(page.locator('.tool-run-trigger')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(TURN.approval)).toBeVisible();
  await expect(page.locator('[data-approval-action="accept"]')).toBeVisible();
  expect(
    await page
      .locator(TURN.approval)
      .evaluate((node) => Boolean(node.closest('[data-testid="turn-activity"]'))),
  ).toBe(false);
});


test('live activity keeps tool rows folded until requested', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Check sources.' });
    for (const id of ['first', 'second', 'third']) {
      ctl.recordToolUse({ id, name: 'web_search', input: { query: id } });
      if (id !== 'third') {
        ctl.recordToolResult({ id, name: 'web_search', ok: true, status: 'completed', output: 'Checked.' });
      }
    }
    window.__unifiedController = ctl;
  });
  const burst = page.locator('.tool-activity-burst-toggle');
  await expect(burst).toHaveAttribute('aria-expanded', 'false');
  await expect(toolRow(page, 'third')).toBeHidden();
  await burst.click();
  await expect(toolRow(page, 'third')).toBeVisible();
  await expect(toolRow(page, 'third').locator(TURN.spinner)).toHaveCount(1);
  await burst.click();
  await page.evaluate(() => {
    const ctl = window.__unifiedController;
    ctl.recordToolResult({ id: 'third', name: 'web_search', ok: true, status: 'completed', output: 'Checked.' });
    ctl.append('The answer.');
    ctl.finish();
  });
  await expect(page.locator('.tool-activity-burst-caption')).toHaveCount(0);
  await expect(page.locator('.tool-activity-burst-toggle')).toBeVisible();
});


test('live workspace steps stay behind the row disclosure', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Read project files.' });
    window.__unifiedController = ctl;
    ctl.recordToolUse({ id: 'agent', name: 'workspace_agent', input: { task: 'Read project files.' } });
    ctl.recordAgentStep({ type: 'step', id: 'agent', runId: 'run-preview', stepId: 'read', kind: 'read', status: 'done' });
    ctl.recordAgentStep({ type: 'step', id: 'agent', runId: 'run-preview', stepId: 'command', kind: 'command', status: 'running', command: 'npm test' });
  });
  const preview = page.getByTestId('agent-activity-preview');
  await expect(preview).toHaveCount(0);
  await toolRow(page, 'agent').click();
  await expect(preview).toHaveCount(0);
  await expect(page.locator('.agent-step')).toHaveCount(2);
  await toolRow(page, 'agent').click();
  await expect(preview).toHaveCount(0);
  await expect(page.locator('.agent-step')).toHaveCount(0);
  await page.evaluate(() => {
    const ctl = window.__unifiedController;
    ctl.recordToolResult({ id: 'agent', name: 'workspace_agent', status: 'completed', ok: true, output: 'Done.' });
    ctl.append('Finished.');
    ctl.finish();
  });
  await expect(preview).toHaveCount(0);
});


test('stopped workspace steps retain an unconfirmed outcome', async ({ page }) => {
  await prepareChatWorkbench(page, {
    messages: [{
      clientId: 'cancelled-agent',
      role: 'assistant',
      rawText: 'Stopped.',
      toolCalls: [{
        id: 'cancelled',
        name: 'workspace_agent',
        textOffset: 0,
        status: 'cancelled',
        runId: 'cancelled-run',
        steps: [
          { stepId: 'read', kind: 'read', status: 'done' },
          { stepId: 'command', kind: 'command', status: 'running', command: 'npm test' },
        ],
      }],
    }],
  });
  await toolRow(page, 'cancelled').click();
  const run = page.locator('.agent-run');
  await expect(run).toHaveAttribute('data-state', 'cancelled');
  await expect(run.locator('.agent-run-elapsed')).toHaveText('Stopped');
  expect(await run.getAttribute('data-duration-ms')).toBeNull();
  await expect(run.locator('[data-step-id="read"]')).toHaveAttribute('data-state', 'done');
  await expect(run.locator('[data-step-id="command"]')).toHaveAttribute('data-state', 'stopped');
  await expect(run.locator('[data-step-id="command"] .agent-step-meta')).toContainText('Stopped');
});
