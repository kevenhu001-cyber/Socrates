import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* This visual regression deliberately uses mockAuthedApp: browser coverage
   must exercise the post-login shell without depending on a real account. */
test('mobile composer keeps model selector and reference controls discoverable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.apiConfig.activeId = 'luna';
    window.apiConfig.providers = [{
      id: 'luna',
      label: '5.6 Luna',
      model: 'luna-1',
      url: 'https://models.example.test/v1',
      isBuiltIn: false,
    }];
    window.syncEffortUI?.();
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'Mobile reference check' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '66666666-6666-4666-8666-666666666666' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(250);

  const composer = page.locator('#chatInputWrap');
  const editor = page.locator('#chatComposerRoot .rich-composer-editor');
  const effort = composer.locator('.effort-picker');

  /* P_hide-mode-switch-in-conversation — the user contract is "only show
     before the conversation starts"; the pill is hidden once the
     conversation is active, on all viewports. */
  await expect(page.locator('#modeSegmentedTop')).toBeHidden();
  await expect(composer.locator('#chatMobileMicBtn')).toBeVisible();
  await expect(composer.locator('#sendBtn')).toHaveAttribute('aria-disabled', 'true');
  await expect(composer.locator('#sendBtn .icon-arrow')).toHaveCount(1);
  await expect(effort).toBeHidden();

  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  await expect(effort).toBeVisible();
  await expect(effort.locator('.effort-label')).toHaveText('5.6 Luna 中');

  await page.evaluate(() => { document.documentElement.dataset.keyboardOpen = 'true'; });
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(96);
  const rows = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null;
    };
    return {
      composer: rect('#chatInputWrap'),
      editor: rect('#chatComposerRoot'),
      attach: rect('#chatComposerToolsBtn'),
      model: rect('#chatInputWrap .effort-picker'),
      mic: rect('#chatMobileMicBtn'),
      send: rect('#sendBtn'),
    };
  });
  expect(rows.editor?.bottom ?? 0).toBeLessThanOrEqual(rows.attach?.top ?? Number.POSITIVE_INFINITY);
  expect(rows.model?.top ?? 0).toBeGreaterThanOrEqual(rows.attach?.top ?? 0);
  expect(rows.mic?.top ?? 0).toBeGreaterThanOrEqual(rows.attach?.top ?? 0);
  expect(rows.send?.top ?? 0).toBeGreaterThanOrEqual(rows.attach?.top ?? 0);

  await effort.locator('.effort-trigger').click();
  const menu = page.locator('.effort-menu.portal-open');
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('5.6 Luna');
  await page.screenshot({ path: 'test-results/socrates-mobile-composer-reference.png', fullPage: true });
});
