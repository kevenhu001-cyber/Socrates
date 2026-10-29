// e2e/_lib.mjs — shared helpers for spec files.
//
// gotoAndSettle: replaces the default `page.goto('/')` (which hangs on
// third-party CDN scripts that the sandbox can't reach). Loads with
// waitUntil:'commit' (HTTP committed) and then polls until the bundle
// has registered enough globals to be testable.
import { test as base } from '@playwright/test';

export const test = base;

/**
 * Resolved 8-bit RGB channels of a computed colour value.
 *
 * Computed colors may be serialized as rgb(), color(srgb …), or OKLCH. Keep
 * visual assertions independent of that notation by resolving each form to
 * 8-bit sRGB channels.
 */
export function rgbChannels(value) {
  const text = String(value ?? '');
  const oklch = text.match(/oklch\(\s*([+-]?(?:\d*\.)?\d+%?)\s+([+-]?(?:\d*\.)?\d+)\s+([+-]?(?:\d*\.)?\d+)(deg|rad|turn)?/i);
  if (oklch) {
    const lightness = oklch[1].endsWith('%')
      ? Number.parseFloat(oklch[1]) / 100
      : Number.parseFloat(oklch[1]);
    const chroma = Number.parseFloat(oklch[2]);
    let hue = Number.parseFloat(oklch[3]);
    if (oklch[4] === 'rad') hue = (hue * 180) / Math.PI;
    else if (oklch[4] === 'turn') hue *= 360;
    const radians = (hue * Math.PI) / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;
    const linear = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return linear.map((channel) => {
      const clamped = Math.min(1, Math.max(0, channel));
      const srgb = clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * (clamped ** (1 / 2.4)) - 0.055;
      return Math.round(srgb * 255);
    });
  }
  const numbers = (text.match(/[\d.]+/g) ?? []).map(Number);
  if (numbers.length < 3) return null;
  const scale = text.includes('srgb') ? 255 : 1;
  return numbers.slice(0, 3).map((channel) => Math.round(channel * scale));
}

/** True when two computed colours resolve to the same RGB channels. */
export function sameRgb(left, right) {
  const a = rgbChannels(left);
  const b = rgbChannels(right);
  return a !== null && b !== null && a.every((channel, index) => channel === b[index]);
}

export const REQUIRED_BINDINGS = [
  'setLang', 't', 'setRecentsSearch', 'setRecentsFilter', 'clearRecentsFilter',
  'openSettings', 'closeSettings', 'openUsageModal', 'closeUsageModal',
  'openCmdK', 'closeCmdK', 'openCheatsheet', 'showConfirm', 'showToast',
  'toggleAppMode', 'toggleSidebar', 'signOut', 'openProfile', 'closeProfile',
  'openShareModal', 'closeShareModal', 'resetApp', 'toggleIncognito',
  'showUsageTip', 'hideUsageTip', 'updateModeBadge', 'syncEffortUI',
  'closeTagEditor', 'clearActiveTemplate', 'onSlashRowClick',
  'selectDiag', 'prevDiagQuestion', 'nextDiagQuestion', 'skipDiagQuestion',
  'finishDiagnostic', 'proceedToTeaching', 'moveSessionToProject',
];

export async function gotoAndSettle(page, url = '/', opts = {}) {
  // Default to an already-made consent choice so the banner never
  // intercepts existing smoke tests. Pass { consent: false } for a spec
  // that deliberately exercises the first-visit banner.
  if (opts.consent !== false) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('socrates-cookie-consent', JSON.stringify({
          v: 1,
          choice: 'accept',
          nonEssential: true,
          updatedAt: new Date().toISOString(),
        }));
      } catch (_) {}
    });
  }

  const timeout = opts.timeout || 90000;
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch (_) {
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
  }
  // Wait for at least 25% of the probe bindings to be functions. Full boot
  // readiness is asserted separately by waitForAppShell or by each spec's
  // first visible interaction; waiting for every optional global here used
  // to burn the full 48-second budget if one migration shim was omitted.
  // The bindings list comes from this module — same import in the page
  // might not be reachable, so we hard-code a short suffix here.
  const probe = ['setLang', 't', 'openSettings', 'showConfirm', 'openCmdK', 'openProfile', 'resetApp', 'toggleAppMode', 'signOut'];
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(800);
    const ok = await page.evaluate((req) => {
      return req.filter(k => typeof window[k] === 'function').length >= Math.ceil(req.length * 0.25);
    }, probe);
    if (ok) return;
  }
}

export async function login(page, { email = 'qa-tester@example.com', password = 'QaTest12345!' } = {}) {
  // Hide auth gate if still visible (e.g. previous session leaked a token but page.reload cleared)
  const visible = await page.locator('#authGate').isVisible().catch(() => false);
  if (!visible) return;
  await page.fill('#authSigninEmail', email);
  await page.fill('#authSigninPassword', password);
  await page.locator('#authSigninBtn').click({ force: true, noWaitAfter: true });
  // Wait for gate to hide
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const v = await page.locator('#authGate').isVisible().catch(() => false);
    if (!v) break;
  }
  // Also wait for bindings to appear
  await page.waitForTimeout(800);
}

export async function setLang(page, lang) {
  await page.evaluate((l) => {
    try { window.setLang?.(l); } catch (_) {}
  }, lang);
  await page.waitForTimeout(300);
}
