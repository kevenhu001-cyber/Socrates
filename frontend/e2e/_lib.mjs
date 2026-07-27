// e2e/_lib.mjs — shared helpers for spec files.
//
// gotoAndSettle: replaces the default `page.goto('/')` (which hangs on
// third-party CDN scripts that the sandbox can't reach). Loads with
// waitUntil:'commit' (HTTP committed) and then polls until the bundle
// has registered enough globals to be testable.
import { test as base } from '@playwright/test';

export const test = base;

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
  const timeout = opts.timeout || 90000;
  try {
    await page.goto(url, { waitUntil: 'commit', timeout });
  } catch (_) {
    await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
  }
  // Wait for at least 25% of the required bindings to be functions.
  // The bindings list comes from this module — same import in the page
  // might not be reachable, so we hard-code a short suffix here.
  const probe = ['setLang', 't', 'openSettings', 'showConfirm', 'openCmdK', 'openProfile', 'resetApp', 'toggleAppMode', 'signOut'];
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(800);
    const ok = await page.evaluate((req) => {
      return req.filter(k => typeof window[k] === 'function').length >= req.length;
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
    try { window.setLang && window.setLang(l); } catch (_) {}
  }, lang);
  await page.waitForTimeout(300);
}
