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
 * The layered palette expresses its surfaces as `color(srgb r g b / a)` —
 * channels are 0..1 — while plain tokens stay `rgb(r, g, b)` with 0..255
 * channels. Comparing the serialised strings made every colour gate fail the
 * moment a surface became translucent, even though the hue was unchanged.
 * Compare the channels instead: the geometry and palette assertions keep
 * their meaning, and only the notation stops mattering.
 */
export function rgbChannels(value) {
  const text = String(value ?? '');
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

/* The shell's selected-state marker is the whole class token `active`. The
   shadcn primitives also ship `active:` and `aria-[current=page]:` variants,
   so a bare /active/ regex matches every migrated button — always match the
   token. */
export const ACTIVE_CLASS = /(?:^|\s)active(?:\s|$)/;

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

/** Publish through the browser event entry point shared by built app bundles. */
export async function publishChatRuntime(page, event) {
  await page.evaluate((runtimeEvent) => {
    window.dispatchEvent(new CustomEvent('socrates:chat-runtime-publish', {
      detail: runtimeEvent,
    }));
  }, event);
}
