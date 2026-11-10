// e2e/tool-card-lifecycle.spec.mjs — the declarative tool row's lifecycle.
//
// The imperative `.agent-tool-card` renderer is gone: React draws every tool
// row from `toolCalls[]` (react/tool-run). This spec pins the contract that
// replaced it:
//
//   • a running row reports "Running" and ticks a live elapsed counter,
//   • the terminal frame flips the row to its settled state,
//   • the row header toggles the detail disclosure.
//
// The row is driven through the real SSE contract (`tool_use` → `tool_result`)
// rather than a synthetic DOM tree, so the assertions cover the same path the
// server drives.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const TOOL_ID = 'lifecycle-code-1';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';

/**
 * Replace the chat stream with a controllable one. The tool frames carry the
 * same payload shape the server emits (see server toolExecutors.ts).
 */
async function installToolStream(page) {
  await page.addInitScript((toolId) => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let ref = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) { ref = controller; },
      });
      window.__pushText = (content) => {
        ref.enqueue(encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
        ));
      };
      window.__pushToolUse = () => {
        ref.enqueue(encoder.encode(frame('tool_use', [
          { id: toolId, name: 'code_interpreter', input: { code: 'print(1)', language: 'python' } },
        ])));
      };
      window.__pushToolResult = () => {
        ref.enqueue(encoder.encode(frame('tool_result', {
          id: toolId,
          name: 'code_interpreter',
          ok: true,
          status: 'completed',
          output: '1',
          stderr: '',
          artifacts: [],
        })));
      };
      return Promise.resolve(new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }));
    };
  }, TOOL_ID);
}

/** Boot the app, start one turn, and return the assistant bubble. */
async function startTurn(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate((sessionId) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    window.stateStore.dispatch({
      type: 'state/set', key: 'messages',
      value: [{ clientId: 'lifecycle-user', role: 'user', rawText: 'run it', html: null }],
    });
    window.__testActivateMainView('chatView');
    window.__lifecyclePromise = window.askChatTurn('run it');
  }, SESSION_ID);
  await page.waitForFunction(() => typeof window.__pushToolUse === 'function', null, { timeout: 15_000 });
  return page.locator('.msg.assistant').last().locator('.msg-body');
}

test('the declarative tool row runs, settles, and opens its details', async ({ page }) => {
  await installToolStream(page);
  const bubble = await startTurn(page);

  /* A finished paragraph first: a tool row mounts behind the prose that
     introduced it, so the offset it carries is a real sentence boundary. */
  await page.evaluate(() => window.__pushText('Running the snippet now.\n\n'));
  await page.evaluate(() => window.__pushToolUse());

  const row = bubble.locator(`.rn-tool-row[data-tcid="${TOOL_ID}"]`);
  const rowButton = row.getByTestId(`tool-row-${TOOL_ID}`);
  await expect(row).toHaveCount(1);

  // Running: the row carries the running state, a spinner, and nothing else.
  await expect(row).toHaveAttribute('data-state', 'running');
  await expect(row.getByTestId('thinking-step-spinner')).toHaveCount(1);
  await expect(row.getByTestId('thinking-step-title')).toContainText('Executing code');

  // Only the secondary duration ticks; the current-action label is stable.
  await expect(bubble.getByTestId('turn-activity-label')).toContainText('Executing code');
  const meta = bubble.getByTestId('turn-activity-duration');
  const readMeta = async () => (await meta.count()) ? (await meta.first().innerText()).trim() : '';
  await expect.poll(readMeta, { timeout: 10_000 }).toMatch(/\d/);
  const firstReading = await readMeta();
  await expect.poll(readMeta, { timeout: 10_000 }).not.toBe(firstReading);

  // The terminal frame settles the row.
  await page.evaluate(() => window.__pushToolResult());
  await expect(row).toHaveAttribute('data-state', 'done');
  await expect(row.getByTestId('thinking-step-spinner')).toHaveCount(0);

  // The settled row opens its detail inline on demand; a second press folds it.
  const activityToggle = bubble.getByTestId('turn-activity-toggle');
  if (await activityToggle.count()) {
    const isExpanded = await activityToggle.getAttribute('aria-expanded');
    if (isExpanded !== 'true') {
      await activityToggle.click();
    }
  }

  await expect(rowButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
  await rowButton.click();
  const detail = page.getByTestId('tool-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId('tool-detail-section-input')).toBeVisible();
  await rowButton.click();
  await expect(page.getByTestId('tool-detail')).toHaveCount(0);
});
