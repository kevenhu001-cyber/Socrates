import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile landing and conversation retain one composer geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const topic = page.locator('#composerInputWrap');
  await expect(page.locator('#topicTitle')).toBeHidden();
  await expect(page.locator('#homeQuickActions')).toBeVisible();
  await expect(topic.locator('#composerMicBtn')).toBeVisible();

  const measure = async (wrapSelector, controls) => page.evaluate(({ wrapSelector: selector, controls: ids }) => {
    const rect = (target) => {
      const node = document.querySelector(target);
      const box = node?.getBoundingClientRect();
      const controlStyle = node ? getComputedStyle(node) : null;
      return box ? {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
        centerY: Math.round(box.top + box.height / 2),
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

  const landing = await measure('#composerInputWrap', [
    '#composerToolsBtn', '#composerMicBtn', '#composerPrimaryBtn',
  ]);
  /* Figma mobile resting composer: one 44px row. The add control is a
     separate 44px circle; the filled input pill contains a bare 24px mic and
     a 32px primary action. Browser chrome/home-indicator geometry is not part
     of this DOM measurement. */
  expect(landing.wrap?.height).toBe(44);
  expect(landing.radius).toBe('0px');
  expect(landing.controls[0]?.width).toBe(44);
  expect(landing.controls[0]?.height).toBe(44);
  expect(landing.controls[1]?.width).toBe(24);
  expect(landing.controls[1]?.height).toBe(24);
  expect(landing.controls[2]?.width).toBe(32);
  expect(landing.controls[2]?.height).toBe(32);
  expect(landing.controls[2]?.background).not.toBe('rgba(0, 0, 0, 0)');
  const landingCenters = landing.controls.map((control) => control?.centerY ?? 0);
  expect(Math.max(...landingCenters) - Math.min(...landingCenters)).toBeLessThanOrEqual(1);
  expect((landing.controls[0]?.left ?? 0) + 44).toBeLessThanOrEqual(landing.controls[1]?.left ?? 0);
  expect((landing.controls[1]?.left ?? 0) + 24).toBeLessThanOrEqual(landing.controls[2]?.left ?? 0);
  await page.screenshot({ path: 'test-results/socrates-mobile-unified-landing.png', fullPage: true });

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await expect(page.locator('#composerInputWrap')).toBeVisible();

  const conversation = await measure('#composerInputWrap', [
    '#composerToolsBtn', '#composerMicBtn', '#composerPrimaryBtn',
  ]);
  expect(conversation.wrap?.height).toBe(landing.wrap?.height);
  expect(conversation.radius).toBe(landing.radius);
  expect(conversation.background).toBe(landing.background);
  expect(conversation.controls[0]?.width).toBe(44);
  expect(conversation.controls[1]?.width).toBe(24);
  expect(conversation.controls[2]?.width).toBe(32);
  const conversationCenters = conversation.controls.map((control) => control?.centerY ?? 0);
  expect(Math.max(...conversationCenters) - Math.min(...conversationCenters)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/socrates-mobile-unified-composer.png', fullPage: true });
});

/* This visual regression deliberately uses mockAuthedApp: browser coverage
   must exercise the post-login shell without depending on a real account. */
test('mobile composer keeps model selector and reference controls discoverable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, {
    lang: 'zh',
    apiKeys: { providers: [{
      id: 'luna',
      label: '5.6 Luna',
      model: 'luna-1',
      url: 'https://models.example.test/v1',
      isMultimodal: false,
      hasKey: true,
      isActive: true,
    }], activeId: 'luna' },
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.syncEffortUI?.();
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 'Mobile reference check' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: '66666666-6666-4666-8666-666666666666' });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(250);

  const composer = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  const effort = composer.locator('.effort-picker');

  /* Conversation uses the model switcher as its Figma-style title cluster;
     the landing-only mode title is hidden once chat is active. */
  await expect(page.locator('#mobileMode')).toBeHidden();
  await expect(page.locator('#topModelSwitcher')).toBeVisible();
  await expect(composer.locator('#composerMicBtn')).toBeVisible();
  await expect(composer.locator('#composerPrimaryBtn')).toHaveAttribute('aria-label', '开始语音输入');
  await expect(composer.locator('#composerPrimaryBtn .icon-voice')).toHaveCount(1);

  /* The default effort remains visually absent. A non-default choice is an
     optional chip inside the same 44px input pill. */
  await expect(effort).toBeHidden();
  await page.evaluate(() => {
    localStorage.setItem('socrates-reasoning-effort', 'high');
    window.syncEffortUI?.();
  });
  await expect(effort).toBeVisible();
  await expect(effort.locator('.effort-value')).toHaveText('高');

  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  await expect(effort).toBeVisible();

  await page.evaluate(() => { document.documentElement.dataset.keyboardOpen = 'true'; });
  /* The visual viewport/keyboard lift does not change resting composer
     geometry: it remains one 44px row immediately above the keyboard. */
  await expect.poll(async () => Math.round((await composer.boundingBox())?.height ?? 0)).toBe(44);
  const rows = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        centerY: Math.round(box.top + box.height / 2),
      } : null;
    };
    return {
      composer: rect('#composerInputWrap'),
      editor: rect('#composerRoot'),
      attach: rect('#composerToolsBtn'),
      model: rect('#composerInputWrap .effort-picker'),
      mic: rect('#composerMicBtn'),
      send: rect('#composerPrimaryBtn'),
    };
  });
  const controlCenters = ['attach', 'model', 'mic', 'send'].map((key) => rows[key]?.centerY ?? 0);
  expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(1);
  expect(Math.min(...controlCenters)).toBeGreaterThanOrEqual((rows.composer?.top ?? 0));
  expect(Math.max(...controlCenters)).toBeLessThanOrEqual((rows.composer?.bottom ?? 0));

  await effort.locator('.effort-trigger').click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('5.6 Luna');
  await expect(pop).toContainText('思考强度');
  await expect(pop).toContainText('速度');
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

  const trigger = page.locator('#composerInputWrap .effort-trigger');
  await trigger.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  const geometry = await pop.boundingBox();
  expect(geometry?.width).toBeLessThanOrEqual(300);
  const triggerBox = await trigger.boundingBox();
  expect(geometry?.y ?? 0).toBeLessThan((triggerBox?.y ?? 0) + (triggerBox?.height ?? 0));

  await pop.getByRole('button', { name: /速度/ }).click();
  await expect(pop.getByRole('option', { name: /快速/ })).toBeVisible();
  await pop.getByRole('option', { name: /快速/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-response-speed'))).toBe('fast');

  await pop.getByRole('button', { name: /思考强度/ }).click();
  const slider = pop.locator('input[type="range"]');
  await expect(slider).toBeVisible();
  await slider.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '2');
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('high');

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});
