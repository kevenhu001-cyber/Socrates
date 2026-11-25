// e2e/chat-light-palette.spec.mjs — light-mode palette regressions.
//
// Pins the readability contract for the conversation surface:
//   - user bubble must be a light card with dark text (the workbench's
//     dark override used to leak into light mode);
//   - the sidebar identity avatar keeps its teal brand and legible initials;
//   - the in-session composer keeps a visible outline;
//   - the enabled send control is blue with a legible white arrow in both modes.

import { test, expect } from './_state-fixture.mjs';
import { WORKBENCH_VIEWPORTS, prepareChatWorkbench } from './_chat-workbench.mjs';

const BASE_MESSAGES = [
  {
    clientId: 'fixture-user',
    role: 'user',
    rawText: '你好啊',
    html: '<p>你好啊</p>',
    type: 'user',
  },
  {
    clientId: 'fixture-assistant',
    role: 'assistant',
    rawText: 'Hello!',
    html: '<p>Hello!</p>',
    type: 'assistant',
  },
];

function parseRgb(value) {
  const channels = (value.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
  if (channels.length !== 3) return null;
  /* A color-mix() surface (the light bubble) computes to `color(srgb r g b)`
     with 0–1 channels; bring it onto the 0–255 scale the checks use. */
  return /^color\(srgb\b/.test(value.trim())
    ? channels.map((channel) => Math.round(channel * 255))
    : channels;
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
    const style = (selector, pseudo) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node, pseudo);
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
      composerEdge: style('#composerInputWrap [data-composer-frame]', '::before'),
      send: { ...style('#composerPrimaryBtn'), color: style('#composerPrimaryBtn svg').stroke },
    };
  });
}

test('light conversation surface keeps readable brand and action colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('socrates-theme', 'light');
    } catch (_) {}
  });
  await prepareChatWorkbench(page, {
    messages: BASE_MESSAGES,
    viewport: WORKBENCH_VIEWPORTS.desktop,
  });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('#msgList .msg.user .msg-body')).toBeVisible();
  await expect(page.locator('.top-bar')).toHaveCSS('backdrop-filter', 'none');
  const idlePalette = await snapshotPalette(page);
  await page.locator('#composerRoot .rich-composer-editor').fill('Check send colour');
  /* The send disc only takes the action colour once the draft has committed
     through React; a raw fill followed by an immediate read sees the
     disabled `fill` role instead. */
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-ready', 'true');
  /* The primary action is ink, not a brand colour (docs/design/
     chatgpt-alignment.md §3.5): black in light mode, near-white in dark. */
  await expect
    .poll(async () =>
      parseRgb(
        await page
          .locator('#composerPrimaryBtn')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    )
    .toEqual([13, 13, 13]);

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

  /* The light composer has a solid edge and a visible editor focus cue: the
     idle sheet is flat, and focus adds the inset hairline (no cast shadow). */
  expect(idlePalette.composer.shadow).toBe('none');
  expect(idlePalette.composerEdge.borderWidth).toBe('1px');
  expect(palette.composer.shadow).toMatch(/inset$/);
  expect(palette.composerEdge.borderColor).not.toBe(idlePalette.composerEdge.borderColor);

  // A control glyph must clear WCAG's 3:1 non-text contrast on the ink disc.
  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(sendBg).not.toBeNull();
  expect(sendBg).toEqual([13, 13, 13]);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(3);

  await page.locator('#composerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  /* The menu lifts off a white page with a ring plus contact and ambient
     layers (docs/design/chatgpt-alignment.md §3.7); a bare 1px ring read as
     flat against the canvas. */
  await expect(menu).toHaveCSS('box-shadow', /0px 0px 0px 1px.*0px 2px 6px.*0px 12px 28px/);
});

test('dark conversation surface retains the ink send control', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('socrates-theme', 'dark');
    } catch (_) {}
  });
  await prepareChatWorkbench(page, {
    messages: BASE_MESSAGES,
    viewport: WORKBENCH_VIEWPORTS.desktop,
  });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('#msgList .msg.user .msg-body')).toBeVisible();
  await page.locator('#composerRoot .rich-composer-editor').fill('Check send colour');
  await expect(page.locator('#composerPrimaryBtn')).toHaveAttribute('data-ready', 'true');
  await expect
    .poll(async () =>
      parseRgb(
        await page
          .locator('#composerPrimaryBtn')
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    )
    .toEqual([237, 237, 237]);

  const palette = await snapshotPalette(page);
  const bubbleBg = parseRgb(palette.bubble.background);
  const bubbleFg = parseRgb(palette.bubble.color);
  expect(luminance(bubbleBg)).toBeLessThan(0.2);
  expect(contrast(bubbleFg, bubbleBg)).toBeGreaterThanOrEqual(4.5);

  /* The primary action stays the ink disc in both modes, so its fill flips
     with the mode rather than holding one brand colour. */
  const sendBg = parseRgb(palette.send.background);
  const sendFg = parseRgb(palette.send.color);
  expect(sendBg).not.toBeNull();
  expect(sendBg).toEqual([237, 237, 237]);
  expect(contrast(sendFg, sendBg)).toBeGreaterThanOrEqual(3);
});

test('mobile light conversation inverts header controls over the canvas', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('socrates-theme', 'light');
    } catch (_) {}
  });
  await prepareChatWorkbench(page, {
    messages: BASE_MESSAGES,
    viewport: WORKBENCH_VIEWPORTS.mobile,
  });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  const palette = await snapshotPalette(page);
  /* Phone resting sheet: the edge is a 1px inset hairline on the flat fill,
     with no cast shadow. */
  expect(palette.composer.shadow).toMatch(/inset$/);
  expect(palette.composerEdge.borderWidth).toBe('1px');

  const mobile = await page.evaluate(() => {
    const pick = (selector, props) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      return Object.fromEntries(props.map((property) => [property, computed[property]]));
    };
    return {
      /* The legacy `.chat-input-bar` fade was retired with the flat composer
         (2026-11-21): the bar is a transparent layout box on the page now. */
      inputBar: pick('.chat-input-bar', ['backgroundImage', 'backgroundColor']),
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

  // The composer bar adds no band of its own; the page colour shows through.
  expect(mobile.inputBar.backgroundImage).toBe('none');
  expect(mobile.inputBar.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(mobile.canvas).toBe('rgb(255, 255, 255)');

  // Header controls are borderless glyphs on the page. The drawer toggle is
  // the reference's quiet secondary grey (#8f8f8f on the #fcfcfc canvas), an
  // icon, so it is held to WCAG 1.4.11's 3:1 non-text contrast.
  const canvas = parseRgb(mobile.canvas);
  const openFg = parseRgb(mobile.openBtn.color);
  expect(contrast(openFg, canvas)).toBeGreaterThanOrEqual(3);

  // …and the icon-only actions are dark on the page.
  expect(contrast(parseRgb(mobile.findBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(parseRgb(mobile.shareBtn.color), canvas)).toBeGreaterThanOrEqual(4.5);
});
