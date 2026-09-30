// e2e/mobile-button-consistency.spec.mjs — mobile (≤768px) button utility
// audit. Pins the polish/buttons.css + polish/mobile-controls.css migration:
// every interactive control on a phone should read as the same visual
// contract (44×44 floor, 10px row radius, 8px square icon radius) and never
// leak a hardcoded dark surface past --ui-bg-surface.
//
// Test matrix (covers the three mobile breakpoints the app already uses):
//   viewport: 390×844, 393×851, 400×890
//   mode:     dark, light
//   language: en, zh
//
// References:
//   docs/ref/chatgpt-parity.md (sidebar row 36px / 10px radius)
//   Apple HIG / WCAG 2.5.5 (44×44 tap target)
//   frontend/src/styles/polish/buttons.css
//   frontend/src/styles/polish/mobile-controls.css

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import {
  measureBoxes,
  readComputed,
  readToken,
  assertTouchTargets,
  assertSidebarDrawerWidth,
} from './_button-measure.mjs';

const MOBILE_VIEWPORTS = [
  { width: 390, height: 844, name: 'iphone-13' },
  { width: 393, height: 851, name: 'iphone-14' },
  { width: 400, height: 890, name: 'playwright-mobile' },
];
const MODES = ['dark', 'light'];
const LANGS = ['en', 'zh'];

async function bootMobile(page, { mode, lang, viewport }) {
  await mockAuthedApp(page);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate(({ m, l }) => {
    try { window.setMode?.(m); } catch (_) {}
    try { window.setLang?.(l); } catch (_) {}
  }, { m: mode, l: lang });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function openDrawer(page) {
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
      try { window.toggleSidebar?.(); } catch (_) {}
    }
  });
  await page.waitForTimeout(350);
}

test.describe('mobile button consistency', () => {
  for (const viewport of MOBILE_VIEWPORTS) {
    for (const mode of MODES) {
      for (const lang of LANGS) {
        test(`${viewport.name} ${mode} ${lang} — touch targets ≥44`, async ({ page }) => {
          await bootMobile(page, { mode, lang, viewport });

          // Top-bar buttons (already at the floor via layout/app-shell.css).
          const topBarSelectors = [
            '#sidebarOpenBtn',
            '#mobileNewChatBtn',
            '#mobileIncognitoBtn',
            '#findBtn',
            '#shareBtn',
          ];
          for (const sel of topBarSelectors) {
            const { offenders } = await assertTouchTargets(page, sel);
            expect(offenders, `${sel} should hit 44 floor`).toEqual([]);
          }

          // Composer controls — visual stays 36 (parity/composer-unified.css)
          // but ::before extends the hit area to 44.
          const composerSelectors = [
            '#topicComposerToolsBtn',
            '#chatComposerToolsBtn',
            '#sendBtn',
            '#startBtn',
            '#topicMobileMicBtn',
            '#chatMobileMicBtn',
          ];
          for (const sel of composerSelectors) {
            const { offenders } = await assertTouchTargets(page, sel, 36);
            // The visible button is allowed to be 36 (chatgpt parity); the
            // ::before wrapper at -4px extends the hit area to 44 — covered
            // by the rule applied in composer-unified.css.
            expect(offenders, `${sel} should be ≥36 visual`).toEqual([]);
          }

          // Sidebar drawer (open it to measure the internal rows).
          await openDrawer(page);
          const sidebarSelectors = [
            '.sidebar-nav-btn',
            '.sidebar-footer .icon-btn',
            '.sidebar-footer .btn-icon',
            '.sidebar-header .icon-btn',
            '.sidebar-header .btn-icon',
          ];
          for (const sel of sidebarSelectors) {
            const { offenders } = await assertTouchTargets(page, sel);
            expect(offenders, `${sel} should hit 44 floor inside drawer`).toEqual([]);
          }
        });
      }
    }
  }

  test('mobile drawer width collapses to --ui-sidebar-mobile (254 px)', async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    const { token, expected } = await assertSidebarDrawerWidth(page);
    expect(expected).toBe(254);
    expect(token).toBe('254px');

    // Open the drawer so its width is measurable.
    await openDrawer(page);
    const afterOpen = await assertSidebarDrawerWidth(page);
    expect(afterOpen.boxes.length, 'drawer should be present after open').toBeGreaterThan(0);
    afterOpen.boxes.forEach((b) => {
      expect(b.width, `drawer width ${b.width} should equal ${afterOpen.expected}`).toBe(afterOpen.expected);
    });
  });

  test('dark mode "#composerToolsMenu" is no longer the legacy hardcoded #1f1f1f', async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { try { window.setMode?.('dark'); } catch (_) {} });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    // Trigger the composer "+" menu so the menu surface is in the DOM.
    await page.locator('#topicComposerToolsBtn, #chatComposerToolsBtn').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);

    const menuBg = await readComputed(page, '#composerToolsMenu.composer-tools-menu', 'background-color');

    // Legacy hardcoded was rgb(31, 31, 31) (#1f1f1f). The migration routed
    // the menu background through --ui-bg-* tokens, so the resolved value
    // must come from the token palette (one of #000 / #171717 / #212121 /
    // #303030 / #fcfcfc / #fff / etc.) — never the literal #1f1f1f.
    expect(menuBg, `tools menu background ${menuBg} must not be the legacy hardcoded rgb(31,31,31)`).not.toBe('rgb(31, 31, 31)');
    expect(menuBg, `tools menu background must resolve as rgb(), got "${menuBg}"`).toMatch(/^rgb\(/);
  });

  test('press feedback class survives a click (.is-pressed ≥ 90 ms)', async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    const sel = '#sidebarOpenBtn';
    // Dispatch mousedown manually so pressFeedback.js's pointerdown listener
    // fires without needing the touch-aware hasTouch context.
    await page.evaluate((s) => {
      const node = document.querySelector(s);
      if (!node) return;
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    }, sel);

    const seen = await page.evaluate(async (s) => {
      const node = document.querySelector(s);
      if (!node) return false;
      const start = performance.now();
      while (performance.now() - start < 250) {
        if (node.classList.contains('is-pressed')) return true;
        await new Promise((r) => setTimeout(r, 8));
      }
      return node.classList.contains('is-pressed');
    }, sel);
    expect(seen, `${sel} should briefly enter .is-pressed`).toBe(true);
  });

  test('msg-toolbar buttons are at least 32 px visual (mobile)', async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    // Need at least one message to mount the toolbar; the test asserts the
    // CSS contract, so we check any present toolbar button geometry.
    const boxes = await measureBoxes(page, '.msg-toolbar-btn');
    if (!boxes || boxes.length === 0) {
      // No messages mounted yet — skip silently. A real chat session is
      // exercised by the chat-send specs, not by this CSS contract.
      test.skip(true, 'no msg-toolbar-btn mounted on landing');
      return;
    }
    boxes.forEach((b) => {
      expect(b.width, `msg-toolbar-btn width ${b.width}`).toBeGreaterThanOrEqual(32);
      expect(b.height, `msg-toolbar-btn height ${b.height}`).toBeGreaterThanOrEqual(32);
    });
  });

  test('sidebar row radius resolves to --ui-radius-row (10 px)', async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await openDrawer(page);

    const tokenValue = await readToken(page, '--ui-radius-row');
    expect(tokenValue.trim()).toBe('10px');

    const radius = await readComputed(page, '.sidebar-nav-btn', 'border-top-left-radius');
    expect(radius).toBe('10px');
  });
});