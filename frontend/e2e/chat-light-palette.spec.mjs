// e2e/chat-light-palette.spec.mjs — light-mode palette regressions.
//
// Pins the readability contract for the conversation surface:
//   - user bubble must be a light card with dark text (the workbench's
//     dark override used to leak into light mode);
//   - the sidebar identity avatar uses the shadcn muted fallback and remains
//     legible in both modes;
//   - the in-session composer keeps a visible outline;
//   - the send control uses shadcn's primary / primary-foreground roles.

import { test, expect } from '@playwright/test';
import { WORKBENCH_VIEWPORTS, prepareChatWorkbench } from './_chat-workbench.mjs';
import { rgbChannels, sameRgb } from './_lib.mjs';

const BASE_MESSAGES = [
  { clientId: 'fixture-user', role: 'user', rawText: '你好啊', html: '<p>你好啊</p>', type: 'user' },
  { clientId: 'fixture-assistant', role: 'assistant', rawText: 'Hello!', html: '<p>Hello!</p>', type: 'assistant' },
];

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
      };
    };
    const tokens = getComputedStyle(document.documentElement);
    return {
      bubble: style('#msgList .msg.user .msg-body'),
      avatar: style('#appShell [data-slot="avatar-fallback"]'),
      composer: style('#composerInputWrap'),
      send: style('#composerPrimaryBtn'),
      semantic: {
        secondary: tokens.getPropertyValue('--secondary').trim(),
        muted: tokens.getPropertyValue('--muted').trim(),
        foreground: tokens.getPropertyValue('--foreground').trim(),
        primary: tokens.getPropertyValue('--primary').trim(),
        primaryForeground: tokens.getPropertyValue('--primary-foreground').trim(),
      },
    };
  });
}

test('light conversation surface stays readable and neutral', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'light'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

  const palette = await snapshotPalette(page);
  expect(palette.bubble).not.toBeNull();
  expect(palette.avatar).not.toBeNull();
  expect(palette.composer).not.toBeNull();
  expect(palette.send).not.toBeNull();

  const bubbleBg = rgbChannels(palette.bubble.background);
  const bubbleFg = rgbChannels(palette.bubble.color);
  expect(bubbleBg).not.toBeNull();
  expect(bubbleFg).not.toBeNull();
  // Light card on a white page, not a dark chip.
  expect(luminance(bubbleBg)).toBeGreaterThan(0.8);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);
  expect(sameRgb(palette.bubble.background, palette.semantic.secondary)).toBe(true);

  // AvatarFallback keeps shadcn's muted surface and uses the foreground role
  // so the initials meet the text contrast threshold on neutral palettes.
  const avatarBg = rgbChannels(palette.avatar.background);
  const avatarFg = rgbChannels(palette.avatar.color);
  expect(avatarBg).not.toBeNull();
  expect(sameRgb(palette.avatar.background, palette.semantic.muted)).toBe(true);
  expect(sameRgb(palette.avatar.color, palette.semantic.foreground)).toBe(true);
  expect(contrast(avatarFg, avatarBg)).toBeGreaterThanOrEqual(4.5);

  // Composer hairline is actually painted in light mode.
  expect(parseFloat(palette.composer.borderWidth)).toBeGreaterThanOrEqual(1);

  // The arrow is a control glyph, so retain the 3:1 non-text contrast floor.
  const sendBg = rgbChannels(palette.send.background);
  const sendFg = rgbChannels(palette.send.color);
  expect(sameRgb(palette.send.background, palette.semantic.primary)).toBe(true);
  expect(sameRgb(palette.send.color, palette.semantic.primaryForeground)).toBe(true);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(3);
});

test('dark conversation surface uses shadcn semantic component colors', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'dark'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

  const palette = await snapshotPalette(page);
  const bubbleBg = rgbChannels(palette.bubble.background);
  const bubbleFg = rgbChannels(palette.bubble.color);
  expect(luminance(bubbleBg)).toBeLessThan(0.2);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);
  expect(sameRgb(palette.bubble.background, palette.semantic.secondary)).toBe(true);

  const sendBg = rgbChannels(palette.send.background);
  const sendFg = rgbChannels(palette.send.color);
  expect(sameRgb(palette.send.background, palette.semantic.primary)).toBe(true);
  expect(sameRgb(palette.send.color, palette.semantic.primaryForeground)).toBe(true);
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
  const canvas = rgbChannels(mobile.canvas);
  const openFg = rgbChannels(mobile.openBtn.color);
  expect(contrast(openFg, canvas)).toBeGreaterThanOrEqual(4.5);

  // …and the icon-only actions are dark on the page.
  expect(contrast(rgbChannels(mobile.findBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rgbChannels(mobile.shareBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
});
