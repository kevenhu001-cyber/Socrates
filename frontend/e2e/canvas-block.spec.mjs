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

  /* Select by the action the button performs, not by its position. The
   * toolbar gained a workbench button in the artifacts workbench work, and
   * an index-based selector silently started pointing at the wrong control
   * — clicking "original" instead of "edit" swapped the body for a <pre>,
   * so the body element the spec was holding on to disappeared. */
  const editButton = canvas.locator('[data-action="canvas-edit"]');
  await editButton.click();
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.fill('Revised answer');
  await editButton.click();

  await expect.poll(async () => page.evaluate(() => {
    return window.stateStore.read('messages').find((message) => message.canvasId === 'canvas-1')?.editedText;
  })).toBe('<p>Revised answer</p>');
  await expect(canvas.locator('.canvas-block-edited-badge')).toBeVisible();

  await canvas.locator('[data-action="canvas-iterate"]').click();
  await expect(page.locator('#composerRoot .rich-composer-editor').first()).toContainText('Revised answer');
});
