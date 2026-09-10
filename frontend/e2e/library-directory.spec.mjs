// e2e/library-directory.spec.mjs — Library (资料库) file rows.
//
// Contract for the file list:
//   1. The row selection checkbox is hidden until the row is hovered,
//      selected, or the checkbox itself is focused.
//   2. The thumbnail box renders a glyph for the item's file type
//      (via files.kind, falling back to the filename extension).

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const FILES = {
  files: [
    { id: 'f1', name: 'country_risk_data.csv', kind: 'text', size: 1024, uploadedAt: '2026-08-18T18:59:37.981Z' },
    { id: 'f2', name: 'grid_mapping.png', kind: 'image', size: 82944, uploadedAt: '2026-08-15T13:05:29.226Z' },
    { id: 'f3', name: 'lecture_notes.pdf', kind: 'pdf', size: 240000, uploadedAt: '2026-08-13T10:00:00.000Z' },
    { id: 'f4', name: 'lab_report.docx', kind: 'docx', size: 45000, uploadedAt: '2026-08-12T10:00:00.000Z' },
  ],
  hasMore: false,
};

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await page.route(/\/api\/(v2\/)?files(\?|$)/, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FILES) });
  });
  await page.route(/\/api\/(v2\/)?artifacts(\?|$)/, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifacts: [] }) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.click('#navLibrary');
  await expect(page.locator('.library-row')).toHaveCount(FILES.files.length);
});

const row = (page, name) => page.locator('.library-row', { hasText: name });

test('selection checkbox only appears on hover, selection or focus', async ({ page }) => {
  const csv = row(page, 'country_risk_data.csv');
  const label = csv.locator('.library-checkbox-label');

  expect(await label.evaluate((n) => getComputedStyle(n).opacity)).toBe('0');

  await csv.hover();
  await expect(label).toHaveCSS('opacity', '1');

  await page.mouse.move(720, 40);
  await expect(label).toHaveCSS('opacity', '0');

  // A selected row keeps its checkbox visible without hover.
  await csv.locator('.library-checkbox').click();
  await expect(csv.locator('.library-checkbox')).toBeChecked();
  await expect(csv).toHaveClass(/library-row-selected/);
  await expect(label).toHaveCSS('opacity', '1');

  // Keyboard focus also reveals it again after deselection.
  await csv.locator('.library-checkbox').click();
  await expect(csv.locator('.library-checkbox')).not.toBeChecked();
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
  await page.mouse.move(720, 40);
  await expect(label).toHaveCSS('opacity', '0');
  await csv.locator('.library-checkbox').focus();
  await expect(label).toHaveCSS('opacity', '1');
});

test('thumbnail box renders a file-type glyph', async ({ page }) => {
  const shapes = (name) =>
    row(page, name).locator('.library-file-icon svg').evaluate((svg) => ({
      rect: svg.querySelectorAll('rect').length,
      circle: svg.querySelectorAll('circle').length,
      path: svg.querySelectorAll('path').length,
    }));

  // Spreadsheet/CSV → grid: outer rect + grid lines, no circle.
  const csv = await shapes('country_risk_data.csv');
  expect(csv).toEqual({ rect: 1, circle: 0, path: 1 });

  // Image → picture frame + sun (circle).
  const png = await shapes('grid_mapping.png');
  expect(png.rect).toBe(1);
  expect(png.circle).toBe(1);

  // Documents → page outline with fold + text lines.
  const pdf = await shapes('lecture_notes.pdf');
  expect(pdf).toEqual({ rect: 0, circle: 0, path: 3 });
  const docx = await shapes('lab_report.docx');
  expect(docx).toEqual({ rect: 0, circle: 0, path: 3 });
});
