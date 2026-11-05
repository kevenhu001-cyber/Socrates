// e2e/chat-light-palette.spec.mjs — light-mode palette regressions.
//
// Pins the readability contract for the conversation surface:
//   - user bubble must be a light card with dark text (the workbench's
//     dark override used to leak into light mode);
//   - the sidebar identity avatar keeps its teal brand and legible initials;
//   - the in-session composer keeps a visible outline;
//   - the enabled send control is blue with a legible white arrow in both modes.

import { test, expect } from '@playwright/test';
import { WORKBENCH_VIEWPORTS, prepareChatWorkbench } from './_chat-workbench.mjs';

const BASE_MESSAGES = [
  { clientId: 'fixture-user', role: 'user', rawText: '你好啊', html: '<p>你好啊</p>', type: 'user' },
  { clientId: 'fixture-assistant', role: 'assistant', rawText: 'Hello!', html: '<p>Hello!</p>', type: 'assistant' },
];

function parseRgb(value) {
  const channels = (value.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  return channels.length === 3 ? channels : null;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function snapshotPalette(page) {
  return page.evaluate(() => {
    const style = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      return {
        background: computed.backgroundColor,
        color: computed.color,
        borderWidth: computed.borderTopWidth,
        borderColor: computed.borderTopColor,
        shadow: computed.boxShadow,
        stroke: computed.stroke,
      };
    };
    return {
      bubble: style('#msgList .msg.user .msg-body'),
      avatar: style('#appShell .user-avatar'),
      composer: style('#composerInputWrap [data-composer-frame]'),
      send: { ...style('#composerPrimaryBtn'), color: style('#composerPrimaryBtn svg').stroke },
    };
  });
}

test('light conversation surface keeps readable brand and action colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'light'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('#msgList .msg.user .msg-body')).toBeVisible();
  await page.locator('#composerRoot .rich-composer-editor').fill('Check send colour');
  /* The send disc only takes the action colour once the draft has committed
     through React; a raw fill followed by an immediate read sees the
     disabled `fill` role instead. */
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-ready', 'true');
  /* The disc cross-fades from the disabled fill role to the action colour;
     poll until the transition settles so the snapshot is not mid-blend. */
  await expect.poll(async () => parseRgb(await page.locator('#composerPrimaryBtn').evaluate((el) => getComputedStyle(el).backgroundColor)))
    .toEqual([57, 126, 247]);

  const palette = await snapshotPalette(page);
  expect(palette.bubble).not.toBeNull();
  expect(palette.avatar).not.toBeNull();
  expect(palette.composer).not.toBeNull();
  expect(palette.send).not.toBeNull();

  const bubbleBg = parseRgb(palette.bubble.background);
  const bubbleFg = parseRgb(palette.bubble.color);
  expect(bubbleBg).not.toBeNull();
  expect(bubbleFg).not.toBeNull();
  // Light card on a white page, not a dark chip.
  expect(luminance(bubbleBg)).toBeGreaterThan(0.8);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);

  // Restore the original teal identity rather than greyscaling the brand.
  const avatarBg = parseRgb(palette.avatar.background);
  const avatarFg = parseRgb(palette.avatar.color);
  expect(avatarBg).not.toBeNull();
  expect(avatarBg).toEqual([15, 127, 107]);
  expect(contrast(avatarFg, avatarBg)).toBeGreaterThanOrEqual(4.5);

  // Composer hairline is actually painted in light mode.
  expect(palette.composer.shadow).not.toBe('none');

  // A control glyph must clear WCAG's 3:1 non-text contrast on blue.
  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(sendBg).not.toBeNull();
  expect(sendBg).toEqual([57, 126, 247]);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(3);
});

test('dark conversation surface retains the blue send control', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'dark'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('#msgList .msg.user .msg-body')).toBeVisible();
  await page.locator('#composerRoot .rich-composer-editor').fill('Check send colour');
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-ready', 'true');
  await expect.poll(async () => parseRgb(await page.locator('#composerPrimaryBtn').evaluate((el) => getComputedStyle(el).backgroundColor)))
    .toEqual([57, 126, 247]);

  const palette = await snapshotPalette(page);
  const bubbleBg = parseRgb(palette.bubble.background);
  const bubbleFg = parseRgb(palette.bubble.color);
  expect(luminance(bubbleBg)).toBeLessThan(0.2);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);

  // Blue actions remain stable across mode changes.
  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(sendBg).not.toBeNull();
  expect(sendBg).toEqual([57, 126, 247]);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(3);
});

test('mobile light conversation inverts header controls and the canvas fade', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'light'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.mobile });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  const mobile = await page.evaluate(() => {
    const pick = (selector, props) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      return Object.fromEntries(props.map((property) => [property, computed[property]]));
    };
    return {
      inputBar: pick('.chat-input-bar', ['backgroundImage']),
      // The canvas the composer fades into, read live: the assertion used to
      // hard-code white, which was the light page colour before the page
      // moved to --ui-bg-page (#f8f8f8). Pinning the token keeps the intent
      // ("the fade lands on the page, not on a black band") and makes the
      // contrast checks run against the colour that is actually rendered.
      canvas: getComputedStyle(document.querySelector('.main-content')).backgroundColor,
      openBtn: pick('#sidebarOpenBtn', ['backgroundColor', 'color']),
      findBtn: pick('#findBtn', ['color']),
      shareBtn: pick('#shareBtn', ['color']),
    };
  });
  expect(mobile.inputBar).not.toBeNull();
  expect(mobile.openBtn).not.toBeNull();
  expect(mobile.findBtn).not.toBeNull();
  expect(mobile.shareBtn).not.toBeNull();

  // The composer fade must land on the phone canvas, not a black band.
  expect(mobile.inputBar.backgroundImage).toContain(`${mobile.canvas} 24px`);
  expect(mobile.inputBar.backgroundImage).not.toContain('rgb(0, 0, 0) 24px');

  // Header controls are borderless dark glyphs on the page now.
  const canvas = parseRgb(mobile.canvas);
  const openFg = parseRgb(mobile.openBtn.color);
  expect(contrast(openFg, canvas)).toBeGreaterThanOrEqual(4.5);

  // …and the icon-only actions are dark on the page.
  expect(contrast(parseRgb(mobile.findBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(parseRgb(mobile.shareBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
});
