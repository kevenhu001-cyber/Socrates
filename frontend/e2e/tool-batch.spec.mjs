import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { toolRow, toolRowButton } from './_turn-ui.mjs';

test('a large tool burst collapses to one summary and preserves individual details', async ({ page }) => {
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
  await expect(turn.locator('.rn-tool-row')).toHaveCount(1);
  const activityToggle = turn.getByTestId('turn-activity-toggle');
  await expect(activityToggle).toHaveAttribute('aria-expanded', 'false');
  await activityToggle.click();

  const group = turn.getByTestId('tool-group-batch-a');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(group).toContainText('4 actions');
  await expect(group).not.toContainText('failed');
  await expect(toolRow(turn, 'batch-error')).toHaveAttribute('data-state', 'error');
  await group.click();

  await expect(turn.locator('.rn-tool-row')).toHaveCount(5);
  for (const id of ['batch-a', 'batch-b', 'batch-c', 'batch-d', 'batch-error']) {
    await expect(toolRowButton(turn, id)).toBeVisible();
  }
  const first = toolRowButton(turn, 'batch-a');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await first.click();
  await expect(turn.getByTestId('tool-detail')).toBeVisible();
  await first.click();
  await expect(turn.getByTestId('tool-detail')).toHaveCount(0);
  await expect(toolRow(turn, 'batch-error')).toHaveAttribute('data-state', 'error');
});
