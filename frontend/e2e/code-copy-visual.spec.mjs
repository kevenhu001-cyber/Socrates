// e2e/code-copy-visual.spec.mjs — Task 10.5 (chat-experience-revamp)
//
// Playwright spec for the code-block copy control and the message-bubble
// visual smoke (Requirements 3.6, 3.7, 5.3).
//
// Flow under test:
//   1. Render a user message and an assistant message that contains a
//      fenced code block, via window.addMessage(role, text). React's
//      MessageList paints the bubbles; main.js `wireCodeBlockHeaders`
//      adds the `.code-block-header` chrome, and the MutationObserver in
//      render/markdown.ts (installCodeBlockCopy) injects a
//      `<button class="code-block-copy">` with a `.code-block-copy-label`.
//   2. Clicking the copy button copies the sibling `<pre>`'s `<code>`
//      textContent to the clipboard. Headless clipboard access can be
//      restricted, so we stub navigator.clipboard.writeText via
//      addInitScript to capture the written string, and also assert the
//      button toggles its `.copied` success state as a fallback signal.
//      (Req 3.6)
//   3. Assert the user message carries `.msg.user` / `.msg-body` and the
//      assistant message carries `.msg.assistant` / `.msg-body` (the
//      revamped classes), and capture a screenshot for visual review.
//      (Req 3.7)
//
// Boot pattern mirrors react-compat.spec.mjs / chat-stop-resend.spec.mjs.
// Assertions are kept CI-tolerant (no reliance on real clipboard
// permissions or pixel baselines).

import { test } from './_lib.mjs';
import { expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const CODE_CONTENT = 'const x = 1;\nconsole.log(x);';
const ASSISTANT_MARKDOWN = '```js\n' + CODE_CONTENT + '\n```';

/* Stub navigator.clipboard.writeText before any app code runs so the copy
   control writes into a recorded buffer instead of the (restricted) system
   clipboard. The recorded value is read back via window.__clipboardWrites. */
function installClipboardStub(page) {
  return page.addInitScript(() => {
    window.__clipboardWrites = [];
    const record = (text) => {
      window.__clipboardWrites.push(String(text));
      return Promise.resolve();
    };
    try {
      // Redefine writeText; fall back to defining clipboard if absent.
      if (navigator.clipboard) {
        Object.defineProperty(navigator.clipboard, 'writeText', {
          configurable: true,
          value: record,
        });
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: record },
        });
      }
    } catch (_) {
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: record },
        });
      } catch (__) { /* ignore */ }
    }
  });
}

/* Boot into the chat shell and render a user + assistant turn. The
   assistant message contains a fenced code block so the code-block header
   and its injected copy control mount. */
async function bootChatWithCodeBlock(page) {
  await page.evaluate(async (payload) => {
    const sessionId = '88888888-8888-4888-8888-888888888888';
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    try { window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId }); } catch (_) {}
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: [] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');

    window.addMessage('user', 'Show me a snippet.');
    window.addMessage('assistant', payload.md);
    // Let React commit the bubbles and the header/copy passes run.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { md: ASSISTANT_MARKDOWN });
}

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await installClipboardStub(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('clicking copy on a code block writes the code content to the clipboard', async ({ page }) => {
  await bootChatWithCodeBlock(page);

  // The assistant bubble renders a code block with a header. The copy
  // control is injected into the header by the MutationObserver.
  const assistant = page.locator('.msg.assistant').last();
  const copyBtn = assistant.locator('.code-block-header .code-block-copy');
  await expect(copyBtn).toHaveCount(1);
  await expect(assistant.locator('.code-block-copy-label')).toHaveCount(1);

  // Click copy — writes the sibling <pre>'s <code> textContent.
  await copyBtn.click();

  // Primary signal: the recorded clipboard write equals the code content.
  // The rendered <code> textContent may normalize trailing whitespace, so
  // compare on the meaningful code lines rather than exact bytes.
  await expect
    .poll(() => page.evaluate(() => (window.__clipboardWrites || [])[0] || ''))
    .toContain('const x = 1;');
  await expect
    .poll(() => page.evaluate(() => (window.__clipboardWrites || [])[0] || ''))
    .toContain('console.log(x);');

  // Fallback signal: the button toggles its success state after copy.
  await expect(copyBtn).toHaveClass(/copied/);
});

test('user/assistant messages carry the revamped classes; capture a visual screenshot', async ({ page }) => {
  await bootChatWithCodeBlock(page);

  // Revamped message-bubble classes (Req 3.7): the user turn is a
  // `.msg.user` with a `.msg-body`, the assistant turn a `.msg.assistant`
  // with a `.msg-body`.
  const userMsg = page.locator('.msg.user').last();
  const assistantMsg = page.locator('.msg.assistant').last();
  await expect(userMsg).toHaveCount(1);
  await expect(assistantMsg).toHaveCount(1);
  await expect(userMsg.locator('.msg-body')).toHaveCount(1);
  await expect(assistantMsg.locator('.msg-body')).toHaveCount(1);

  // The assistant body renders the revamped code-block chrome.
  await expect(assistantMsg.locator('.code-block-header')).toHaveCount(1);

  // Capture a screenshot for visual review. A plain capture (not a
  // baseline snapshot) avoids pixel-baseline flakiness on CI.
  await page.screenshot({ path: 'test-results/chat-visual-smoke.png' });
});
