import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const nodes = [
  { id: 'panel', type: 'panel', title: 'Live estimate', state: { count: 1 } },
  { id: 'value', type: 'metric', parent: 'panel', label: 'Count', value: { state: 'count' } },
  {
    id: 'add',
    type: 'button',
    parent: 'panel',
    label: 'Add one',
    action: { type: 'increment', key: 'count', amount: 1 },
  },
];

async function start(page) {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__turnEventCtl = await window.addStreamingMessage({
      userPrompt: 'Build a live estimate and check the sources.',
    });
    let seq = 0;
    window.__turnEvent = (payload) =>
      window.__turnEventCtl.recordTurnEvent({
        version: 1,
        turnId: 'runtime-e2e',
        seq: ++seq,
        at: Date.now(),
        ...payload,
      });
  });
}

test('visual creation is visible before arguments or prose catch up', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    window.__turnEventCtl.append('Here is the comparison');
    window.__turnEvent({
      type: 'ui.begin',
      surfaceId: 'early-viz',
      toolCallId: 'early-viz',
      textOffset: 30,
    });
  });
  const message = page.locator('#msgList .msg.assistant').last();
  const attachment = message.locator('[data-tool-anchor="early-viz"]');
  const pending = attachment.locator('[data-viz-state="receiving"]');
  await expect(pending.getByRole('status')).toHaveText('Creating the visualization…');
  await expect(message).toContainText('Here is the comparison');
  await page.evaluate(() => {
    // The original offset now exists, but the paragraph still has no terminator.
    window.__turnEventCtl.append(' of four views');
  });
  await expect(message).toContainText('of four views');
  await expect(pending).toBeVisible();
  await page.screenshot({ path: 'test-results/visualization-creating.png' });

  const chartNodes = [
    [
      'combo',
      'Actual and target',
      [
        { name: 'Actual', kind: 'bar', data: [8, 5] },
        { name: 'Target', kind: 'line', data: [7, 7] },
      ],
    ],
    [
      'stacked_bar',
      'Energy total',
      [
        { name: 'Solar', data: [4, 6] },
        { name: 'Wind', data: [3, 2] },
      ],
    ],
    ['donut', 'Study time', [{ data: [60, 40] }]],
    ['funnel', 'Learner journey', [{ data: [16, 9] }]],
  ].map(([template, title, series]) => ({
    id: template,
    type: 'visualization',
    template,
    title,
    payload: { categories: ['First', 'Second'], series },
  }));
  await page.evaluate((chartNodes) => {
    window.__turnEvent({
      type: 'ui.commit',
      surfaceId: 'early-viz',
      nodes: [
        ...chartNodes,
        {
          id: 'dashboard',
          type: 'openui',
          source:
            'root = Col([Slider($done, 0, 12, 1, "Tasks completed"), Meter("Tasks", $done, 12), Metric("Remaining", 12 - $done)])\n$done = 4',
        },
      ],
    });
  }, chartNodes);
  await expect(pending).toHaveCount(0);
  for (const { id } of chartNodes) {
    const chart = attachment.locator(`[data-intui-id="${id}"] .visualization-stage svg`);
    await expect(chart).toBeVisible();
    expect(await chart.locator('path').count()).toBeGreaterThan(0);
  }
  const dashboard = attachment.locator('.intui-openui');
  const meter = dashboard.getByRole('meter', { name: 'Tasks' });
  await expect(meter).toHaveAttribute('aria-valuenow', '4');
  await dashboard.getByRole('slider').press('ArrowRight');
  await expect(meter).toHaveAttribute('aria-valuenow', '5');
  await expect(dashboard.getByText('7', { exact: true })).toBeVisible();
  expect(
    await meter.evaluate((track) => track.parentElement.getBoundingClientRect().height),
  ).toBeLessThan(64);
  await page.screenshot({ path: 'test-results/visualization-presets.png' });
  await page.evaluate(() => {
    window.__turnEvent({
      type: 'ui.begin',
      surfaceId: 'stopping',
      toolCallId: 'stopping',
      textOffset: 30,
    });
  });
  const stopping = message.locator('[data-tool-anchor="stopping"] [data-viz-state="receiving"]');
  await expect(stopping).toBeVisible();
  await page.evaluate(() => {
    window.__turnEvent({ type: 'turn.done', phase: 'stopped' });
    window.__turnEventCtl.finish();
  });
  await expect(stopping).toHaveCount(0);
});

test('nodes stream before tool_use, retain local state through commit, and coexist with prose and activity', async ({
  page,
}) => {
  await start(page);
  await page.evaluate((nodes) => {
    window.__turnEventCtl.append('First finding.\n\n');
    window.__turnEvent({ type: 'generation', phase: 'streaming' });
    window.__turnEvent({
      type: 'activity.upsert',
      activity: {
        id: 'public',
        kind: 'reasoning_summary',
        phase: 'running',
        text: 'Checking two official sources.',
        startedAt: Date.now(),
      },
    });
    window.__turnEvent({ type: 'ui.begin', surfaceId: 'ui', toolCallId: 'ui', textOffset: 16 });
    for (const node of nodes) window.__turnEvent({ type: 'ui.add', surfaceId: 'ui', node });
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  const ui = message.locator('.intui');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-intui-streaming', 'true');
  expect(
    await page.evaluate(
      () => window.__socratesTestState.session().messages.at(-1).toolCalls?.length || 0,
    ),
  ).toBe(0);
  await ui.getByRole('button', { name: 'Add one', exact: true }).click();
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  await ui.locator('[data-intui-id="panel"]').evaluate((element) => {
    element.__sameNode = true;
  });
  await message.locator('[data-testid="turn-activity-toggle"]').click();
  await expect(message.locator('[data-testid="thinking-timeline"]')).toContainText(
    'Checking two official sources.',
  );
  await expect(message.locator('.tool-run-prose').first()).toContainText('First finding.');
  await page.screenshot({ path: 'test-results/turn-event-progressive.png' });

  const completeNodes = [
    ...nodes,
    { id: 'final', parent: 'panel', type: 'text', text: 'New evidence arrived.' },
  ];
  await page.evaluate((completeNodes) => {
    window.__turnEvent({ type: 'ui.add', surfaceId: 'ui', node: completeNodes.at(-1) });
    // A preceding parallel tool changes the run's first member. Its UI host
    // must retain the user's local state across the tool_use handoff.
    window.__turnEventCtl.recordToolUse({
      id: 'search',
      name: 'web_search',
      input: { query: 'official sources' },
    });
    window.__turnEventCtl.recordToolResult({
      id: 'search',
      name: 'web_search',
      ok: true,
      status: 'completed',
      output: 'Found sources.',
    });
    window.__turnEventCtl.recordToolUse({
      id: 'ui',
      name: 'render_intelligent_ui',
      input: { version: 1, nodes: completeNodes },
    });
    window.__turnEventCtl.recordToolResult({
      id: 'ui',
      name: 'render_intelligent_ui',
      ok: true,
      status: 'completed',
      output: 'Rendered 4 UI nodes',
    });
    window.__turnEvent({ type: 'ui.commit', surfaceId: 'ui', nodes: completeNodes });
    window.__turnEventCtl.append('The answer continues while the sources are checked.');
  }, completeNodes);
  await expect(ui.locator('[data-intui-id="final"]')).toContainText('New evidence arrived.');
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  expect(
    await ui.locator('[data-intui-id="panel"]').evaluate((element) => element.__sameNode),
  ).toBe(true);
  /* The public step survives the tool_use handoff and commit next to the
     prose. The RN timeline only inks a step as running while the activity
     surface itself is live, and answer prose has started here, so the step
     is checked for presence rather than for data-phase="running". */
  await expect(message.locator('[data-testid="thinking-step"]')).toHaveCount(1);
  await expect(message.locator('[data-testid="thinking-step"]')).toContainText(
    'Checking two official sources.',
  );
  await expect(message).toContainText('The answer continues');
  await expect(message.locator('.msg-toolbar')).toBeHidden();
  await page.evaluate(() => {
    window.__turnEvent({ type: 'turn.done', phase: 'done', durationMs: 1400 });
    window.__turnEventCtl.finish();
  });
  await expect(message).toHaveAttribute('data-stream-settled', 'true');
  await expect(ui).toHaveAttribute('data-intui-streaming', 'false');
  await expect(message.locator('[data-testid="thinking-step"][data-phase="running"]')).toHaveCount(
    0,
  );
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  await page.screenshot({ path: 'test-results/turn-event-completed.png' });
});

test('rejected previews disappear and malformed events never mount unsafe UI', async ({ page }) => {
  await start(page);
  await page.evaluate((nodes) => {
    window.__turnEventCtl.append('Checking the estimate.\n\n');
    window.__turnEvent({ type: 'ui.begin', surfaceId: 'bad', toolCallId: 'bad', textOffset: 24 });
    window.__turnEvent({
      type: 'ui.add',
      surfaceId: 'bad',
      node: { id: 'unsafe', type: 'panel', html: '<script>bad()</script>' },
    });
    window.__turnEvent({ type: 'ui.add', surfaceId: 'bad', node: nodes[0] });
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  await expect(message.locator('[data-intui-id="unsafe"]')).toHaveCount(0);
  await expect(message.locator('.intui')).toBeVisible();
  await page.evaluate(() => window.__turnEvent({ type: 'ui.abort', surfaceId: 'bad' }));
  await expect(message.locator('.intui')).toHaveCount(0);
  await page.evaluate(() => {
    window.__turnEventCtl.recordToolUse({
      id: 'bad',
      name: 'render_intelligent_ui',
      input: { version: 1, nodes: [] },
    });
    window.__turnEventCtl.recordToolResult({
      id: 'bad',
      name: 'render_intelligent_ui',
      ok: false,
      status: 'failed',
      error: 'Could not validate the visual',
    });
  });
  await expect(message.locator('[data-tool-anchor="bad"][data-tool-failed]')).toBeVisible();
  await page.evaluate(() => window.__turnEventCtl.finish());
});

test('completed checkpoint restores UI beyond the first event page and ignores older replay', async ({
  page,
}) => {
  await start(page);
  await page.evaluate((nodes) => {
    const snapshot = {
      version: 1,
      turnId: 'runtime-e2e',
      seq: 800,
      lifecycle: 'done',
      generation: 'done',
      durationMs: 1400,
      activities: [
        {
          id: 'summary',
          kind: 'reasoning_summary',
          phase: 'done',
          startedAt: 100,
          endedAt: 1500,
          text: 'Compared the official sources.',
        },
      ],
      uiSurfaces: [
        { id: 'restored-ui', toolCallId: 'restored-ui', textOffset: 0, phase: 'committed', nodes },
      ],
    };
    window.__turnEventCtl.recordTurnSnapshot(snapshot);
    window.__turnEventCtl.recordTurnSnapshot({ ...snapshot, seq: 799, uiSurfaces: [] });
    window.__turnEvent({ type: 'ui.abort', surfaceId: 'restored-ui' });
    window.__turnEventCtl.finish();
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  await expect(message).toHaveAttribute('data-stream-settled', 'true');
  await expect(message.locator('.intui')).toBeVisible();
  await expect(message.locator('[data-intui-id="value"]')).toContainText('1');
  await message.locator('[data-testid="turn-activity-toggle"]').click();
  await expect(message.locator('[data-testid="thinking-timeline"]')).toContainText(
    'Compared the official sources.',
  );
  expect(
    await page.evaluate(() => window.__socratesTestState.session().messages.at(-1).turnRuntime.seq),
  ).toBe(800);
});

test('committed UI patch retains DOM, local state and disclosure while removing a subtree', async ({
  page,
}) => {
  await start(page);
  await page.evaluate((nodes) => {
    window.__turnEvent({
      type: 'ui.begin',
      surfaceId: 'editable',
      toolCallId: 'editable',
      textOffset: 0,
    });
    window.__turnEvent({
      type: 'ui.commit',
      surfaceId: 'editable',
      nodes: [
        ...nodes,
        { id: 'old-group', type: 'stack', parent: 'panel' },
        { id: 'old-child', type: 'text', parent: 'old-group', text: 'Outdated evidence' },
      ],
    });
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  const panel = message.locator('[data-intui-id="panel"]');
  await panel.evaluate((node) => {
    node.__retained = true;
  });
  await message.getByRole('button', { name: 'Add one', exact: true }).click();
  const button = message.getByRole('button', { name: 'Add one', exact: true });
  await button.focus();
  await page.evaluate(() =>
    window.__turnEvent({
      type: 'ui.edit',
      surfaceId: 'editable',
      baseRevision: 0,
      operations: [
        {
          op: 'patch',
          nodeId: 'panel',
          props: { title: 'Updated estimate', state: { count: 99 } },
        },
        { op: 'remove', nodeId: 'old-group' },
        {
          op: 'add',
          node: { id: 'new-evidence', type: 'text', parent: 'panel', text: 'Fresh evidence' },
        },
      ],
    }),
  );
  await expect(
    message.getByRole('heading', { name: 'Updated estimate', exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText('Fresh evidence');
  await expect(message.locator('[data-intui-id="value"]')).toContainText('2');
  await expect(message.locator('[data-intui-id="old-child"]')).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await panel.evaluate((node) => node.__retained)).toBe(true);
  await page.evaluate(() => {
    // A stale revision and a mixed invalid transaction must preserve the view.
    window.__turnEvent({
      type: 'ui.edit',
      surfaceId: 'editable',
      baseRevision: 0,
      operations: [{ op: 'remove', nodeId: 'add' }],
    });
    window.__turnEvent({
      type: 'ui.edit',
      surfaceId: 'editable',
      baseRevision: 1,
      operations: [
        { op: 'patch', nodeId: 'panel', props: { title: 'Must not commit' } },
        { op: 'patch', nodeId: 'new-evidence', props: { html: '<script/>' } },
      ],
    });
    window.__turnEventCtl.finish();
  });
  await expect(
    message.getByRole('heading', { name: 'Updated estimate', exact: true }),
  ).toBeVisible();
  await expect(button).toBeVisible();
  await expect(message.locator('[data-intui-id="value"]')).toContainText('2');
  await page.screenshot({ path: 'test-results/intelligent-ui-patch.png' });
});
