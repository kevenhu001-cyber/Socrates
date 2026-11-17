import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The edit state is the user bubble turned into a field (chat-demo
 * reference): one bordered surface, the draft inside it, and Cancel / Send
 * in the lower-right corner. This spec pins the structure and the keyboard
 * contract so the card-style header/toggles cannot quietly return. */
test('editing a user message uses the inline bubble editor and its keyboard contract', async ({
  page,
}) => {
  await mockAuthedApp(page);
  await page.route('**/api/v2/messages/**', (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({
      session: { currentSessionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
    });
    window.__socratesTestState.patch({ session: { messages: [] } });
    window.addMessage('user', 'Original prompt');
    window.askChatTurn = () => {};
    window.addStreamingMessage = () => ({ isFinished: () => true });
  });

  const user = page.locator('[data-client-id^="msg-"].msg.user').first();
  await user.hover();
  await user.getByRole('button', { name: 'Edit message', exact: true }).click();

  const editor = user.locator('.msg-edit-wrap');
  const area = user.locator('.msg-edit-area');
  await expect(editor).toBeVisible();
  await expect(area).toBeVisible();
  await expect(area).toHaveValue('Original prompt');
  await expect(user.locator('.msg-body')).toHaveCount(0);
  await expect(user.locator('.msg-edit-header')).toHaveCount(0);
  await expect(user.locator('.msg-edit-toggles')).toHaveCount(0);
  await expect(user.locator('.msg-edit-plus-btn')).toHaveCount(0);
  await expect(user.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(user.getByRole('button', { name: 'Send', exact: true })).toBeVisible();

  /* The draft is the only send gate: whitespace cannot be submitted. */
  await area.fill('   ');
  await expect(user.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();

  /* Shift+Enter stays in the field; Escape cancels the edit. */
  await area.fill('Edited prompt');
  await area.press('Shift+Enter');
  await expect(area).toHaveValue('Edited prompt\n');
  await expect(area).toBeVisible();
  await area.press('Escape');
  await expect(area).toHaveCount(0);

  /* Enter commits on desktop and the bubble returns with the new text. */
  await user.hover();
  await user.getByRole('button', { name: 'Edit message', exact: true }).click();
  await area.fill('Edited prompt');
  await area.press('Enter');
  await expect(area).toHaveCount(0);
  await expect(user.locator('.msg-body')).toContainText('Edited prompt');
});
