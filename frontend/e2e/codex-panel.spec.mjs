// Codex is a first-class adapter inside the Socrates conversation. These
// smoke tests deliberately exercise the shared chat stream, inline tool row,
// approval surface, and run-history API instead of a separate Codex modal.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '22222222-2222-4222-8222-222222222222';

/* The approval row's label is asserted in English below; the app ships with zh
   as its default language, so pin the locale rather than assert on whichever
   one the profile happens to boot with. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-lang-app', 'en'); } catch (_) {}
  });
});

function enterChat(page) {
  return page.evaluate(() => {
    const sessionId = '33333333-3333-4333-8333-333333333333';
    window.state.phase = 'chat';
    window.state.topic = 'Codex integration smoke';
    window.state.currentSessionId = sessionId;
    window.state.session.currentSessionId = sessionId;
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
  });
}

function unifiedStreamBody() {
  return [
    'event: tool_use\ndata: [{"id":"tc-codex-1","name":"workspace_agent","input":{"task":"inspect the project and report the result"}}]\n\n',
    'event: tool_progress\ndata: {"id":"tc-codex-1","runId":"' + RUN_ID + '","phase":"planning","event":"planning"}\n\n',
    'event: tool_progress\ndata: {"id":"tc-codex-1","runId":"' + RUN_ID + '","phase":"working","event":"tool","command":"npm test"}\n\n',
    'event: tool_approval\ndata: {"id":"tc-codex-1","runId":"' + RUN_ID + '","approvalId":"' + APPROVAL_ID + '","requestId":"42","kind":"commandExecution","reason":"Run the project verification command","command":"npm test","cwd":"[workspace]","availableDecisions":["accept","acceptForSession","decline"]}\n\n',
    'event: tool_result\ndata: {"id":"tc-codex-1","name":"workspace_agent","runId":"' + RUN_ID + '","status":"awaiting_approval","ok":true,"output":"","artifacts":[]}\n\n',
    'data: {"choices":[{"delta":{"content":"Codex 已暂停，等待你的审批。"}}]}\n\n',
    'data: [DONE]\n\n',
  ].join('');
}

async function mockUnifiedChat(page) {
  const decisions = [];
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: unifiedStreamBody() });
  });
  await page.route(new RegExp('/api/(?:v2/)?agent-runs/' + RUN_ID + '/approvals/' + APPROVAL_ID + '$'), async (route) => {
    decisions.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'accepted' }) });
  });
  await page.route(new RegExp('/api/(?:v2/)?agent-runs/' + RUN_ID + '$'), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: { id: RUN_ID, status: 'awaiting_approval', summary: null }, approvals: [] }),
    });
  });
  return decisions;
}

test('Codex activation adds a composer context, not a standalone panel', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await page.evaluate(() => window.__socratesExtensionDispatch?.('codex'));
  await expect(page.locator('#chatComposerRoot .composer-extension-token')).toBeVisible();
  await expect(page.locator('#chatComposerRoot .composer-extension-token-label')).toContainText('Codex');
  await expect(page.locator('.codex-panel')).toHaveCount(0);
});

test('Chat renders Codex progress and an actionable approval inline', async ({ page }) => {
  await mockAuthedApp(page);
  await mockUnifiedChat(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await page.evaluate(() => window.submitChatMessage('Inspect the project with Codex.'));

  const approval = page.locator('.tool-inline-approval');
  await expect(approval).toBeVisible();
  await expect(approval).toContainText('npm test');
  await expect(approval.locator('[data-approval-action="accept"]')).toBeVisible();
  await expect(approval.locator('[data-approval-action="acceptForSession"]')).toBeVisible();
  await expect(approval.locator('[data-approval-action="decline"]')).toBeVisible();
  await expect(approval.locator('[data-approval-action="stop"]')).toBeVisible();
  await expect(page.locator('.tool-inline-label')).toContainText(/approval|decision/i);
});

test('approval decision uses the durable run and approval ids', async ({ page }) => {
  await mockAuthedApp(page);
  const decisions = await mockUnifiedChat(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await enterChat(page);

  await page.evaluate(() => window.submitChatMessage('Run the verification command.'));
  const approval = page.locator('.tool-inline-approval');
  await expect(approval).toBeVisible();
  await approval.locator('[data-approval-action="accept"]').click();
  await expect.poll(() => decisions.length, { timeout: 5_000 }).toBe(1);
  expect(decisions[0]).toEqual({ decision: 'accept' });
  await expect(approval).toHaveAttribute('data-state', 'accepted');
});
