// Codex agent steps in the live chat.
//
// The workspace agent used to render as one opaque row. The server now
// projects each Codex thread item into an `agent_step` frame and its todo
// list into `agent_plan`, and the chat renders them as a step list in the
// reading flow. This spec drives those frames through the real streaming
// path and asserts:
//   1. steps appear as their own rows with the Chinese labels,
//   2. the same stepId updates in place rather than stacking,
//   3. the plan card ticks over instead of repeating,
//   4. the run settles with its total duration, and
//   5. the steps survive the finish() re-render that serializes the bubble.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const AGENT_STREAM = [
  'event: tool_use\ndata: [{"id":"agent-1","name":"workspace_agent","input":{"task":"Read notes and append a line"}}]\n\n',
  'event: agent_plan\ndata: {"type":"plan","id":"agent-1","runId":"run-1","steps":[{"title":"读取 notes.txt","status":"in_progress"},{"title":"追加一行","status":"todo"}],"explanation":"先读后改"}\n\n',
  'event: agent_step\ndata: {"type":"step","id":"agent-1","runId":"run-1","stepId":"s1","kind":"read","title":"读取了文件","detail":"cat notes.txt","command":"cat notes.txt","status":"running","exitCode":null,"durationMs":null,"diffStat":null,"output":null}\n\n',
  'event: agent_step\ndata: {"type":"step","id":"agent-1","runId":"run-1","stepId":"s1","kind":"read","title":"读取了文件","detail":"cat notes.txt","command":"cat notes.txt","status":"done","exitCode":0,"durationMs":180,"diffStat":null,"output":"alpha\\nbeta"}\n\n',
  'event: agent_step\ndata: {"type":"step","id":"agent-1","runId":"run-1","stepId":"s2","kind":"command","title":"运行了命令","detail":"npm run test:unit","command":"npm run test:unit","status":"done","exitCode":0,"durationMs":2400,"diffStat":null,"output":"226 pass"}\n\n',
  'event: agent_step\ndata: {"type":"step","id":"agent-1","runId":"run-1","stepId":"s3","kind":"file_change","title":"编辑了文件","detail":"notes.txt  +1 -0","command":null,"status":"done","exitCode":null,"durationMs":null,"diffStat":{"files":1,"added":1,"removed":0,"paths":["[workspace]/notes.txt"]},"output":null}\n\n',
  'event: agent_plan\ndata: {"type":"plan","id":"agent-1","runId":"run-1","steps":[{"title":"读取 notes.txt","status":"done"},{"title":"追加一行","status":"done"}]}\n\n',
  'event: tool_result\ndata: {"id":"agent-1","name":"workspace_agent","runId":"run-1","ok":true,"status":"completed","output":"Appended one line.","durationMs":62000,"artifacts":[]}\n\n',
  'data: {"choices":[{"delta":{"content":"已读取 notes.txt 并追加了一行。"}}]}\n\n',
  'data: [DONE]\n\n',
].join('');

test('the workspace agent streams its steps into the chat', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/chat/stream', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: AGENT_STREAM });
  });
  /* The reference wording is Chinese, so run this spec in the zh locale;
     the English dictionary entries are covered by the unit tests. */
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'zh'); } catch (_) { /* ignore */ }
  });

  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    window.state.phase = 'chat';
    window.state.currentSessionId = '22222222-2222-4222-8222-222222222222';
    window.state.messages = [{ clientId: 'user-1', role: 'user', rawText: 'Do the workspace task', html: null }];
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    await window.askChatTurn('Do the workspace task');
  });

  const bubble = page.locator('.msg.assistant').last();
  const steps = bubble.locator('.agent-step');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0).locator('.agent-step-label')).toHaveText('读取了文件');
  await expect(steps.nth(1).locator('.agent-step-label')).toHaveText('已运行 npm run test:unit');
  await expect(steps.nth(2).locator('.agent-step-label')).toHaveText('编辑了文件');
  await expect(steps.nth(1).locator('.agent-step-meta')).toContainText('2.4s');
  await expect(steps.nth(2).locator('.agent-step-meta')).toContainText('+1 -0');
  /* Diff counts live in the meta column, so the excerpt only names files. */
  await expect(steps.nth(2).locator('.agent-step-cmd')).toHaveText('notes.txt');

  // One plan card per run, showing the final state of every item.
  const plan = bubble.locator('.agent-plan');
  await expect(plan).toHaveCount(1);
  await expect(plan).toHaveAttribute('data-progress', '2/2');
  await expect(plan.locator('.agent-plan-item')).toHaveCount(2);

  // The run reports its total duration and is collapsed once finished.
  const run = bubble.locator('.agent-run');
  await expect(run).toHaveAttribute('data-state', 'done');
  await expect(run.locator('.agent-run-elapsed')).toHaveText('用时 1m 2s');

  // Expanding a step reveals the command and its output.
  await steps.nth(1).locator('.agent-step-head').click();
  await expect(steps.nth(1).locator('.agent-step-pre[data-kind="output"]')).toContainText('226 pass');

  // The step list survives the final serialization (persisted html), which is
  // what makes it come back after a reload.
  const persisted = await page.evaluate(() => {
    const message = window.state.messages[window.state.messages.length - 1];
    return message && message.html ? message.html : '';
  });
  expect(persisted).toContain('agent-run-host');
  expect(persisted).toContain('读取了文件');

  const stored = await page.evaluate(() => {
    const message = window.state.messages[window.state.messages.length - 1];
    const call = (message.toolCalls || []).find((entry) => entry.name === 'workspace_agent');
    return call ? { runId: call.runId, steps: (call.steps || []).map((s) => s.stepId), plan: !!call.plan } : null;
  });
  expect(stored).toEqual({ runId: 'run-1', steps: ['s1', 's2', 's3'], plan: true });
});
