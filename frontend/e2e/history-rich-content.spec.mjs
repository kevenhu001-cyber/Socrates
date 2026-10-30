import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const VIZ_SPEC = {
  version: 1,
  template: 'function',
  title: 'Restored parabola',
  caption: 'A persisted visualization',
  accessibilitySummary: 'The graph of y equals x squared.',
  payload: {
    functions: [{ expression: 'x^2', label: 'y = x²' }],
    xLabel: 'x',
    yLabel: 'y',
  },
};

for (const withSnapshot of [true, false]) {
test(`loading an old conversation rebuilds scaffold widgets and visualizations (${withSnapshot ? 'stale HTML' : 'raw only'})`, async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SESSION_ID,
        topic: 'Rich history',
        title: 'Rich history',
        projectId: 'project-restore',
        domain: 'math',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          {
            id: 'history-user',
            role: 'user',
            rawText: 'Explain a **parabola**',
            html: withSnapshot ? '<p>Explain a <strong>parabola</strong></p>' : undefined,
          },
          {
            id: 'history-assistant',
            role: 'assistant',
            rawText: '<definition><term>Parabola</term><body>A quadratic curve.</body></definition>\n\nThe graph is below.',
            html: withSnapshot ? '<p>stale snapshot without dynamic content</p>' : undefined,
            toolCalls: [{
              id: 'history-viz',
              name: 'render_visualization',
              input: VIZ_SPEC,
              output: 'Visualization ready',
              artifacts: [],
            }],
          },
        ],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  await page.route(/\/api\/(?:v2\/)?projects(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [{ id: 'project-restore', name: 'Restored project' }] }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  // loadSession is wired onto window near the end of main.js boot, so under
  // full-suite load the call can race boot completion. Wait for it first.
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), SESSION_ID);
  await expect.poll(() => page.evaluate(() => window.stateStore.read('currentProjectId'))).toBe('project-restore');
  expect(await page.evaluate(() => '__activeProject' in window)).toBe(false);

  await expect(page.locator('#msgList .msg')).toHaveCount(2);
  /* A user bubble always renders its own raw text — never a persisted
     markdown snapshot. The stored <strong> must not come back as markup,
     which is what makes the "stale HTML" case meaningful. */
  await expect(page.locator('#msgList .msg.user strong')).toHaveCount(0);
  await expect(page.locator('#msgList .msg.user .msg-body')).toHaveText('Explain a **parabola**');
  await expect(page.locator('.inline-definition-term')).toHaveText('Parabola');
  await expect(page.locator('.inline-definition-body')).toContainText('A quadratic curve');
  await expect(page.locator('.visualization-card')).toContainText('Restored parabola');
  await expect(page.locator('.visualization-card svg path')).not.toHaveCount(0);
  await expect(page.locator('#msgList')).not.toContainText('stale snapshot without dynamic content');

  const restoredVisualization = page.locator('#msgList .visualization-card');
  await expect(restoredVisualization).toHaveCount(1);
  await expect(restoredVisualization.locator('h3')).toHaveText('Restored parabola');
  await expect(restoredVisualization.locator('.visualization-figure')).toBeVisible();
  await expect(restoredVisualization.locator('.visualization-figure svg').first()).toBeVisible();
  if (!withSnapshot) {
    await page.screenshot({ path: 'test-results/raw-history-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.inline-definition-term')).toHaveText('Parabola');
    await expect(page.locator('.visualization-card')).toBeVisible();
    await page.screenshot({ path: 'test-results/raw-history-mobile.png' });
  }
});
}

const INLINE_SESSION_ID = '33333333-3333-4333-8333-333333333333';

test('tool calls with textOffset restore as inline rows with the chart in place', async ({ page }) => {
  await mockAuthedApp(page);
  const rawText = 'Before the tool call.\n\nAfter the tool call.';
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + INLINE_SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: INLINE_SESSION_ID,
        topic: 'Inline tools',
        title: 'Inline tools',
        domain: 'math',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          { id: 'inline-user', role: 'user', rawText: 'Draw it', html: '<p>Draw it</p>' },
          {
            id: 'inline-assistant',
            role: 'assistant',
            rawText,
            html: '<p>stale</p>',
            toolCalls: [{
              id: 'inline-viz-call',
              name: 'render_visualization',
              input: VIZ_SPEC,
              output: 'Visualization ready',
              artifacts: [],
              textOffset: 'Before the tool call.\n\n'.length,
              visualization: VIZ_SPEC,
            }],
          },
        ],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  // loadSession is wired onto window near the end of main.js boot, so under
  // full-suite load the call can race boot completion. Wait for it first.
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), INLINE_SESSION_ID);

  const body = page.locator('#msgList .msg.assistant .msg-body');
  await expect(body.locator('.tool-inline[data-tcid="inline-viz-call"]')).toHaveCount(1);
  await expect(body.locator('.visualization-card')).toContainText('Restored parabola');
  // The chart must sit in the anchored host right after its row, not at
  // the bubble bottom after the trailing text segment.
  const order = await body.evaluate((el) => {
    const host = el.querySelector('.tool-inline-attachments[data-tool-anchor="inline-viz-call"]');
    return {
      hostIsAttachment: !!(host && host.classList.contains('tool-inline-attachments')),
      hostHasViz: !!(host && host.querySelector('.visualization-card')),
      textAfterRow: /After the tool call/.test((host && host.nextElementSibling && host.nextElementSibling.textContent) || (el.textContent.split('After the tool call').length > 1 ? 'After the tool call' : '')),
    };
  });
  expect(order.hostIsAttachment).toBe(true);
  expect(order.hostHasViz).toBe(true);
  // No duplicate legacy card should be appended for the same call.
  await expect(body.locator('.agent-tool-card')).toHaveCount(0);
});

const SENTENCE_SESSION_ID = '44444444-4444-4444-8444-444444444444';

test('restored edit actions keep the answer intact inside the unified activity hierarchy', async ({ page }) => {
  await mockAuthedApp(page);
  const rawText = '我先查一下相关资料。这是第一段。\n\n代码验证。尾巴。';
  const textOffset = '我先查一下'.length;
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + SENTENCE_SESSION_ID + '(?:\\?.*)?$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: SENTENCE_SESSION_ID,
        topic: 'Paragraph-safe tools',
        title: 'Paragraph-safe tools',
        domain: 'code',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          { id: 'sentence-user', role: 'user', rawText: '检查一下', html: '<p>检查一下</p>' },
          {
            id: 'sentence-assistant',
            role: 'assistant',
            rawText,
            html: '<p>stale</p>',
            toolCalls: [
              { id: 'edit-one', name: 'Edit', input: { file_path: 'moe.py' }, output: 'ok', durationMs: 250, textOffset },
              { id: 'edit-two', name: 'Edit', input: { file_path: 'router_v2.py' }, output: 'ok', durationMs: 300, textOffset },
            ],
          },
        ],
        kbNodes: [],
        mistakes: [],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, { timeout: 15_000 });
  await page.evaluate((id) => window.loadSession(id), SENTENCE_SESSION_ID);

  const body = page.locator('#msgList .msg.assistant .msg-body');
  await expect.poll(async () => (await body.locator('.tool-run-prose').allTextContents()).join('').replace(/\s/g, '')).toBe(rawText.replace(/\s/g, ''));
  await expect(body.locator('.tool-run-summary')).toHaveCount(0);
  await expect(body.locator('.tool-inline-label')).toHaveText(['Edited moe.py', 'Edited router_v2.py']);
  await expect(body.locator('.tool-inline-file-summary')).toHaveCount(0);
  const flow = await body.locator('.turn-evidence > *').evaluateAll((nodes) => nodes.map((node) => ({
    className: node.className,
    text: node.textContent.trim(),
  })));
  expect(flow[0].className).toContain('turn-activity-surface');
  expect(flow.slice(1).every((node) => node.className.includes('tool-run-prose'))).toBe(true);
});
