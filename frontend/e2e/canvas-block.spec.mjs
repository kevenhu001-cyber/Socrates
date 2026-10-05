import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('canvas edits persist through session state and Iterate fills the rich composer', async ({ page }) => {
  await prepareChatWorkbench(page, {
    messages: [{
      clientId: 'canvas-message-1',
      role: 'assistant',
      rawText: 'Original answer',
      html: '<p>Original answer</p>',
      outputMode: 'canvas',
      canvasId: 'canvas-1',
      editedText: null,
    }],
  });

  const canvas = page.locator('.canvas-block[data-canvas-id="canvas-1"]');
  const body = canvas.locator('.canvas-block-body');
  await expect(body).toContainText('Original answer');

  await canvas.locator('.canvas-btn').nth(1).click();
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.fill('Revised answer');
  await canvas.locator('.canvas-btn').nth(1).click();

  await expect.poll(async () => page.evaluate(() => {
    return window.stateStore.read('messages').find((message) => message.canvasId === 'canvas-1')?.editedText;
  })).toBe('<p>Revised answer</p>');
  await expect(canvas.locator('.canvas-block-edited-badge')).toBeVisible();

  await canvas.locator('.canvas-btn').nth(3).click();
  await expect(page.locator('#composerRoot .rich-composer-editor').first()).toContainText('Revised answer');
});
