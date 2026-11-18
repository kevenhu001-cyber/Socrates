import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { publishChatRuntime, setLang } from './_lib.mjs';

test('thinking disclosure supports keyboard control and preserves intent through completion', async ({
  page,
}) => {
  await prepareChatWorkbench(page, {
    messages: [
      {
        clientId: 'disclosure-fixture',
        role: 'assistant',
        type: 'streaming',
        rawText: '<think>internal draft</think>',
        reasoningDurationSec: 6,
        turnRuntime: {
          activities: [
            { id: 'reasoning', kind: 'reasoning', phase: 'running', startedAt: Date.now() - 5000 },
          ],
          uiSurfaces: [],
        },
        _activity: {
          type: 'public_reasoning_summary',
          text: '**Comparison**\n\nChecking both assumptions.',
        },
        _streamSettled: false,
      },
    ],
  });
  const accordion = page.locator('.rn-turn-activity');
  const toggle = accordion.getByTestId('turn-activity-toggle');
  const body = accordion.getByTestId('turn-activity-body');
  // The action leads; elapsed time is quiet metadata beside it.
  await expect(accordion.getByTestId('turn-activity-label')).toHaveText('Thinking…');
  await expect(accordion.getByTestId('turn-activity-duration')).toContainText(/\d/);
  await expect(accordion.getByTestId('thinking-step-spinner')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toBeVisible();
  await expect(body).not.toHaveAttribute('aria-hidden', 'true');
  await expect(body.locator('.thinking-step-preview')).toHaveText('Checking both assumptions.');
  await expect(body.getByTestId('thinking-step')).not.toHaveAttribute('aria-expanded');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    const messages = window.__socratesTestState.session().messages.map((message) => ({
      ...message,
      rawText: '<think>internal draft with additional private detail</think>',
      _activity: { type: 'public_reasoning_summary', text: 'Checked the relevant sources.' },
    }));
    window.__socratesTestState.patch({ session: { messages: messages } });
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'disclosure-update' });
  await expect(accordion.getByTestId('thinking-step-title').first()).toHaveText(
    'Checked the relevant sources.',
  );
  await expect(accordion).not.toContainText('internal draft');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const messages = window.__socratesTestState
      .session()
      .messages.map((message) => ({ ...message, type: 'assistant', _streamSettled: true }));
    window.__socratesTestState.patch({ session: { messages: messages } });
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'disclosure-complete' });
  await expect(accordion).not.toHaveAttribute('data-live', 'true');
  await expect(accordion.getByTestId('thinking-step-spinner')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await setLang(page, 'zh');
  // The settled label is neutral; neither seconds nor summary counts are
  // presented as a measure of reasoning progress.
  await expect(accordion.getByTestId('turn-activity-label')).toHaveText('思考摘要');
  await expect(accordion.getByTestId('turn-activity-duration')).toHaveText('6 秒');
  await page.screenshot({
    path: 'test-results/thinking-disclosure-desktop.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/thinking-disclosure-mobile.png',
    animations: 'disabled',
  });
});
