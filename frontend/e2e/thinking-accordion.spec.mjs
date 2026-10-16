import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { setLang } from './_lib.mjs';

test('thinking disclosure supports keyboard control and preserves intent through completion', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'disclosure-fixture', role: 'assistant', type: 'streaming',
    rawText: '<think>internal draft</think>', summary: 'Preparing a concise comparison.', _streamSettled: false,
  }] });
  const accordion = page.locator('.thinking-accordion');
  const toggle = accordion.locator('.thinking-accordion-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(accordion.locator('.thinking-accordion-body')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => {
    const messages = window.stateStore.read('messages').map((message) => ({
      ...message, rawText: '<think>internal draft with additional private detail</think>', summary: 'Checked the relevant sources.',
    }));
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'disclosure-update' });
  });
  await expect(accordion.locator('.thinking-accordion-text')).toHaveText('Checked the relevant sources.');
  await expect(accordion).not.toContainText('internal draft');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const messages = window.stateStore.read('messages').map((message) => ({ ...message, type: 'assistant', _streamSettled: true }));
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'disclosure-complete' });
  });
  await expect(accordion).not.toHaveAttribute('data-live', 'true');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await setLang(page, 'zh');
  await expect(toggle).toContainText('思路总结');
  await expect(accordion.locator('.thinking-copy-quote-btn')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/thinking-disclosure-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/thinking-disclosure-mobile.png', animations: 'disabled' });
});
