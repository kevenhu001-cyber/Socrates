import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('desktop sidebar commits layout once and animates the main surface with transform', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const result = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('#appShell .main');
    if (!(sidebar instanceof HTMLElement) || !(main instanceof HTMLElement)) return null;

    sidebar.classList.remove('collapsed');
    main.getAnimations().forEach((animation) => animation.cancel());

    const beforeInset = Number.parseFloat(getComputedStyle(main).paddingLeft);
    window.toggleSidebar?.();

    const afterInset = Number.parseFloat(getComputedStyle(main).paddingLeft);
    const sidebarTransition = getComputedStyle(sidebar).transitionDuration;
    const mainTransition = getComputedStyle(main).transitionDuration;
    const animations = main.getAnimations().map((animation) => ({
      duration: Number(animation.effect?.getTiming().duration || 0),
      keyframes: animation.effect instanceof KeyframeEffect
        ? animation.effect.getKeyframes().map((frame) => String(frame.transform || ''))
        : [],
    }));

    return { beforeInset, afterInset, sidebarTransition, mainTransition, animations };
  });

  expect(result).not.toBeNull();
  expect(result.beforeInset - result.afterInset).toBeGreaterThan(100);
  expect(result.sidebarTransition).toMatch(/^0s(?:, 0s)*$/);
  expect(result.mainTransition).toMatch(/^0s(?:, 0s)*$/);
  const spatial = result.animations.find((animation) => animation.keyframes.join(' ').includes('translateX'));
  expect(spatial).toBeTruthy();
  expect(spatial.duration).toBe(180);
});

test('rapid sidebar reversal preserves the visible position and reduced motion snaps', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const result = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('#appShell .main');
    sidebar.classList.remove('collapsed');
    window.toggleSidebar();
    const motion = main.getAnimations()[0];
    motion.pause();
    motion.currentTime = 60;
    const visibleInset = parseFloat(getComputedStyle(main).paddingLeft)
      + new DOMMatrixReadOnly(getComputedStyle(main).transform).m41;
    window.toggleSidebar();
    const next = main.getAnimations()[0];
    next.pause();
    next.currentTime = 0;
    const reversedInset = parseFloat(getComputedStyle(main).paddingLeft)
      + new DOMMatrixReadOnly(getComputedStyle(main).transform).m41;
    next.finish();
    return { visibleInset, reversedInset };
  });
  expect(Math.abs(result.visibleInset - result.reversedInset)).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/motion-sidebar-settled.png', animations: 'disabled' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const count = await page.evaluate(() => {
    window.toggleSidebar();
    return document.querySelector('#appShell .main').getAnimations().length;
  });
  expect(count).toBe(0);
});

test('overlay motion uses only opacity and transform with a crisp ease-out', async ({ page }) => {
  const result = await page.evaluate(() => {
    const menu = document.createElement('div');
    menu.className = 'anchored-menu';
    menu.textContent = 'Motion fixture';
    document.getElementById('appShell').append(menu);
    const style = getComputedStyle(menu);
    const frames = menu.getAnimations().flatMap((animation) => animation.effect.getKeyframes());
    const result = {
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
      hasFilter: frames.some((frame) => 'filter' in frame),
    };
    menu.remove();
    return result;
  });
  expect(result.duration).toBe('0.18s');
  expect(result.easing).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  expect(result.hasFilter).toBe(false);
});

test('button hover colors keep their transition through press and release', async ({ page }) => {
  const phases = await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'btn';
    button.textContent = 'Press feedback';
    document.body.append(button);
    const read = () => getComputedStyle(button).transitionProperty.split(',').map((value) => value.trim());
    const idle = read();
    button.classList.add('is-pressed');
    const pressed = read();
    button.classList.replace('is-pressed', 'is-press-release');
    const released = read();
    button.remove();
    return [idle, pressed, released];
  });
  for (const properties of phases) {
    expect(properties).toEqual(expect.arrayContaining(['opacity', 'background-color', 'color', 'border-color']));
    expect(properties).not.toContain('all');
  }
});

test('focus outlines use a color and the account input retains its separate halo', async ({ page }) => {
  const focus = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const input = document.createElement('input');
    input.className = 'settings-account-name';
    document.body.append(input);
    input.focus();
    const result = {
      validColor: CSS.supports('color', style.getPropertyValue('--ui-focus-ring').trim()),
      validShadow: CSS.supports('box-shadow', style.getPropertyValue('--ui-focus-shadow').trim()),
      shadow: getComputedStyle(input).boxShadow,
    };
    input.remove();
    return result;
  });
  expect(focus.validColor).toBe(true);
  expect(focus.validShadow).toBe(true);
  expect(focus.shadow).not.toBe('none');
});

test('composer menu opens crisply on the shared clock and respects reduced motion', async ({ page }) => {
  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  const motion = await menu.evaluate((node) => {
    const style = getComputedStyle(node);
    const frames = node.getAnimations().flatMap((animation) => animation.effect.getKeyframes());
    return { duration: style.animationDuration, easing: style.animationTimingFunction,
      radius: style.borderTopLeftRadius, hasFilter: frames.some((frame) => 'filter' in frame) };
  });
  expect(motion.duration).toBe('0.18s');
  expect(motion.easing).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  expect(motion.radius).toBe('16px');
  expect(motion.hasFilter).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(menu).toHaveCSS('animation-name', 'none');
});

test('thinking, tools and recording share one primary persistent cue', async ({ page }) => {
  const normal = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    if (!shell) return null;
    const fixture = document.createElement('div');
    fixture.id = 'motion-convergence-fixture';
    fixture.className = 'turn-activity-surface thinking-accordion';
    fixture.dataset.live = 'true';
    fixture.innerHTML = `
      <div class="thinking-status">
        <span class="tool-inline-tool-icon"></span>
        <span class="thinking-status-label">Thinking</span>
      </div>
      <details class="tool-inline" data-state="running">
        <summary class="tool-inline-head">
          <span class="tool-inline-tool-icon"></span>
          <span class="tool-inline-label">Searching</span>
        </summary>
      </details>
      <div class="agent-step" data-state="running">
        <span class="agent-step-icon"></span>
        <span class="agent-step-label">Running command</span>
      </div>
      <span class="voice-recording-indicator"></span>
    `;
    shell.appendChild(fixture);

    const animation = (selector, pseudo) => {
      const node = fixture.querySelector(selector);
      return node ? getComputedStyle(node, pseudo).animationName : null;
    };
    const thinking = fixture.querySelector('.thinking-status-label');

    return {
      thinkingLabel: animation('.thinking-status-label'),
      thinkingIcon: animation('.thinking-status .tool-inline-tool-icon'),
      thinkingBackground: thinking ? getComputedStyle(thinking).backgroundImage : null,
      inlineLabel: animation('.tool-inline-label'),
      inlineIcon: animation('.tool-inline .tool-inline-tool-icon'),
      agentLabel: animation('.agent-step-label'),
      agentIcon: animation('.agent-step-icon'),
      voiceCore: animation('.voice-recording-indicator'),
      voiceHalo: animation('.voice-recording-indicator', '::after'),
    };
  });

  expect(normal).not.toBeNull();
  expect(normal.thinkingLabel).toBe('ui-activity-breathe');
  expect(normal.thinkingIcon).toBe('none');
  /* The caption cue is compositor-only now: no travelling gradient is
     painted on the text, so nothing has to repaint it every frame. */
  expect(normal.thinkingBackground).toBe('none');
  expect(normal.inlineLabel).toBe('none');
  expect(normal.inlineIcon).toBe('none');
  expect(normal.agentLabel).toBe('none');
  expect(normal.agentIcon).toBe('none');
  expect(normal.voiceCore).toBe('none');
  expect(normal.voiceHalo).toBe('ui-recording-ring');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => {
    const fixture = document.getElementById('motion-convergence-fixture');
    if (!fixture) return null;
    const animation = (selector, pseudo) => {
      const node = fixture.querySelector(selector);
      return node ? getComputedStyle(node, pseudo).animationName : null;
    };
    const thinking = fixture.querySelector('.thinking-status-label');
    return {
      thinking: animation('.thinking-status-label'),
      inline: animation('.tool-inline-label'),
      agent: animation('.agent-step-label'),
      voiceHalo: animation('.voice-recording-indicator', '::after'),
      fill: thinking ? getComputedStyle(thinking).webkitTextFillColor : null,
    };
  });

  expect(reduced).not.toBeNull();
  expect(reduced.thinking).toBe('none');
  expect(reduced.inline).toBe('none');
  expect(reduced.agent).toBe('none');
  expect(reduced.voiceHalo).toBe('none');
  expect(reduced.fill).not.toBe('transparent');

  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  const label = page.locator('#motion-convergence-fixture .thinking-status-label');
  await expect(label).toHaveCSS('animation-name', 'none');
  await expect(label).toHaveCSS('background-image', 'none');
  expect(await label.evaluate((node) => getComputedStyle(node).color)).not.toBe('rgba(0, 0, 0, 0)');
});
