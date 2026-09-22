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
  expect(landing.wrap?.height).toBeGreaterThanOrEqual(84);
  expect(landing.wrap?.height).toBeLessThanOrEqual(96);
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
  await expect(composer.locator('#sendBtn')).toHaveAttribute('aria-disabled', 'true');
  await expect(composer.locator('#sendBtn .icon-voice')).toHaveCount(0);
  /* The reference capsule always shows the fixed-label 思考强度 pill. */
  await expect(effort).toBeVisible();
  await expect(effort.locator('.effort-label')).toHaveText('思考强度');

  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  await expect(effort).toBeVisible();

  await page.evaluate(() => { document.documentElement.dataset.keyboardOpen = 'true'; });
  /* Keyboard open keeps the stable two-row capsule; only actual multiline
     content increases its height. */
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(96);
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
  /* The editor owns the first row and the controls share the second. */
  for (const key of ['attach', 'model', 'mic', 'send']) {
    expect(rows[key]?.top ?? 0, key).toBeGreaterThanOrEqual(rows.editor?.bottom ?? 0);
  }

  await effort.locator('.effort-trigger').click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('5.6 Luna');
  await expect(pop).toContainText('思考强度');
  await expect(pop).toContainText('速度');
  /* The popover is anchored above the pill, not a sheet/dialog. */
  const popBox = await pop.boundingBox();
  const triggerBox = await effort.locator('.effort-trigger').boundingBox();
  expect(popBox?.y ?? 0).toBeLessThan(triggerBox?.y ?? 0);
  await page.screenshot({ path: 'test-results/socrates-mobile-composer-reference.png', fullPage: true });
});

test('desktop configuration reuses the same content in an anchored popover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const trigger = page.locator('#topicInputWrap .effort-trigger');
  await trigger.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  const geometry = await pop.boundingBox();
  expect(geometry?.width).toBeLessThanOrEqual(300);
  /* Anchored above (or beside) the pill, never a centred dialog. */
  const triggerBox = await trigger.boundingBox();
  expect(geometry?.y ?? 0).toBeLessThan((triggerBox?.y ?? 0) + (triggerBox?.height ?? 0));

  await pop.getByRole('button', { name: /速度/ }).click();
  await expect(pop.getByRole('option', { name: /快速/ })).toBeVisible();
  await pop.getByRole('option', { name: /快速/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-response-speed'))).toBe('fast');

  await pop.getByRole('button', { name: /思考强度/ }).click();
  const slider = pop.locator('input[type="range"]');
  await expect(slider).toBeVisible();
  /* React-controlled input: set through the native setter so the synthetic
     onChange sees a real value transition. */
  await slider.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '2');
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('high');

  /* Escape backs out of the slider sub-view first, then dismisses. */
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});
