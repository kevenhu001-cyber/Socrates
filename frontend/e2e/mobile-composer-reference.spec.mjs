import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile landing and conversation retain one composer geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const topic = page.locator('#topicInputWrap');
  await expect(page.locator('#topicTitle')).toBeVisible();
  await expect(topic.locator('#topicMobileMicBtn')).toBeVisible();

  const measure = async (wrapSelector, controls) => page.evaluate(({ wrapSelector: selector, controls: ids }) => {
    const rect = (target) => {
      const box = document.querySelector(target)?.getBoundingClientRect();
      const controlStyle = document.querySelector(target) ? getComputedStyle(document.querySelector(target)) : null;
      return box ? {
        left: Math.round(box.left),
        width: Math.round(box.width),
        height: Math.round(box.height),
        background: controlStyle?.backgroundColor,
      } : null;
    };
    const style = document.querySelector(selector) ? getComputedStyle(document.querySelector(selector)) : null;
    return {
      wrap: rect(selector),
      radius: style?.borderRadius,
      background: style?.backgroundColor,
      controls: ids.map(rect),
    };
  }, { wrapSelector, controls });

  const landing = await measure('#topicInputWrap', [
    '#topicComposerToolsBtn', '#topicMobileMicBtn', '#startBtn',
  ]);
  expect(landing.wrap?.height).toBeGreaterThanOrEqual(100);
  expect(landing.radius).toBe('28px');
  expect(landing.controls.every((control) => control?.width === 40 && control?.height === 40 && control.background !== 'rgba(0, 0, 0, 0)')).toBe(true);
  expect((landing.controls[1]?.left ?? 0) + 40).toBeLessThanOrEqual(landing.controls[2]?.left ?? 0);
  await page.screenshot({ path: '/tmp/socrates-mobile-unified-landing.png', fullPage: true });

  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await expect(page.locator('#chatInputWrap')).toBeVisible();

  const conversation = await measure('#chatInputWrap', [
    '#chatComposerToolsBtn', '#chatMobileMicBtn', '#sendBtn',
  ]);
  expect(conversation.wrap).toEqual(landing.wrap);
  expect(conversation.radius).toBe(landing.radius);
  expect(conversation.background).toBe(landing.background);
  expect(conversation.controls.every((control) => control?.width === 40 && control?.height === 40 && control.background !== 'rgba(0, 0, 0, 0)')).toBe(true);
  expect((conversation.controls[1]?.left ?? 0) + 40).toBeLessThanOrEqual(conversation.controls[2]?.left ?? 0);
  await page.screenshot({ path: '/tmp/socrates-mobile-unified-composer.png', fullPage: true });
});

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
  await expect(composer.locator('#sendBtn')).toHaveAttribute('aria-disabled', 'false');
  await expect(composer.locator('#sendBtn .icon-voice')).toHaveCount(1);
  /* Mobile parity shows the reasoning-level pill at rest. */
  await expect(effort).toBeVisible();

  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  await expect(effort).toBeVisible();
  /* The mobile pill shows only the reasoning level, not the model name. */
  await expect(effort.locator('.effort-label')).toHaveText('中');

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
