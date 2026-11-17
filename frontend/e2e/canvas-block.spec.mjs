import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('canvas edits persist through session state and Iterate fills the rich composer', async ({
  page,
}) => {
  await prepareChatWorkbench(page, {
    messages: [
      {
        clientId: 'canvas-message-1',
        role: 'assistant',
        rawText: 'Original answer',
        html: '<p>Original answer</p>',
        outputMode: 'canvas',
        canvasId: 'canvas-1',
        editedText: null,
      },
    ],
  });

  const canvas = page.locator('.canvas-block[data-canvas-id="canvas-1"]');
  const body = canvas.locator('.canvas-block-body');
  await expect(body).toContainText('Original answer');

  /* Select by the action the button performs, not by its position: an
   * index-based selector silently points at the wrong control when the
   * toolbar gains or loses an action. */
  const editButton = canvas.locator('[data-action="canvas-edit"]');
  await editButton.click();
  await expect(body).toHaveAttribute('contenteditable', 'true');
  await body.fill('Revised answer');
  await editButton.click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        return window.__socratesTestState
          .session()
          .messages.find((message) => message.canvasId === 'canvas-1')?.editedText;
      }),
    )
    .toBe('<p>Revised answer</p>');
  await expect(canvas.locator('.canvas-block-edited-badge')).toBeVisible();

  await canvas.locator('[data-action="canvas-iterate"]').click();
  await expect(page.locator('#composerRoot .rich-composer-editor').first()).toContainText(
    'Revised answer',
  );
});
