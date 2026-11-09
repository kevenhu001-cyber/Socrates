import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { publishChatRuntime, setLang } from './_lib.mjs';

test('thinking disclosure supports keyboard control and preserves intent through completion', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'disclosure-fixture', role: 'assistant', type: 'streaming',
    rawText: '<think>internal draft</think>', _activity: { type: 'public_reasoning_summary', text: 'Preparing a concise comparison.' }, _streamSettled: false,
  }] });
  const accordion = page.locator('.rn-turn-activity');
  const toggle = accordion.getByTestId('turn-activity-toggle');
  const body = accordion.getByTestId('turn-activity-body');
  // The header speaks run time; the working cue is the row's spinner.
  await expect(accordion.getByTestId('turn-activity-label')).toContainText(/Processing|Running/);
  await expect(accordion.getByTestId('thinking-step-spinner')).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(body).toBeVisible();
  await expect(body).not.toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    const messages = window.stateStore.read('messages').map((message) => ({
      ...message, rawText: '<think>internal draft with additional private detail</think>', _activity: { type: 'public_reasoning_summary', text: 'Checked the relevant sources.' },
    }));
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'disclosure-update' });
  await expect(accordion.getByTestId('thinking-step-title').first()).toHaveText('Checked the relevant sources.');
  await expect(accordion).not.toContainText('internal draft');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const messages = window.stateStore.read('messages').map((message) => ({ ...message, type: 'assistant', _streamSettled: true }));
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'disclosure-complete' });
  await expect(accordion).not.toHaveAttribute('data-live', 'true');
  await expect(accordion.getByTestId('thinking-step-spinner')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await setLang(page, 'zh');
  // The settled header freezes the observed run time; it still never claims
  // a count of reasoning steps.
  await expect(toggle).toContainText(/运行了 \d+秒/);
  await page.screenshot({ path: 'test-results/thinking-disclosure-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/thinking-disclosure-mobile.png', animations: 'disabled' });
});
