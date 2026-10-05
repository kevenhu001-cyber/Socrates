// e2e/chat-stop-resend.spec.mjs — Task 10.3 (chat-experience-revamp)
// Playwright spec for the Stop / Resend controls (Requirements 2.6, 2.7, 5.3).
//
// Flow under test:
//   1. Send a message so a stream begins and the send button (#composerPrimaryBtn)
//      morphs into a Stop control (setChatStopState(true) → dataset.stop==="1"
//      and class "chat-stop").  [Req 2.5 precondition]
//   2. Click Stop mid-stream. window.handleSendClick aborts the active stream
//      because dataset.stop==="1"; the stream halts and the stopped assistant
//      bubble grows a Resend control:
//         <button class="msg-retry-btn chat-resend-btn" data-chat-resend>
//      inside a .msg-error.msg-resend block.  [Req 2.6]
//   3. Click Resend → window.resendLastUserMessage() starts a NEW turn from the
//      latest user message via window.askChatTurn(text).  [Req 2.7]
//
// The chat stream is stubbed so it emits one content delta (so the bubble has
// visible partial text — the source only offers Resend when a partial answer
// was rendered) and then stays open, so Stop has an in-progress stream to
// halt. Assertions are kept tolerant for CI (no third-party CDN globals).

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { gotoAndSettle } from './_lib.mjs';

/* Install a fetch override that keeps the chat SSE open after one content
   delta, so the turn stays "in progress" until the test aborts it.
   Exposes window.__finishStopStream() as an escape hatch to close the
   controller if a test wants to. */
function installOpenStream(page) {
  return page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return nativeFetch(input, init);
      const encoder = new TextEncoder();
      let controllerRef = null;
      const body = new ReadableStream({
        start(controller) {
          controllerRef = controller;
          // One content delta so the bubble has visible partial text; then
          // the stream stays open (no [DONE]) so the turn is in-progress.
          controller.enqueue(encoder.encode(
            'data: {"choices":[{"delta":{"content":"Partial answer while streaming."}}]}\n\n',
          ));
        },
        cancel() { controllerRef = null; },
      });
      window.__finishStopStream = () => {
        try {
          controllerRef.enqueue(encoder.encode('data: [DONE]\n\n'));
          controllerRef.close();
        } catch (_) {}
      };
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  });
}

async function bootChatTurn(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sessionId = '88888888-8888-4888-8888-888888888888';
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [{ clientId: 'user-stop', role: 'user', rawText: 'Stop me mid-stream', html: null }] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    window.__stopTurnPromise = window.askChatTurn('Stop me mid-stream');
  });
}

test('clicking Stop mid-stream halts the turn and surfaces Resend', async ({ page }) => {
  await installOpenStream(page);
  await bootChatTurn(page);

  const sendBtn = page.locator('#composerPrimaryBtn');

  // The send button morphs into Stop while the turn streams (Req 2.5).
  await expect
    .poll(() => page.evaluate(() => {
      const b = document.getElementById('composerPrimaryBtn');
      return Boolean(b && (b.dataset.stop === '1' || b.classList.contains('chat-stop')));
    }))
    .toBe(true);

  // Partial streamed text is visible before we stop. The typewriter may
  // still be mid-animation, so assert on a stable prefix rather than the
  // full delta text.
  const bubble = page.locator('.msg.assistant').last();
  await expect(bubble).toContainText('Partial answer');

  // Click Stop mid-stream (handleSendClick aborts the active stream).
  await sendBtn.click();

  // The stream halts: the button returns to its non-stop (send) state.
  await expect
    .poll(() => page.evaluate(() => {
      const b = document.getElementById('composerPrimaryBtn');
      return Boolean(b && b.dataset.stop !== '1' && !b.classList.contains('chat-stop'));
    }))
    .toBe(true);

  // A Resend control appears on the stopped bubble (Req 2.6).
  const resend = page.locator('[data-chat-resend]');
  await expect(resend).toBeVisible();
  await expect(page.locator('.msg-error.msg-resend')).toBeVisible();
});

test('clicking Resend starts a new turn from the latest user message', async ({ page }) => {
  await installOpenStream(page);
  await bootChatTurn(page);

  const sendBtn = page.locator('#composerPrimaryBtn');
  await expect
    .poll(() => page.evaluate(() => {
      const b = document.getElementById('composerPrimaryBtn');
      return Boolean(b && (b.dataset.stop === '1' || b.classList.contains('chat-stop')));
    }))
    .toBe(true);

  await expect(page.locator('.msg.assistant').last()).toContainText('Partial answer');

  // Stop, then wait for the Resend control.
  await sendBtn.click();
  const resend = page.locator('[data-chat-resend]');
  await expect(resend).toBeVisible();

  // Spy on askChatTurn so we can assert Resend starts a NEW turn from the
  // most recent user message (resendLastUserMessage → askChatTurn(text)).
  await page.evaluate(() => {
    window.__resendCalls = [];
    const orig = window.askChatTurn;
    window.askChatTurn = function (text) {
      window.__resendCalls.push(text);
      return orig.apply(this, arguments);
    };
  });

  await resend.click();

  // A new turn was started from the latest user message text (Req 2.7):
  // resendLastUserMessage() calls askChatTurn(text) with the most recent
  // user message.
  await expect
    .poll(() => page.evaluate(() => (window.__resendCalls || [])[0] || null))
    .toBe('Stop me mid-stream');

  // The resent turn is in progress again: the send button morphs back into
  // Stop, confirming a fresh streaming turn started from that message.
  await expect
    .poll(() => page.evaluate(() => {
      const b = document.getElementById('composerPrimaryBtn');
      return Boolean(b && (b.dataset.stop === '1' || b.classList.contains('chat-stop')));
    }))
    .toBe(true);
});

test('editing a frozen user message saves the new text and starts a replacement answer', async ({ page }) => {
  const errors = [];
  const patches = [];
  page.on('pageerror', error => errors.push(error.message));
  await installOpenStream(page);
  await bootChatTurn(page);
  await expect(page.locator('.msg.assistant').last()).toContainText('Partial answer');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-stop', '0');
  await page.route('**/api/v2/messages/user-stop?*', async route => {
    patches.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.evaluate(() => {
    window.__beforeEditSnapshot = window.stateStore.read('messages');
  });
  const user = page.locator('[data-client-id="user-stop"]');
  await user.hover();
  await user.getByRole('button', { name: 'Edit message', exact: true }).click();
  await user.locator('.msg-edit-area').fill('Updated question after editing');
  await user.locator('.msg-edit-submit').click();
  await expect(user.locator('.msg-edit-area')).toHaveCount(0);
  await expect(user.locator('.msg-body')).toContainText('Updated question after editing');
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-stop', '1');
  await expect(page.locator('.msg.assistant')).toHaveCount(1);
  await expect(page.locator('.msg.assistant')).toContainText('Partial answer');
  expect(patches).toEqual([{
    content: 'Updated question after editing', regenerate: false, discardFollowing: true,
  }]);
  expect(await page.evaluate(() => ({
    originalText: window.__beforeEditSnapshot[0].rawText,
    currentText: window.stateStore.read('messages')[0].rawText,
    replaced: window.__beforeEditSnapshot[0] !== window.stateStore.read('messages')[0],
  }))).toEqual({
    originalText: 'Stop me mid-stream', currentText: 'Updated question after editing', replaced: true,
  });
  expect(errors).toEqual([]);
  await page.locator('#composerPrimaryBtn').click();
});

for (const ending of ['abort', 'error']) {
  test(`a late ${ending} from the old turn preserves the new turn's Stop control`, async ({ page }) => {
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await page.evaluate(async () => {
      window.stateStore.dispatch({ type: 'state/batch', patch: {
        phase: 'chat', currentSessionId: '88888888-8888-4888-8888-888888888888',
        messages: [{ clientId: 'owner-user', role: 'user', rawText: 'Keep the new turn active' }],
      } });
      document.getElementById('topicSetup').classList.add('hidden');
      document.getElementById('chatView').classList.remove('hidden');
      window.__oldOwner = await window.addStreamingMessage({ clientId: 'owner-old' });
      window.__newOwner = await window.addStreamingMessage({ clientId: 'owner-new' });
    });
    const sendBtn = page.locator('#composerPrimaryBtn');
    await expect(sendBtn).toHaveAttribute('data-stop', '1');
    await page.evaluate((path) => {
      if (path === 'abort') window.__oldOwner.abort();
      else window.__oldOwner.replaceWithError('Old turn failed');
    }, ending);
    await expect(sendBtn).toHaveAttribute('data-stop', '1');
    expect(await page.evaluate(() => window.__newOwner.isFinished())).toBe(false);
    // The visible control must still stop the new owner, not merely look active.
    await sendBtn.click();
    await expect(sendBtn).toHaveAttribute('data-stop', '0');
    expect(await page.evaluate(() => window.__newOwner.isFinished())).toBe(true);
  });
}

test('caught failures report safely in the production bundle without opening an error banner', async ({ page }) => {
  const reports = [];
  const seenPaths = new Set();
  await mockAuthedApp(page);
  /* Spelling-agnostic on purpose: the path is one shared constant
     (src/util/clientErrorReporter.ts → CLIENT_ERROR_PATH), so this test
     asserts which spelling actually shipped rather than re-hardcoding it. */
  await page.route('**/client-error', async (route) => {
    seenPaths.add(new URL(route.request().url()).pathname);
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    try {
      Storage.prototype.setItem = () => { throw new TypeError('DO_NOT_SEND_PRIVATE_CONTENT'); };
      window.setLang('en');
      window.setLang('en');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
  await expect.poll(() => reports.filter((r) => /i18n.setLang.persist/.test(r.msg)).length).toBe(1);
  const report = reports.find((r) => /i18n.setLang.persist/.test(r.msg));
  expect(report.msg).toMatch(/build=[a-f0-9]{12}/);
  expect(JSON.stringify(reports)).not.toContain('DO_NOT_SEND_PRIVATE_CONTENT');
  expect([...seenPaths]).toEqual(['/api/v2/client-error']);
  await expect(page.locator('#__socrates_global_err_banner')).toHaveCount(0);
});
