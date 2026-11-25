import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('React-owned navigation renders a glyph for every primary destination', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page);
  await waitForAppShell(page);
  for (const id of [
    'navNew',
    'navSearch',
    'navLibrary',
    'navProjects',
    'navScheduled',
    'navPlugins',
    'navSites',
    'navMore',
  ]) {
    /* RN 侧栏：每行的图标放在 data-part="nav-glyph" 槽里。 */
    const icon = page.locator(`#${id} [data-part="nav-glyph"] svg`);
    await expect(icon, id).toBeVisible();
    expect(
      await icon.locator('path, circle, rect, line, polyline, polygon').count(),
      id,
    ).toBeGreaterThan(0);
  }
});

for (const theme of ['light', 'dark']) {
  test(`phone ${theme} icons inherit their theme and stay inside their viewBox`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
    await mockAuthedApp(page);
    await gotoAndSettle(page);
    await waitForAppShell(page);
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
    await page.locator('#sidebarOpenBtn').click();
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
    /* 主题 ink 色：RN 图标的 stroke 读 var(--ui-ink)，随 [data-mode] 切换。 */
    const ink = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--ui-ink)';
      (document.querySelector('#sidebar') || document.body).append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    const [r, g, b] = ink.match(/\d+/g).map(Number);
    /* 浅色主题的 ink 接近黑，深色主题接近白：确认颜色确实跟着主题走。 */
    if (theme === 'light') expect(r + g + b).toBeLessThan(3 * 64);
    else expect(r + g + b).toBeGreaterThan(3 * 192);
    const icons = await page
      .locator('#sidebarNav .sidebar-nav-btn [data-part="nav-glyph"] svg')
      .evaluateAll((elements) =>
        elements
          .filter((svg) => svg.getBoundingClientRect().width > 0)
          .map((svg) => {
            const style = getComputedStyle(svg);
            const box = svg.getBBox();
            return {
              official: svg.getAttribute('data-icon-source') === 'openai-apps-sdk',
              fill: style.fill,
              stroke: style.strokeWidth,
              color: style.stroke,
              decorative: svg.getAttribute('aria-hidden'),
              focusable: svg.getAttribute('focusable'),
              fits: box.x >= 0 && box.y >= 0 && box.x + box.width <= 24 && box.y + box.height <= 24,
            };
          }),
      );
    expect(icons.length).toBeGreaterThanOrEqual(5);
    for (const icon of icons) {
      /* RN-7 图标统一 1.5px 线宽（UI_ICON_STROKE，non-scaling）。 */
      if (icon.official) {
        expect(icon.color).toBe('none');
        expect(icon.fill).toBe(ink);
      } else {
        expect(icon.stroke).toBe('1.5px');
        expect(icon.color).toBe(ink);
      }
      expect(icon.decorative).toBe('true');
      expect(icon.focusable).toBe('false');
      expect(icon.fits).toBe(true);
    }
    await page.locator('#sidebarCloseBtn').click();
    await page.locator('#composerToolsBtn').click();
    await expect(page.locator('#composerToolsMenu')).toBeVisible();
    for (const action of [
      'camera',
      'photos',
      'upload',
      'createImage',
      'webSearch',
      'extensiveThinking',
    ]) {
      const glyph = page.locator(
        `.composer-tools-mobile-items [data-composer-action="${action}"] :is(.composer-tools-icon, .composer-tools-tile-icon) svg`,
      );
      await expect(glyph).toBeVisible();
      await expect(glyph).toHaveAttribute('viewBox', '0 0 24 24');
      await expect(glyph).toHaveAttribute('data-icon-source', 'openai-apps-sdk');
      await expect(glyph).toHaveAttribute('fill', 'currentColor');
      await expect(glyph).toHaveCSS('stroke', 'none');
      await expect(glyph).toHaveAttribute('aria-hidden', 'true');
      await expect(glyph).toHaveAttribute('focusable', 'false');
      const fits = await glyph.evaluate((svg) => {
        const box = svg.getBBox();
        return box.x >= 0 && box.y >= 0 && box.x + box.width <= 24 && box.y + box.height <= 24;
      });
      expect(fits).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#composerToolsBtn')).toBeFocused();
  });
}
