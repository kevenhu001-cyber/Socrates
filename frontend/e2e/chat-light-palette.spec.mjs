// e2e/chat-light-palette.spec.mjs — light-mode palette regressions.
//
// Pins the readability contract for the conversation surface:
//   - user bubble must be a light card with dark text (the workbench's
//     dark override used to leak into light mode);
//   - the sidebar identity avatar defaults to neutral gray, not the accent;
//   - the in-session composer keeps a visible outline;
//   - the idle send control is a legible inverted circle in both modes.

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
      };
    };
    return {
      bubble: style('#msgList .msg.user .msg-body'),
      avatar: style('#appShell .user-avatar'),
      composer: style('#chatInputWrap'),
      send: style('#sendBtn'),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--cg-accent').trim(),
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

  const bubbleBg = parseRgb(palette.bubble.background);
  const bubbleFg = parseRgb(palette.bubble.color);
  expect(bubbleBg).not.toBeNull();
  expect(bubbleFg).not.toBeNull();
  // Light card on a white page, not a dark chip.
  expect(luminance(bubbleBg)).toBeGreaterThan(0.8);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);

  // Identity avatar is neutral gray (channels near-equal) and not the accent.
  const avatarBg = parseRgb(palette.avatar.background);
  const avatarFg = parseRgb(palette.avatar.color);
  expect(avatarBg).not.toBeNull();
  expect(Math.max(...avatarBg) - Math.min(...avatarBg)).toBeLessThanOrEqual(6);
  expect(palette.avatar.background).not.toBe('rgb(174, 116, 21)');
  expect(contrast(avatarFg, avatarBg)).toBeGreaterThanOrEqual(4.5);

  // Composer hairline is actually painted in light mode.
  expect(parseFloat(palette.composer.borderWidth)).toBeGreaterThanOrEqual(1);

  // Idle send control is inverted (dark circle / white glyph) in light mode.
  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(luminance(sendBg)).toBeLessThan(0.2);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(4.5);
});

test('dark conversation surface keeps the inverted white send control', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    try { localStorage.setItem('socrates-theme', 'dark'); } catch (_) {}
  });
  await prepareChatWorkbench(page, { messages: BASE_MESSAGES, viewport: WORKBENCH_VIEWPORTS.desktop });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');

  const palette = await snapshotPalette(page);
  const bubbleBg = parseRgb(palette.bubble.background);
  const bubbleFg = parseRgb(palette.bubble.color);
  expect(luminance(bubbleBg)).toBeLessThan(0.2);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);

  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(luminance(sendBg)).toBeGreaterThan(0.8);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(4.5);
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
      openBtn: pick('#sidebarOpenBtn', ['backgroundColor', 'color']),
      findBtn: pick('#findBtn', ['color']),
      shareBtn: pick('#shareBtn', ['color']),
    };
  });
  expect(mobile.inputBar).not.toBeNull();
  expect(mobile.openBtn).not.toBeNull();
  expect(mobile.findBtn).not.toBeNull();
  expect(mobile.shareBtn).not.toBeNull();

  // The composer fade must land on the white phone canvas, not a black band.
  expect(mobile.inputBar.backgroundImage).toContain('rgb(255, 255, 255) 24px');
  expect(mobile.inputBar.backgroundImage).not.toContain('rgb(0, 0, 0) 24px');

  // Header circle button is light with a dark glyph…
  const openBg = parseRgb(mobile.openBtn.backgroundColor);
  const openFg = parseRgb(mobile.openBtn.color);
  expect(luminance(openBg)).toBeGreaterThan(0.8);
  expect(contrast(openFg, openBg)).toBeGreaterThanOrEqual(4.5);

  // …and the icon-only actions are dark on the white bar.
  expect(contrast(parseRgb(mobile.findBtn.color), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(parseRgb(mobile.shareBtn.color), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
});
