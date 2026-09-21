// e2e/re-explain.spec.mjs — the Re-explain button must branch with a
// visible re-explain prompt and fire a real turn; cancelling the
// new-session confirm must not push anything or fire a turn.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const RE_EXPLAIN_TEXT = 'Please re-explain that from a different angle. Use a different approach, analogy, or teaching method to help me understand better.';

async function bootChat(page, streamBodies) {
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    streamBodies.push(route.request().postDataJSON());
    const content = 'Re-explained answer with $x^2$ math.';
    const sse = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Branch repro' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: '55555555-5555-4555-8555-555555555555' });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.addMessage('user', 'Explain how derivatives work.');
    window.addMessage('assistant', 'A derivative measures change: $f\'(x)$.');
  });
  await expect(page.locator('#msgList .msg')).toHaveCount(2);
}

/* E1: re-explain moved behind the assistant toolbar's "…" overflow, so
   tests must open the menu before clicking the item. data-msg-action is
   locale-proof, unlike the old aria-label selector. */
async function clickReExplain(page) {
  const toolbar = page.locator('#msgList .msg.assistant .msg-toolbar').last();
  await toolbar.locator('.msg-toolbar-more-btn').click();
  await toolbar.locator('button[data-msg-action="re-explain"]').click();
}

test('re-explain sends a visible prompt and streams an answer', async ({ page }) => {
  const streamBodies = [];
  await bootChat(page, streamBodies);

  await clickReExplain(page);
  const confirmBtn = page.locator('#confirmOkBtn');
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }

  const promptBubble = page.locator('#msgList .msg.user').last();
  await expect(promptBubble.locator('.msg-body')).toHaveText(RE_EXPLAIN_TEXT);
  await expect(page.locator('#msgList .msg.assistant .msg-body').last()).toContainText('Re-explained answer');
  expect(streamBodies.length).toBeGreaterThanOrEqual(1);
  const lastBody = streamBodies[streamBodies.length - 1];
  const lastUser = lastBody.messages.filter((m) => m.role === 'user').pop();
  expect(lastUser.content).toBe(RE_EXPLAIN_TEXT);
});

test('cancelling the re-explain confirm pushes nothing and fires no turn', async ({ page }) => {
  const streamBodies = [];
  await bootChat(page, streamBodies);

  await clickReExplain(page);
  await expect(page.locator('#confirmDialog')).not.toHaveClass(/hidden/);
  /* M4 step 4.5c — the confirm dialog is React-owned; the cancel
     button is now #confirmCancelBtn (no more data-action closeConfirm). */
  await page.locator('#confirmCancelBtn').click();
  await page.waitForTimeout(500);

  const state = await page.evaluate(() => ({
    userTexts: Array.from(document.querySelectorAll('#msgList .msg.user')).map((u) => (u.querySelector('.msg-body')?.textContent || '').trim()),
    msgCount: document.querySelectorAll('#msgList .msg').length,
  }));
  expect(state.userTexts).toEqual(['Explain how derivatives work.']);
  expect(state.msgCount).toBe(2);
  expect(streamBodies.length).toBe(0);
});
