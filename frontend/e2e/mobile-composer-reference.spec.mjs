import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('mobile composer stays two-row on landing and in a conversation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const host = page.locator('#composerInputWrap');
  const frame = host.locator('[data-composer-frame]');
  const editor = host.locator('.rich-composer-editor');
  const tools = host.locator('#composerToolsBtn');
  const mic = host.locator('#composerMicBtn');
  const primary = host.locator('#composerPrimaryBtn');
  const originalEditor = await editor.elementHandle();

  const checkStacked = async () => {
    await expect(frame).toHaveAttribute('data-expanded', 'true');
    await expect(frame).toHaveCSS('height', '86px');
    await expect(frame).toHaveCSS('border-radius', '28px');
    const compact = await frame.boundingBox();
    const hostBox = await host.boundingBox();
    expect(compact.width).toBeLessThanOrEqual(hostBox.width + 1);
    expect(compact.x - hostBox.x).toBeCloseTo((hostBox.width - compact.width) / 2, 0);
    const editorBox = await editor.boundingBox();
    const [plus, microphone, send] = await Promise.all([
      tools.boundingBox(),
      mic.boundingBox(),
      primary.boundingBox(),
    ]);
    expect(editorBox.y + editorBox.height).toBeLessThan(plus.y);
    expect(plus.y).toBeCloseTo(microphone.y, 0);
    expect(microphone.y).toBeCloseTo(send.y, 0);
    return compact;
  };

  const compact = await checkStacked();
  await page.screenshot({ path: 'test-results/mobile-composer-idle.png' });
  const mid = await frame.evaluate(async (node) => {
    node.querySelector('.rich-composer-editor').focus();
    await new Promise(requestAnimationFrame);
    const body = node.querySelector('[data-composer-slot="body"]');
    const transitions = [...node.getAnimations(), ...body.getAnimations()];
    for (const animation of transitions) {
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration / 2;
    }
    const { width, height } = node.getBoundingClientRect();
    for (const animation of transitions) animation.play();
    return { width, height };
  });
  await expect(editor).toBeFocused();
  await expect(host.locator('[data-composer-control=effort]')).toBeVisible();
  await expect(frame).toHaveCSS('height', '86px');
  await expect(frame).toHaveCSS('border-radius', '28px');
  const expanded = await frame.boundingBox();
  expect(mid.width).toBeCloseTo(compact.width, 0);
  expect(expanded.width).toBeCloseTo(compact.width, 0);
  expect(mid.height).toBeCloseTo(compact.height, 0);
  expect(expanded.height).toBeCloseTo(compact.height, 0);
  const editorBox = await editor.boundingBox();
  const controls = await Promise.all([tools, mic, primary].map((control) => control.boundingBox()));
  expect(editorBox.y + editorBox.height).toBeLessThan(controls[0].y);
  for (const control of controls) expect(control.y).toBeCloseTo(controls[0].y, 0);
  await page.screenshot({ path: 'test-results/mobile-composer-focused.png' });

  await editor.fill('草稿');
  await expect(primary).toBeEnabled();
  await editor.evaluate((node) => node.blur());
  await expect(editor).not.toBeFocused();
  await expect(editor).toHaveText('草稿');
  await expect(frame).toHaveAttribute('data-expanded', 'true');
  await editor.press('ControlOrMeta+a');
  await editor.press('Backspace');
  await expect(editor).toBeEmpty();
  await expect(primary).toBeDisabled();
  await editor.evaluate((node) => node.blur());
  await checkStacked();

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await expect(page.locator('#chatComposerSlot').locator(frame)).toBeVisible();
  const chatCompact = await checkStacked();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await editor.click();
  await expect(frame).toHaveCSS('height', '86px');
  const geometryTransitions = await frame.evaluate(
    (node) =>
      node.getAnimations().filter(({ transitionProperty }) => transitionProperty === 'max-width')
        .length,
  );
  expect(geometryTransitions).toBe(0);
  const chatExpanded = await frame.boundingBox();
  expect(chatExpanded.width).toBeCloseTo(chatCompact.width, 0);
  expect(chatExpanded.y + chatExpanded.height).toBeCloseTo(chatCompact.y + chatCompact.height, 0);
  expect(await editor.evaluate((current, original) => current === original, originalEditor)).toBe(
    true,
  );
  await editor.evaluate((node) => node.blur());
  await checkStacked();
});

/* This visual regression deliberately uses mockAuthedApp: browser coverage
   must exercise the post-login shell without depending on a real account. */
test('mobile composer keeps model selector and reference controls discoverable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthedApp(page, {
    lang: 'zh',
    apiKeys: {
      providers: [
        {
          id: 'luna',
          label: '5.6 Luna',
          model: 'luna-1',
          url: 'https://models.example.test/v1',
          isMultimodal: false,
          hasKey: true,
          isActive: true,
        },
      ],
      activeId: 'luna',
    },
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { topic: 'Mobile reference check' } });
    window.__socratesTestState.patch({
      session: { currentSessionId: '66666666-6666-4666-8666-666666666666' },
    });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(250);

  const composer = page.locator('#composerInputWrap');
  const editor = page.locator('#composerRoot .rich-composer-editor');
  const effort = composer.locator('#effortTrigger');
  await expect(page.locator('#mobileMode')).toHaveCount(0);
  await expect(page.locator('#topModeSwitch')).toBeHidden();
  await expect(composer.locator('#composerMicBtn')).toBeVisible();
  await expect(composer.locator('#composerPrimaryBtn')).toHaveAttribute('aria-label', '发送');
  await expect(composer.locator('#composerPrimaryBtn [data-ui-icon=arrow-up]')).toHaveCount(1);
  await editor.click();
  await expect(composer).toHaveClass(/composer-focused/);
  await expect(composer.locator('[data-composer-control=effort]')).toBeVisible();

  await expect(effort).toContainText('中');
  await effort.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  await expect(page.locator('#topModelSwitcher')).toBeHidden();
  await expect(pop).toContainText('立即');
  const slider = pop.getByRole('slider', { name: '思考强度' });
  await expect(slider).toHaveAttribute('aria-valuetext', '中');

  const popBox = await pop.boundingBox();
  const triggerBox = await effort.boundingBox();
  expect(popBox.y + popBox.height).toBeLessThan(triggerBox.y);
  await page.screenshot({ path: 'test-results/socrates-mobile-composer-reference.png' });
  await pop.getByRole('button', { name: /返回模型列表/ }).click();
  await expect(pop.getByRole('option', { name: /5.6 Luna/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(editor).toBeFocused();
});

test('desktop configuration reuses the same content in an anchored popover', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const trigger = page.locator('#topModelSwitcher');
  await trigger.click();
  const pop = page.locator('.chat-config-pop');
  await expect(pop).toBeVisible();
  const geometry = await pop.boundingBox();
  expect(geometry?.width).toBeLessThanOrEqual(300);
  /* Desktop configuration is anchored below the top-bar model switcher. */
  const triggerBox = await trigger.boundingBox();
  expect(geometry?.y ?? 0).toBeGreaterThanOrEqual((triggerBox?.y ?? 0) + (triggerBox?.height ?? 0));

  await pop.getByRole('button', { name: /速度/ }).click();
  await expect(pop.getByRole('option', { name: /快速/ })).toBeVisible();
  await pop.getByRole('option', { name: /快速/ }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('socrates-response-speed')))
    .toBe('fast');

  await pop.getByRole('button', { name: /思考强度/ }).click();
  const slider = pop.locator('input[type="range"]');
  await expect(slider).toBeVisible();
  /* React-controlled input: set through the native setter so the synthetic
     onChange sees a real value transition. */
  await slider.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '3');
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort')))
    .toBe('high');

  /* Escape backs out of the slider sub-view first, then dismisses. */
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
});
