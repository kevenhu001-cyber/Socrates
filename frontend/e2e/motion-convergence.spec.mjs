import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
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

    /* Establish the expanded state without invoking the transition under test. */
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
  /* The service suppresses the legacy width/padding transitions only for the
     geometry commit frame. The visual continuation is the WAAPI transform. */
  expect(result.sidebarTransition).toMatch(/^0s(?:, 0s)*$/);
  expect(result.mainTransition).toMatch(/^0s(?:, 0s)*$/);
  const spatial = result.animations.find((animation) => animation.keyframes.join(' ').includes('translateX'));
  expect(spatial).toBeTruthy();
  expect(spatial.duration).toBe(180);
});

test('live thinking uses one primary cue and respects reduced motion', async ({ page }) => {
  const normal = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    if (!shell) return null;
    const fixture = document.createElement('div');
    fixture.id = 'motion-convergence-fixture';
    fixture.innerHTML = `
      <div class="thinking-status">
        <span class="thinking-status-label shimmer-text">Working</span>
      </div>
    `;
    shell.appendChild(fixture);
    const label = fixture.querySelector('.thinking-status-label');
    return label ? getComputedStyle(label).animationName : null;
  });

  expect(normal).toBe('thinking-status-shimmer');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.locator('#motion-convergence-fixture .thinking-status-label').evaluate((label) => ({
    animation: getComputedStyle(label).animationName,
    fill: getComputedStyle(label).webkitTextFillColor,
  }));
  expect(reduced.animation).toBe('none');
  expect(reduced.fill).not.toBe('transparent');
});
