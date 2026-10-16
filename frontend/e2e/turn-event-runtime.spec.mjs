import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const nodes = [
  { id: 'panel', type: 'panel', title: 'Live estimate', state: { count: 1 } },
  { id: 'value', type: 'metric', parent: 'panel', label: 'Count', value: { state: 'count' } },
  { id: 'add', type: 'button', parent: 'panel', label: 'Add one', action: { type: 'increment', key: 'count', amount: 1 } },
];

async function start(page) {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__turnEventCtl = await window.addStreamingMessage({ userPrompt: 'Build a live estimate and check the sources.' });
    let seq = 0;
    window.__turnEvent = (payload) => window.__turnEventCtl.recordTurnEvent({ version: 1, turnId: 'runtime-e2e', seq: ++seq, at: Date.now(), ...payload });
  });
}

test('nodes stream before tool_use, retain local state through commit, and coexist with prose and activity', async ({ page }) => {
  await start(page);
  await page.evaluate((nodes) => {
    window.__turnEventCtl.append('First finding.\n\n');
    window.__turnEvent({ type: 'generation', phase: 'streaming' });
    window.__turnEvent({ type: 'activity.upsert', activity: { id: 'public', kind: 'reasoning_summary', phase: 'running', text: 'Checking two official sources.', startedAt: Date.now() } });
    window.__turnEvent({ type: 'ui.begin', surfaceId: 'ui', toolCallId: 'ui', textOffset: 16 });
    for (const node of nodes) window.__turnEvent({ type: 'ui.add', surfaceId: 'ui', node });
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  const ui = message.locator('.intui');
  await expect(ui).toBeVisible();
  await expect(ui).toHaveAttribute('data-intui-streaming', 'true');
  expect(await page.evaluate(() => window.stateStore.read('messages').at(-1).toolCalls?.length || 0)).toBe(0);
  await ui.getByRole('button', { name: 'Add one', exact: true }).click();
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  await ui.locator('[data-intui-id="panel"]').evaluate((element) => { element.__sameNode = true; });
  await message.locator('[data-activity-timeline] button').click();
  await expect(message.locator('.turn-activity-list')).toContainText('Checking two official sources.');
  await expect(message.locator('.tool-run-prose').first()).toContainText('First finding.');
  await page.screenshot({ path: 'test-results/turn-event-progressive.png' });

  const completeNodes = [...nodes, { id: 'final', parent: 'panel', type: 'text', text: 'New evidence arrived.' }];
  await page.evaluate((completeNodes) => {
    window.__turnEvent({ type: 'ui.add', surfaceId: 'ui', node: completeNodes.at(-1) });
    // A preceding parallel tool changes the run's first member. Its UI host
    // must retain the user's local state across the tool_use handoff.
    window.__turnEventCtl.recordToolUse({ id: 'search', name: 'web_search', input: { query: 'official sources' } });
    window.__turnEventCtl.recordToolResult({ id: 'search', name: 'web_search', ok: true, status: 'completed', output: 'Found sources.' });
    window.__turnEventCtl.recordToolUse({ id: 'ui', name: 'render_intelligent_ui', input: { version: 1, nodes: completeNodes } });
    window.__turnEventCtl.recordToolResult({ id: 'ui', name: 'render_intelligent_ui', ok: true, status: 'completed', output: 'Rendered 4 UI nodes' });
    window.__turnEvent({ type: 'ui.commit', surfaceId: 'ui', nodes: completeNodes });
    window.__turnEventCtl.append('The answer continues while the sources are checked.');
  }, completeNodes);
  await expect(ui.locator('[data-intui-id="final"]')).toContainText('New evidence arrived.');
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  expect(await ui.locator('[data-intui-id="panel"]').evaluate((element) => element.__sameNode)).toBe(true);
  await expect(message.locator('.turn-activity-list [data-phase="running"]')).toHaveCount(1);
  await expect(message).toContainText('The answer continues');
  await expect(message.locator('.msg-toolbar')).toBeHidden();
  await page.evaluate(() => {
    window.__turnEvent({ type: 'turn.done', phase: 'done', durationMs: 1400 });
    window.__turnEventCtl.finish();
  });
  await expect(message).toHaveAttribute('data-stream-settled', 'true');
  await expect(ui).toHaveAttribute('data-intui-streaming', 'false');
  await expect(message.locator('.turn-activity-list [data-phase="running"]')).toHaveCount(0);
  await expect(ui.locator('[data-intui-id="value"]')).toContainText('2');
  await page.screenshot({ path: 'test-results/turn-event-completed.png' });
});

test('rejected previews disappear and malformed events never mount unsafe UI', async ({ page }) => {
  await start(page);
  await page.evaluate((nodes) => {
    window.__turnEventCtl.append('Checking the estimate.\n\n');
    window.__turnEvent({ type: 'ui.begin', surfaceId: 'bad', toolCallId: 'bad', textOffset: 24 });
    window.__turnEvent({ type: 'ui.add', surfaceId: 'bad', node: { id: 'unsafe', type: 'panel', html: '<script>bad()</script>' } });
    window.__turnEvent({ type: 'ui.add', surfaceId: 'bad', node: nodes[0] });
  }, nodes);
  const message = page.locator('#msgList .msg.assistant').last();
  await expect(message.locator('[data-intui-id="unsafe"]')).toHaveCount(0);
  await expect(message.locator('.intui')).toBeVisible();
  await page.evaluate(() => window.__turnEvent({ type: 'ui.abort', surfaceId: 'bad' }));
  await expect(message.locator('.intui')).toHaveCount(0);
  await page.evaluate(() => window.__turnEventCtl.finish());
});

test('completed checkpoint restores UI beyond the first event page and ignores older replay', async ({ page }) => {
  await start(page);
  await page.evaluate((nodes) => {
    const snapshot = { version: 1, turnId: 'runtime-e2e', seq: 800, lifecycle: 'done', generation: 'done', durationMs: 1400,
      activities: [{ id: 'summary', kind: 'reasoning_summary', phase: 'done', startedAt: 100, endedAt: 1500, text: 'Compared the official sources.' }],
      uiSurfaces: [{ id: 'restored-ui', toolCallId: 'restored-ui', textOffset: 0, phase: 'committed', nodes }],
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
  await message.locator('[data-activity-timeline] button').click();
  await expect(message.locator('.turn-activity-list')).toContainText('Compared the official sources.');
  expect(await page.evaluate(() => window.stateStore.read('messages').at(-1).turnRuntime.seq)).toBe(800);
});
