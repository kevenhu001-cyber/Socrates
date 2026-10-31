import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
});

test('interrupted menus reverse from their visible opacity instead of replaying endpoints', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const node = document.createElement('div');
    node.className = 'anchored-menu';
    node.dataset.anchoredMenu = '';
    node.dataset.state = 'open';
    node.dataset.startingStyle = '';
    document.getElementById('appShell').append(node);
    getComputedStyle(node).opacity;
    delete node.dataset.startingStyle;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 50; }
    const before = Number(getComputedStyle(node).opacity);
    node.dataset.state = 'closing';
    node.dataset.endingStyle = '';
    const after = Number(getComputedStyle(node).opacity);
    const properties = getComputedStyle(node).transitionProperty;
    const frames = node.getAnimations().flatMap((animation) => animation.effect.getKeyframes());
    const animationName = getComputedStyle(node).animationName;
    node.remove();
    return { before, after, properties, animationName, hasFilter: frames.some((frame) => 'filter' in frame) };
  });
  expect(result.before).toBeGreaterThan(0.1);
  expect(result.before).toBeLessThan(0.98);
  expect(Math.abs(result.after - result.before)).toBeLessThan(0.04);
  expect(result.properties).toBe('opacity, transform');
  expect(result.animationName).toBe('none');
  expect(result.hasFilter).toBe(false);
});

test('rapid page navigation cancels the outgoing pane motion and keeps the final destination', async ({ page }) => {
  const result = await page.evaluate(() => {
    window.__socratesLegacy.navigation.openNav('library');
    const library = document.getElementById('libraryPanel');
    const previous = library.getAnimations()[0];
    window.__socratesLegacy.navigation.openNav('projects');
    const projects = document.getElementById('spacesPanel');
    return {
      oldState: previous?.playState,
      oldAnimations: library.getAnimations().length,
      newAnimations: projects.getAnimations().length,
      active: document.documentElement.dataset.mainView,
      shellAnimations: document.getElementById('appShell').getAnimations().length,
    };
  });
  expect(result).toMatchObject({ oldState: 'idle', oldAnimations: 0, newAnimations: 1, active: 'spacesPanel', shellAnimations: 0 });
  await expect(page.locator('#spacesPanel')).toBeVisible();
  await expect(page.locator('#libraryPanel')).toBeHidden();
  await expect(page).toHaveURL(/\/projects$/);
});

for (const media of [{ reducedMotion: 'reduce' }, { forcedColors: 'active' }]) {
  test(`pane transitions respect ${JSON.stringify(media)}`, async ({ page }) => {
    await page.emulateMedia(media);
    const count = await page.evaluate(() => {
      window.__socratesLegacy.navigation.openNav('library');
      return document.getElementById('libraryPanel').getAnimations().length;
    });
    expect(count).toBe(0);
    await expect(page.locator('#libraryPanel')).toBeVisible();
  });
}
