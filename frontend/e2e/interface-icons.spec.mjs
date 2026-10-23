import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('navigation keeps the same glyphs through first paint and React boot', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page);
  await waitForAppShell(page);
  const result = await page.evaluate(async () => {
    const source = new DOMParser().parseFromString(await (await fetch('/')).text(), 'text/html');
    const shapes = (root, id) => [...root.querySelector(`#${id} svg`).children].map((shape) =>
      [shape.tagName.toLowerCase(), [...shape.attributes].map((a) => [a.name, a.value]).sort()],
    );
    return ['navNew', 'navLibrary', 'navProjects', 'navScheduled', 'navPlugins', 'navSites', 'navMore']
      .map((id) => ({ id, initial: shapes(source, id), hydrated: shapes(document, id) }));
  });
  for (const { id, initial, hydrated } of result) expect(hydrated, id).toEqual(initial);
});

for (const theme of ['light', 'dark']) {
  test(`phone ${theme} icons inherit their theme and stay inside their viewBox`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
    await mockAuthedApp(page);
    await gotoAndSettle(page);
    await waitForAppShell(page);
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await page.locator('#sidebarOpenBtn').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    const icons = await page.locator('#sidebarNav .sidebar-nav-btn > span:first-child svg').evaluateAll((elements) =>
      elements.filter((svg) => svg.getBoundingClientRect().width > 0).map((svg) => {
        const style = getComputedStyle(svg);
        const box = svg.getBBox();
        return {
          stroke: style.strokeWidth, color: style.stroke, expectedColor: style.color,
          decorative: svg.getAttribute('aria-hidden'), focusable: svg.getAttribute('focusable'),
          fits: box.x >= 1 && box.y >= 1 && box.x + box.width <= 23 && box.y + box.height <= 23,
        };
      }),
    );
    expect(icons.length).toBeGreaterThan(5);
    for (const icon of icons) {
      expect(icon.stroke).toBe('1.75px');
      expect(icon.color).toBe(icon.expectedColor);
      expect(icon.decorative).toBe('true');
      expect(icon.focusable).toBe('false');
      expect(icon.fits).toBe(true);
    }
    await page.locator('#sidebarCloseBtn').click();
    await page.locator('#composerToolsBtn').click();
    await expect(page.locator('#composerToolsMenu')).toBeVisible();
    for (const action of ['camera', 'photos', 'upload', 'createImage', 'webSearch', 'extensiveThinking']) {
      const glyph = page.locator(`.composer-tools-mobile-items [data-composer-action="${action}"] .composer-tools-icon svg`);
      await expect(glyph).toBeVisible();
      await expect(glyph).toHaveCSS('stroke-width', '1.75px');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#composerToolsBtn')).toBeFocused();
  });
}
