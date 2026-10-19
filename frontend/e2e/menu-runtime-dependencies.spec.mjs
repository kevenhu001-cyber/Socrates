import { expect, test } from '@playwright/test';
import { completeFrame, namedFrame, prepareChatWorkbench, textFrame } from './_chat-workbench.mjs';

test('whiteboard, composer and menu work together after the shared-dependency split', async ({ page }, testInfo) => {
  const errors = [];
  const cspViolations = [];
  page.on('pageerror', (error) => errors.push({ message: error.message, stack: error.stack }));
  await page.exposeFunction('recordWhiteboardCsp', (uri) => cspViolations.push(uri));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => {
    window.recordWhiteboardCsp(event.blockedURI);
  }));
  const spec = {
    version: 1,
    template: 'whiteboard',
    title: 'Shared runtime check',
    accessibilitySummary: 'A whiteboard with one note.',
    payload: { nodes: [{ label: 'Shared dependency check' }] },
  };
  await prepareChatWorkbench(page, {
    streamBody: namedFrame('tool_use', [{ id: 'whiteboard-runtime-tool', name: 'render_visualization', input: spec }])
      + namedFrame('tool_result', { id: 'whiteboard-runtime-tool', name: 'render_visualization',
        ok: true, status: 'completed', visualization: spec, output: 'Whiteboard ready', durationMs: 1 })
      + textFrame('The whiteboard is ready.') + completeFrame(),
  });
  await page.evaluate(() => window.askChatTurn('Draw a whiteboard'));
  const card = page.locator('.visualization-card[data-visualization-renderer="tldraw"]');
  await expect(card.locator('.tl-container')).toBeVisible();
  await expect(card).toContainText('Shared dependency check');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  await editor.fill('Editor still works');
  await expect(editor).toHaveText('Editor still works');
  await page.locator('.sidebar-account-trigger').click();
  const menu = page.getByRole('menu', { name: 'Account', exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // tldraw currently requests its default CDN translations, which the app's
  // same-origin CSP blocks. Keep that observed limitation explicit; do not hide
  // module/React errors or relax production CSP to make this regression pass.
  const blockedAssets = cspViolations.filter((uri) => uri.startsWith('https://cdn.tldraw.com/'));
  const isBlockedAssetError = (error) => blockedAssets.length > 0
    && error.message === 'Failed to fetch' && error.stack?.includes('/assets/vendor-tldraw-');
  expect(errors.filter((error) => !isBlockedAssetError(error))).toEqual([]);
  if (blockedAssets.length) {
    testInfo.annotations.push({ type: 'known-issue', description: 'tldraw default CDN assets are blocked by the same-origin CSP' });
    await testInfo.attach('whiteboard-csp-assets', {
      body: JSON.stringify({ blockedAssets, errors }, null, 2), contentType: 'application/json',
    });
  }
});
