import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { openActivity, toolRow, toolRowButton } from './_turn-ui.mjs';

test('completed tool bursts collapse while errors stay accessible', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  await page.route('**/api/**/chat/stream', async (route) => {
    const frames = [];
    for (const id of ['batch-a', 'batch-b', 'batch-c', 'batch-d', 'batch-error']) {
      frames.push(
        'event: tool_use\ndata: ' +
          JSON.stringify([{ id, name: 'web_search', input: { query: id } }]) +
          '\n\n',
      );
    }
    for (const id of ['batch-a', 'batch-b', 'batch-c', 'batch-d']) {
      frames.push(
        'event: tool_result\ndata: ' +
          JSON.stringify({ id, ok: true, status: 'completed', output: id }) +
          '\n\n',
      );
    }
    frames.push(
      'event: tool_result\ndata: ' +
        JSON.stringify({ id: 'batch-error', ok: false, status: 'failed', output: 'failure' }) +
        '\n\n',
      'data: {"choices":[{"delta":{"content":"Completed four searches; one failed."}}]}\n\n',
      'data: [DONE]\n\n',
    );
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: frames.join(''),
    });
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(async () => {
    const sessionId = '88888888-8888-4888-8888-888888888888';
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { currentSessionId: sessionId } });
    window.__socratesTestState.patch({
      session: {
        messages: [{ clientId: 'user-batch', role: 'user', rawText: 'Run five searches' }],
      },
    });
    window.__testActivateMainView('chatView');
    await window.askChatTurn('Run five searches');
  });

  const turn = page.locator('.msg.assistant').last();
  await openActivity(turn);
  const batch = turn.getByTestId('tool-call-batch');
  const toggle = batch.getByTestId('tool-batch-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(batch.locator('.rn-tool-row')).toHaveCount(0);
  await expect(toolRow(turn, 'batch-error')).toHaveAttribute('data-state', 'error');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(batch.locator('.rn-tool-row')).toHaveCount(4);
  await expect(toolRowButton(turn, 'batch-a')).toBeVisible();
  await toolRowButton(turn, 'batch-a').click();
  await expect(turn.getByTestId('tool-detail')).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toolRow(turn, 'batch-error')).toBeVisible();
});
