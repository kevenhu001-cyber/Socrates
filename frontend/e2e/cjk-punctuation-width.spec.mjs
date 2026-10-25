import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/**
 * Chinese punctuation must be painted with full-width metrics.
 *
 * The text in the DOM was already full width — the model is told to use
 * ，。！？ and the client normalizes anything else — but the first family in
 * the font stack (Geist Sans) carries narrow, Latin-proportioned glyphs for
 * U+3000-303F and U+FF00-FFEF. The browser painted those code points with
 * Geist, so a Chinese sentence read as English punctuation on screen even
 * though every character was U+FF0C / U+FF01 / U+FF1F.
 *
 * The assertion is about the rendered advance, not about the string: only a
 * real measurement catches a font that claims the wrong code points.
 */
test('Chinese punctuation renders full width instead of Latin metrics', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const widths = await page.evaluate(async () => {
    // Load the faces explicitly: on a machine without a CJK system font the
    // fallback metrics would otherwise decide the measurement.
    await document.fonts.load('32px "Noto Sans SC"', '，。！？；：（）、助');
    await document.fonts.load('32px "Geist Sans"', 'A');
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:32px;';
    probe.style.fontFamily = getComputedStyle(document.body).fontFamily;
    document.body.appendChild(probe);
    const width = (text) => {
      probe.textContent = text;
      const range = document.createRange();
      range.setStart(probe.firstChild, 0);
      range.setEnd(probe.firstChild, text.length);
      return Math.round(range.getBoundingClientRect().width * 100) / 100;
    };
    const measured = {};
    for (const ch of ['助', '，', '。', '！', '？', '；', '：', '（', '）', '、', ',', 'A']) {
      measured[ch] = width(ch);
    }
    probe.remove();
    return measured;
  });

  const han = widths['助'];
  expect(han).toBeGreaterThan(0);

  // Every Chinese punctuation mark takes one full em, exactly like a Han
  // character — not the narrow Latin advance.
  for (const ch of ['，', '。', '！', '？', '；', '：', '（', '）', '、']) {
    expect(Math.abs(widths[ch] - han), `${ch} must advance one em like a Han character`).toBeLessThanOrEqual(1);
    expect(widths[ch], `${ch} must be wider than the ASCII comma`).toBeGreaterThan(widths[','] + 4);
  }

  // Latin stays proportional: the Latin face was not swapped for a CJK one.
  expect(widths['A']).toBeLessThan(han);
});
