// Codex agent workspace panel — embedded Codex harness (P1).
//
// Drives the panel through the public extension dispatch
// (window.__socratesExtensionDispatch('codex')) and mocks the /api/codex/*
// bridge: thread creation, the SSE turn stream (codex_* events) and the
// approval decision endpoint. Verifies:
//   1. The panel opens from the "+" tools extension registry.
//   2. A turn streams text, tool activity and a final answer.
//   3. An approval card renders the command; Accept/Decline POST the
//      decision back with the SSE requestId.
//   4. Errors surface as a visible notice and the stream ends cleanly.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const THREAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function codexStreamBody({ approval = true } = {}) {
  const frames = [
    'event: codex_init\ndata: {"threadId":"' + THREAD_ID + '"}\n\n',
    'event: codex_turn_started\ndata: {"turnId":"turn-1","status":"inProgress"}\n\n',
    'event: codex_reasoning\ndata: {"itemId":"reas-1","delta":"先拆解任务。"}\n\n',
    'event: codex_tool\ndata: {"itemId":"exec-1","type":"commandExecution","command":"echo hello-socrates","cwd":"/ws","status":"inProgress"}\n\n',
  ];
  if (approval) {
    frames.push(
      'event: codex_approval\ndata: {"requestId":42,"kind":"commandExecution","itemId":"exec-1","threadId":"' + THREAD_ID + '","turnId":"turn-1","reason":"Approve this command?","command":"echo hello-socrates","availableDecisions":["accept","decline"]}\n\n',
    );
  }
  frames.push(
    'event: codex_tool_output\ndata: {"itemId":"exec-1","delta":"hello-socrates\\n"}\n\n',
    'event: codex_delta\ndata: {"itemId":"msg-1","delta":"**done** — 输出为 "}\n\n',
    'event: codex_delta\ndata: {"itemId":"msg-1","delta":"`hello-socrates`。"}\n\n',
    'event: codex_turn_completed\ndata: {"turnId":"turn-1","status":"completed","error":null}\n\n',
    'event: codex_done\ndata: {}\n\n',
  );
  return frames.join('');
}

async function mockCodexApi(page, { approval = true } = {}) {
  const approvals = [];
  await page.route('**/api/**/codex/threads', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ threadId: THREAD_ID, cwd: '/ws', model: 'gpt-5.1-codex', modelProvider: 'user' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/**/codex/capabilities', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, providerMode: 'user', model: 'gpt-5.1-codex' }) });
  });
  await page.route('**/api/**/codex/threads/' + THREAD_ID + '/turns', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: codexStreamBody({ approval }) });
  });
  await page.route('**/api/**/codex/threads/' + THREAD_ID + '/approvals', async (route) => {
    const body = route.request().postDataJSON?.() || {};
    approvals.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  return approvals;
}

async function openPanel(page) {
  await page.evaluate(() => window.__socratesExtensionDispatch?.('codex'));
  const panel = page.locator('.codex-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('codex panel opens from the tools registry and streams a full turn', async ({ page }) => {
  await mockAuthedApp(page);
  await mockCodexApi(page);

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const panel = await openPanel(page);
  await expect(panel.locator('.codex-empty')).toBeVisible();

  // Empty-state hint then a turn.
  await panel.locator('input').fill('运行一条命令并汇报');
  await panel.locator('.codex-send').click();

  await expect(panel.locator('.codex-msg.user')).toContainText('运行一条命令并汇报');
  // Reasoning is captured into the collapsible thinking block.
  const thinking = panel.locator('.codex-thinking');
  await expect(thinking).toBeVisible();
  await expect(thinking.locator('.codex-thinking-body')).toContainText('先拆解任务');
  // Tool card with the command.
  const tool = panel.locator('.codex-tool');
  await expect(tool).toContainText('Command');
  await expect(tool).toContainText('echo hello-socrates');
  // Approval card with Accept/Decline.
  const approval = panel.locator('.codex-approval');
  await expect(approval).toBeVisible();
  await expect(approval.locator('.approve')).toBeVisible();
  await expect(approval.locator('.decline')).toBeVisible();
  // Command output lands in the tool card.
  await expect(tool.locator('.codex-tool-out')).toContainText('hello-socrates');
  // Streaming answer renders markdown (bold + inline code).
  const answer = panel.locator('.codex-msg.assistant').last();
  await expect(answer).toContainText('done');
  await expect(answer.locator('strong')).toHaveCount(1);
  await expect(answer.locator('code')).toHaveCount(1);
  await expect(panel.locator('.codex-run-footer')).toContainText('Done');
  // Stream ended → Send re-enabled.
  await expect(panel.locator('.codex-send')).toBeEnabled();
});

test('approval Accept posts the decision with the SSE requestId', async ({ page }) => {
  await mockAuthedApp(page);
  const approvals = await mockCodexApi(page);

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const panel = await openPanel(page);

  await panel.locator('input').fill('Run it');
  await panel.locator('.codex-send').click();

  const approval = panel.locator('.codex-approval');
  await expect(approval).toBeVisible();
  await approval.locator('.approve').click();

  await expect
    .poll(() => approvals.length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(approvals[0]).toEqual({ requestId: 42, decision: 'accept' });
  await expect(approval.locator('.codex-approval-body')).toContainText('accepted');
});

test('approval Decline posts decline and disables the buttons', async ({ page }) => {
  await mockAuthedApp(page);
  const approvals = await mockCodexApi(page);

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const panel = await openPanel(page);

  await panel.locator('input').fill('Do not run it');
  await panel.locator('.codex-send').click();

  const approval = panel.locator('.codex-approval');
  await expect(approval).toBeVisible();
  await approval.locator('.decline').click();

  await expect
    .poll(() => approvals.length, { timeout: 5000 })
    .toBeGreaterThan(0);
  expect(approvals[0]).toEqual({ requestId: 42, decision: 'decline' });
  await expect(approval.locator('.codex-approval-body')).toContainText('declined');
  await expect(approval.locator('.approve')).toBeDisabled();
});

test('codex turn errors surface as a visible notice', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/**/codex/threads', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ threadId: THREAD_ID, cwd: '/ws', model: 'gpt-5.1-codex', modelProvider: 'user' }),
    });
  });
  await page.route('**/api/**/codex/threads/' + THREAD_ID + '/turns', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: codex_error\ndata: {"message":"provider rejected the request"}\n\n',
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  const panel = await openPanel(page);

  await panel.locator('input').fill('Will this fail');
  await panel.locator('.codex-send').click();

  await expect(panel.locator('.codex-error')).toContainText('provider rejected the request');
  await expect(panel.locator('.codex-send')).toBeEnabled();
});