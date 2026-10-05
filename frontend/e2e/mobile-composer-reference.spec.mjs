import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile landing and conversation retain one composer geometry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const topic = page.locator('#composerInputWrap');
  await expect(page.locator('#topicTitle')).toBeVisible();
  await expect(topic.locator('#composerMicBtn')).toBeVisible();

  const measure = async (wrapSelector, controls) => page.evaluate(({ wrapSelector: selector, controls: ids }) => {
    const rect = (target) => {
      const box = document.querySelector(target)?.getBoundingClientRect();
      const controlStyle = document.querySelector(target) ? getComputedStyle(document.querySelector(target)) : null;
      return box ? {
        left: Math.round(box.left),
        top: Math.round(box.top),
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

  const landing = await measure('#composerInputWrap', [
    '#composerToolsBtn', '#composerMicBtn', '#composerPrimaryBtn',
  ]);
  /* The phone capsule is the reference's two-row stack: 85px tall,
     28px corners, 12px/8px/8px padding, editor on row 1 (full width),
     36px circular controls on row 2, 12px page insets on both sides.
     85 = 12 top + 24 editor + 3 row-gap + 36 control row + 8 bottom
     + 1px border top and bottom. docs/ref/mobile-reference-2026-10-04.md
     records the composer contract as "two rows, 36px controls, 28px
     corners"; 8912121c retuned row-gap 6→3, padding 11/12/8→12/8/8 and
     the editor 26→24px, which is what moved the capsule off the 89px this
     assertion used to pin. */
  expect(landing.wrap?.height).toBe(85);
  expect(landing.radius).toBe('28px');
  /* + and the primary control are 36px circles; the mic is the same size
     and all three sit on the one control row, left to right. */
  expect(landing.controls[0]?.width).toBe(36);
  expect(landing.controls[0]?.height).toBe(36);
  expect(landing.controls[1]?.width).toBe(36);
  expect(landing.controls[1]?.height).toBe(36);
  expect(landing.controls[2]?.width).toBe(36);
  expect(landing.controls[2]?.height).toBe(36);
  expect(landing.controls[2]?.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(Math.abs((landing.controls[0]?.top ?? 0) - (landing.controls[2]?.top ?? 0))).toBeLessThanOrEqual(4);
  expect((landing.controls[0]?.left ?? 0) + 36).toBeLessThanOrEqual(landing.controls[1]?.left ?? 0);
  expect((landing.controls[1]?.left ?? 0) + 36).toBeLessThanOrEqual(landing.controls[2]?.left ?? 0);
  await page.screenshot({ path: 'test-results/socrates-mobile-unified-landing.png', fullPage: true });

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await expect(page.locator('#composerInputWrap')).toBeVisible();

  const conversation = await measure('#composerInputWrap', [
    '#composerToolsBtn', '#composerMicBtn', '#composerPrimaryBtn',
  ]);
  /* Same single-row capsule height and chrome on both surfaces; the
     horizontal inset differs because the landing column owns 12px page
     padding while the chat bar runs nearly full-bleed. */
  expect(conversation.wrap?.height).toBe(landing.wrap?.height);
  expect(conversation.radius).toBe(landing.radius);
  expect(conversation.background).toBe(landing.background);
  expect(conversation.controls[0]?.width).toBe(36);
  expect(conversation.controls[1]?.width).toBe(36);
  expect(conversation.controls[2]?.width).toBe(36);
  expect((conversation.controls[1]?.left ?? 0) + 36).toBeLessThanOrEqual(conversation.controls[2]?.left ?? 0);
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

  /* The top-bar Chat/Tutor pill was removed; mobile dropdown is the
     remaining user-facing mode switch and is hidden during a conversation
     by the same body[data-conversation-active] contract. We assert the
     dropdown here rather than the (now-absent) top pill. */
  await expect(page.locator('#mobileMode')).toBeHidden();
  await expect(composer.locator('#composerMicBtn')).toBeVisible();
  /* Empty composer → the shared primary control is the voice-input
     affordance (waveform icon + label), not a disabled arrow.
     "开始语音输入" is the zh rendering of the "Start voice input" label
     that e2e/voice-input.spec.mjs pins in English; the shorter "语音输入"
     this used to expect is not a label the app emits. */
  await expect(composer.locator('#composerPrimaryBtn')).toHaveAttribute('aria-label', '开始语音输入');
  await expect(composer.locator('#composerPrimaryBtn .icon-voice')).toHaveCount(1);
  /* The reference pill reads the current level (高/中/低), not the
     section label. The phone rail deliberately does not chip the default:
     parity/composer-unified.css hides
     .effort-picker[data-effort="medium"] because the default stays
     reachable from the header configuration menu, so a non-default level
     is what brings the chip back. Assert both halves of that contract. */
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
  /* Keyboard open keeps the same two-row capsule; only actual
     multiline content increases its height. */
  await expect.poll(async () => (await composer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(85);
  const rows = await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? { top: Math.round(box.top), bottom: Math.round(box.bottom) } : null;
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
  /* The controls form one row: add/effort/mic/send share the capsule's
     lower control row, so their tops line up and stay inside the capsule
     (the editor sits on its own row above them). */
  const controlTops = ['attach', 'model', 'mic', 'send'].map((key) => rows[key]?.top ?? 0);
  expect(Math.max(...controlTops) - Math.min(...controlTops)).toBeLessThanOrEqual(4);
  expect(Math.min(...controlTops)).toBeGreaterThanOrEqual((rows.composer?.top ?? 0) - 1);
  expect(Math.max(...controlTops)).toBeLessThanOrEqual((rows.composer?.bottom ?? 0) + 1);

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

  const trigger = page.locator('#composerInputWrap .effort-trigger');
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
