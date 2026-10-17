import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { gotoAndSettle } from './_lib.mjs';

async function controller(page) {
  await page.evaluate(async () => {
    window.__activityController = await window.addStreamingMessage({ userPrompt: '为什么 React 页面掉帧，先检查状态管理再看动画？' });
    window.__activityController.recordTurnActivity({ type: 'thinking' });
    window.__activityController.appendThinking('PRIVATE SCRATCH WORK: 第一阶段检查组件树。');
  });
}

test('activity hands the same message body to the first answer token', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__thinkingController = await window.addStreamingMessage({ userPrompt: '先分析问题，再给出答案。' });
    window.__thinkingController.recordTurnActivity({ type: 'thinking' });
  });

  const message = page.locator('#msgList .msg.assistant').last();
  const surface = message.locator('.msg-body.turn-surface');
  await expect(surface).toHaveCount(1);
  await expect(surface).toHaveAttribute('data-ui-surface', 'assistant-turn');
  await expect(surface).toHaveAttribute('data-turn-state', 'live');
  const status = message.locator('.thinking-status');
  await expect(status).toHaveCount(1);
  await expect(status.locator('.turn-activity-dot')).toHaveCount(1);
  await expect(status.locator('.thinking-status-label')).not.toHaveClass(/shimmer-text/);
  const before = await status.boundingBox();

  await page.evaluate(() => window.__thinkingController.append('回答从同一个消息正文位置开始。'));
  await expect(message.locator('.thinking-status')).toHaveCount(0);
  const answer = message.locator('.tool-run-prose p').first();
  await expect(answer).toContainText('回答从同一个消息正文位置开始。');
  await expect(surface).toHaveAttribute('data-turn-state', 'live');
  const after = await answer.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x || 0) - (before?.x || 0))).toBeLessThanOrEqual(8);
});

test('waiting time is separate from observed model reasoning', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    // Advance only the turn's wall clock; avoid sleeping five seconds per test.
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    window.__advanceReasoningClock = () => { offset = 5000; };
    window.__waitingController = await window.addStreamingMessage({});
    window.__waitingController.recordTurnActivity({ type: 'thinking' });
  });
  const message = page.locator('#msgList .msg.assistant').last();
  const status = message.locator('.thinking-status');
  await expect(status).toHaveAttribute('data-phase', 'waiting');
  await page.evaluate(() => window.__advanceReasoningClock());
  await expect(status.locator('.thinking-status-detail')).toContainText(/[5-9]s/);
  await page.screenshot({ path: 'test-results/waiting-response.png' });
  await page.evaluate(() => window.__waitingController.appendThinking('PRIVATE REASONING'));
  await expect(status).toHaveAttribute('data-phase', 'thinking');
  await expect(status.locator('.thinking-status-detail')).toHaveCount(0);
  const duration = await page.evaluate(() => window.stateStore.read('messages').at(-1).reasoningDurationSec);
  expect(duration).toBe(0);
  await page.screenshot({ path: 'test-results/observed-reasoning.png' });
  await expect(message).not.toContainText('PRIVATE REASONING');
  await page.evaluate(() => window.__waitingController.append('这才是正文。'));
  await expect(status).toHaveCount(0);
  await page.evaluate(() => window.__waitingController.finish());
});

test('settled assistant history keeps the same surface when only legacy HTML exists', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [
    { clientId: 'history-user', role: 'user', rawText: '历史问题', html: '<p>历史问题</p>' },
    { clientId: 'history-assistant', role: 'assistant', rawText: '', html: '<p>历史答案仍在同一个回答 surface 中。</p>' },
  ] });

  const message = page.locator('#msgList .msg.assistant').last();
  const surface = message.locator('.msg-body.turn-surface');
  await expect(surface).toHaveAttribute('data-ui-surface', 'assistant-turn');
  await expect(surface).toHaveAttribute('data-turn-state', 'settled');
  await expect(surface.locator('.tool-run-prose')).toContainText('历史答案仍在同一个回答 surface 中。');
});

test('streaming actions are absent and running tools own the activity surface', async ({ page }) => {
  await prepareChatWorkbench(page);
  await controller(page);
  const message = page.locator('#msgList .msg.assistant').last();
  await expect(message.locator('.thinking-status')).toHaveCount(1);
  await expect(message.locator('.msg-toolbar')).toBeHidden();
  await expect(message).not.toContainText('PRIVATE SCRATCH WORK');
  await expect(message).not.toContainText('相关解析与说明');

  await page.evaluate(() => {
    const ctl = window.__activityController;
    ctl.recordTurnActivity({ type: 'tool', toolCallId: 'search', toolName: 'web_search' });
    ctl.recordToolUse({ id: 'search', name: 'web_search', input: { query: 'React Context rendering' } });
    ctl.appendThinking('More private scratch work while searching.');
  });
  await expect(message.locator('.tool-inline[data-state="running"]')).toHaveCount(1);
  await expect(message.locator('.thinking-status')).toHaveCount(1);
  await expect(message.locator('.turn-activity-surface')).toHaveCount(1);
  await expect(message.locator('.turn-activity-dot')).toHaveCount(1);
  await expect(message.locator('.msg-toolbar button')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/turn-activity-running.png' });

  await page.evaluate(() => {
    const ctl = window.__activityController;
    ctl.recordToolResult({ id: 'search', name: 'web_search', ok: true, status: 'completed', output: 'Found documentation.', results: [] });
    ctl.recordTurnActivity({ type: 'synthesizing' });
    ctl.append('The relevant evidence is now in the answer.');
    ctl.recordTurnActivity({ type: 'done', durationMs: 1200 });
  });
  await expect(message.locator('.msg-toolbar')).toBeHidden();
  await page.evaluate(() => window.__activityController.finish());
  await expect(message).toHaveAttribute('data-stream-settled', 'true');
  await expect(message.locator('.msg-body.turn-surface')).toHaveAttribute('data-turn-state', 'settled');
  await expect(message.locator('.msg-toolbar button').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/turn-activity-settled.png' });
});

test('detail-free rows are static and native UI output is outside disclosure', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'native-ui', role: 'assistant', rawText: 'Adjust the inputs below.', type: null,
    toolCalls: [{ id: 'ui', name: 'render_intelligent_ui', status: 'completed', textOffset: 0, output: '', input: {
      version: 1, nodes: [
        { id: 'panel', type: 'panel', title: 'Evidence', state: { count: 2 } },
        { id: 'value', type: 'metric', parent: 'panel', label: 'Count', value: { state: 'count' } },
        { id: 'add', type: 'button', parent: 'panel', label: 'Add one', action: { type: 'increment', key: 'count', value: 1 } },
      ],
    } }],
  }] });
  await expect(page.locator('.intui')).toBeVisible();
  const before = await page.locator('.intui').innerText();
  await page.getByRole('button', { name: 'Add one', exact: true }).click();
  await expect.poll(() => page.locator('.intui').innerText()).not.toBe(before);
  await page.locator('.thinking-accordion-toggle').click();
  await page.locator('.tool-inline summary').click();
  await expect(page.locator('.intui')).toBeVisible();

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{
      clientId: 'static-row', role: 'assistant', rawText: 'Done.', type: null,
      toolCalls: [{ id: 'empty', name: 'unknown_tool', status: 'completed', textOffset: 0, output: '' }],
    }] });
    window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'static-row-fixture' });
  });
  await expect(page.locator('div.tool-inline[data-tcid="empty"]')).toHaveCount(1);
  await expect(page.locator('.tool-inline summary, details.tool-inline')).toHaveCount(0);
});

test('native UI survives a tool-only settled turn and recovers raw streamed arguments', async ({ page }) => {
  const document = {
    version: 1,
    nodes: [
      { id: 'panel', type: 'panel', title: 'Recovered UI' },
      { id: 'value', type: 'metric', parent: 'panel', label: 'Score', value: 7 },
    ],
  };
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'native-ui-tool-only', role: 'assistant', rawText: '', html: '', type: null,
    toolCalls: [{
      id: 'ui-raw', name: 'render_intelligent_ui', status: 'completed', textOffset: 0,
      output: 'Rendered 2 UI nodes', input: { __raw: JSON.stringify(document) },
    }],
  }] });

  const message = page.locator('#msgList .msg.assistant[data-client-id="native-ui-tool-only"]');
  await expect(message).toHaveCount(1);
  await expect(message.locator('.intui')).toBeVisible();
  await expect(message.locator('[data-intui-id="panel"]')).toContainText('Recovered UI');
  await expect(message.locator('[data-intui-id="value"]')).toContainText('7');
});

test('native UI can mount from cumulative arguments before the tool result arrives', async ({ page }) => {
  const document = {
    version: 1,
    nodes: [
      { id: 'panel', type: 'panel', title: 'Live UI' },
      { id: 'progress', type: 'progress', parent: 'panel', label: 'Ready', value: 40, max: 100 },
    ],
  };
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'native-ui-arguments', role: 'assistant', rawText: '', html: '', type: null,
    toolCalls: [{
      id: 'ui-arguments', name: 'render_intelligent_ui', status: 'running', textOffset: 0,
      output: null, input: null, argumentsText: JSON.stringify(document),
    }],
  }] });

  const message = page.locator('#msgList .msg.assistant[data-client-id="native-ui-arguments"]');
  await expect(message).toHaveCount(1);
  await expect(message.locator('.intui')).toBeVisible();
  await expect(message.locator('.intui')).toHaveAttribute('data-intui-streaming', 'true');
  await expect(message.locator('[data-intui-id="progress"]')).toContainText('40%');
});


test('MiniMax M3 requests split reasoning without an unsupported low-effort claim', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('socrates-last-active-id', 'minimax-m3');
    localStorage.setItem('socrates-reasoning-effort', 'low');
  });
  await mockAuthedApp(page, { apiKeys: { providers: [{ id: 'minimax-m3', label: 'MiniMax', model: 'MiniMax-M3', url: 'https://provider.example/v1', hasKey: true, isActive: true }] } });
  let sentBody;
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async route => {
    sentBody = route.request().postDataJSON();
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"M3 answer."}}]}\n\ndata: [DONE]\n\n' });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.__testActivateMainView('chatView');
    window.submitChatMessage('Say hello.');
  });
  await expect.poll(() => sentBody).toBeTruthy();
  expect(sentBody.extra_body).toEqual({ reasoning_split: true });
  expect(sentBody.reasoning_effort).toBeUndefined();
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('M3 answer.');
});
