#!/usr/bin/env node
/* Visual-state capture harness for the Expo web export.
 *
 * Serves mobile/dist-visual, intercepts every /api/v2/* call with fixtures
 * from ./fixtures, seeds auth tokens into localStorage, and captures a fixed
 * matrix of UI states as PNGs under ./out.
 *
 * Fails loudly (exit 1) if any state misses its anchor or a page logs a
 * console error — a silently blank screenshot is worse than none.
 *
 * Composer draft note: RNW's controlled TextInput does not pick up
 * synthetic keystrokes reliably in this build, so draft text for the
 * composer-focused state is set through the native value setter + input
 * event, which React treats as a real edit.
 *
 * Playwright is resolved from the repo's existing frontend/ install.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = resolve(HERE, '..', '..');
const REPO = resolve(MOBILE, '..');
const DIST = resolve(MOBILE, 'dist-visual');
const OUT = resolve(HERE, 'out');
const FIXTURES = resolve(HERE, 'fixtures');
const PORT = Number(process.env.VISUAL_PORT || 8787);
const BASE = `http://127.0.0.1:${PORT}`;

const require = createRequire(resolve(REPO, 'frontend', 'package.json'));
const { chromium } = require('playwright');

const fixture = async (name) => JSON.parse(await readFile(resolve(FIXTURES, name), 'utf8'));

/* localStorage keys — see src/data/api/tokenStore.ts + ThemeProvider. */
const AUTH_SEED = {
  'socrates.mobile.access-token': 'visual-harness-access-token',
  'socrates.mobile.refresh-token': 'visual-harness-refresh-token',
  'socrates.mobile.access-expiry': '2099-01-01T00:00:00.000Z',
  'socrates.mobile.refresh-expiry': '2099-01-01T00:00:00.000Z',
  'socrates.mobile.cached-user': null, // filled from fixtures/me.json
  'socrates.mobile.device-id': 'visual-harness-device',
};

/* Console noise that is expected in a production export and does not
 * indicate a broken render. */
const CONSOLE_ALLOW = [
  /Download the React DevTools/i,
  /viewport-fit=cover/i,
  /Permissions-Policy/i,
  /prop.*deprecated/i,
  /useNativeDriver/i,
];

async function installMocks(page) {
  const me = await fixture('me.json');
  const config = await fixture('config.json');
  const providers = await fixture('providers.json');
  const connectors = await fixture('connectors.json');
  const memories = await fixture('memories.json');
  const projects = await fixture('projects.json');
  const sessionList = await fixture('sessions.json');
  const chat = await fixture('session-chat.json');
  const stream = await fixture('session-stream.json');
  const details = { 's-demo-chat': chat, 's-demo-stream': stream };
  const listById = new Map(sessionList.sessions.map((s) => [s.id, s]));

  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  // API mock — everything under /api/v2.
  await page.route('**/api/v2/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v2/, '') || '/';
    const method = request.method();
    const authed = Boolean(request.headers()['authorization']);

    if (!authed && path !== '/auth/mobile/login' && method === 'GET') {
      return json(route, { message: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    if (path === '/auth/me' && method === 'GET') return json(route, me);
    if (path === '/config' && method === 'GET') return json(route, config);
    if (path === '/api-key' && method === 'GET') return json(route, providers);
    if (path === '/project-connectors' && method === 'GET') return json(route, connectors);
    if (path.startsWith('/memory') && method === 'GET') return json(route, memories);
    if (path === '/projects' && method === 'GET') return json(route, projects);
    if (path === '/sessions' && method === 'GET') {
      // Re-base _ageMinutes so the drawer's relative-time groups stay fresh.
      const sessions = sessionList.sessions.map(({ _ageMinutes, ...s }) => ({
        ...s,
        updatedAt: new Date(Date.now() - (_ageMinutes ?? 0) * 60000).toISOString(),
      }));
      return json(route, { sessions, nextCursor: null });
    }
    if (path === '/sessions' && method === 'POST') {
      // Echo the upsert so finishStream merges real fields back.
      try { return json(route, JSON.parse(request.postData() || '{}')); }
      catch { return json(route, {}); }
    }
    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const id = decodeURIComponent(sessionMatch[1]);
      if (details[id]) return json(route, details[id]);
      const listed = listById.get(id);
      if (listed) {
        const { _ageMinutes, ...rest } = listed;
        return json(route, { ...rest, updatedAt: new Date(Date.now() - (_ageMinutes ?? 0) * 60000).toISOString(), messages: [] });
      }
      return json(route, { message: 'Not found', code: 'NOT_FOUND' }, 404);
    }
    if (path === '/files' && method === 'POST') {
      return json(route, { id: 'file-1', name: 'q3-roadmap-notes.md', mimeType: 'text/markdown', size: 341, kind: 'document' });
    }
    if (path === '/files/file-1/content' && method === 'GET') {
      return json(route, {
        ok: true, id: 'file-1', name: 'q3-roadmap-notes.md', mimeType: 'text/markdown', kind: 'text',
        text: '# Q3 Launch — working notes\n\n- Pricing page rewrite due 2026-05-15', truncated: false,
      });
    }
    if (path === '/scheduled-tasks' && method === 'GET') return json(route, { tasks: [] });
    // Catch-all: succeed with an empty payload rather than hang or 404 —
    // bootstrap treats Promise.allSettled failures as offline.
    return json(route, {});
  });
}

async function newPage(browser, { width, height, dsf, signedIn = true, theme = 'dark' }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    colorScheme: theme,
    /* The app's i18n provider defaults to the device locale, so pin en-US —
     * the drivers below look up English placeholders/labels and would time
     * out on a non-English host. */
    locale: 'en-US',
  });
  const errors = [];
  const me = signedIn ? await fixture('me.json') : null;
  await context.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) {
      if (value != null) window.localStorage.setItem(key, value);
    }
  }, {
    ...(signedIn ? { ...AUTH_SEED, 'socrates.mobile.cached-user': JSON.stringify(me.user) } : {}),
    'socrates.theme.preference': theme,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !CONSOLE_ALLOW.some((re) => re.test(msg.text()))) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  await installMocks(page);
  return { context, page, errors };
}

/* ---------- shared drivers ---------- */

const COMPOSER = 'What can I help with today?';

async function gotoApp(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
}

async function openDrawerIfPhone(page, isPhone) {
  if (!isPhone) return; // wide viewport: drawer is permanently mounted
  await page.getByLabel('Open navigation').click();
  await page.getByLabel('Close navigation').first().waitFor({ timeout: 10000 });
}

async function openChatSession(page, isPhone, title, anchorText) {
  await openDrawerIfPhone(page, isPhone);
  await page.getByText(title, { exact: false }).first().click();
  await page.getByText(anchorText, { exact: false }).first().waitFor({ timeout: 10000 });
}

/* Set a controlled RNW input's value through the native setter so React's
 * value tracker sees a real edit (synthetic typing is not reliable here). */
async function setDraftText(input, text) {
  await input.click();
  await input.evaluate((el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}

/* Click the first candidate that actually has a box on screen — blurred
 * screens stay mounted with display:none, so duplicates exist but are
 * unclickable. */
async function clickVisible(locator, timeout = 10000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const candidates = await locator.all();
    for (const candidate of candidates) {
      if (await candidate.boundingBox()) {
        await candidate.click();
        return;
      }
    }
    if (Date.now() > deadline) throw new Error('clickVisible: no visible candidate');
    await new Promise((r) => setTimeout(r, 150));
  }
}

/* ---------- state definitions ---------- */

const STATES = [
  {
    name: '01-auth',
    signedIn: false,
    allowConsole: [/Failed to load resource.*401/],
    async run(page) {
      await gotoApp(page);
      await page.locator('[data-testid="auth-sign-in-button"]').waitFor({ timeout: 15000 });
    },
  },
  {
    name: '02-home',
    light: true,
    async run(page) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
    },
  },
  {
    name: '03-home-drawer',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openDrawerIfPhone(page, isPhone);
      await page.getByText('Vendor comparison: vector DBs').waitFor({ timeout: 10000 });
      await page.waitForTimeout(450); // let the slide animation finish
    },
  },
  {
    name: '04-chat',
    light: true,
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      await page.getByText('Want me to draft the full page copy').waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
    },
  },
  {
    name: '05-chat-stream',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Weekly metrics digest', 'first project created');
      await page.getByText('Thinking…').waitFor({ timeout: 10000 });
    },
  },
  {
    name: '06-composer-focused',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      const input = page.getByPlaceholder(COMPOSER).last();
      await setDraftText(input, 'Yes — draft the full page.\nKeep the tone confident but not salesy.');
      await page.getByText('Keep the tone confident but not salesy.').last().waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
    },
  },
  {
    name: '07-composer-attachment',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      await page.getByLabel('Attach files').last().click();
      await page.locator('[data-testid="composer-tools-menu"]').waitFor({ timeout: 10000 });
      const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
      await page.getByLabel('Files', { exact: true }).click();
      await (await chooser).setFiles(resolve(FIXTURES, 'q3-roadmap-notes.md'));
      await page.getByText('q3-roadmap-notes.md').filter({ visible: true }).first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
    },
  },
  {
    name: '08-tools-menu',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      await page.getByLabel('Attach files').last().click();
      await page.locator('[data-testid="composer-tools-menu"]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
    },
  },
  {
    name: '09-model-picker',
    /* Wide: AppHeader model chip → anchored ModelPickerModal. Phone: the
     * composer's expanded "model effort" text trigger → ModelConfigSheet
     * bottom sheet (the trigger only exists once the composer expands). */
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      if (isPhone) {
        await page.getByPlaceholder(COMPOSER).last().click();
        await page.getByLabel('Beagle Medium').click();
        await page.locator('[data-testid="model-config-sheet"]').waitFor({ timeout: 10000 });
      } else {
        await clickVisible(page.getByLabel('Beagle'));
        await page.locator('[data-testid="model-picker"]').waitFor({ timeout: 10000 });
      }
      await page.waitForTimeout(300);
    },
  },
  {
    name: '10-settings',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openDrawerIfPhone(page, isPhone);
      await page.getByLabel('Settings', { exact: true }).click();
      await page.getByText('Model providers').waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
    },
  },
  {
    name: '11-profile',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openDrawerIfPhone(page, isPhone);
      await page.getByLabel('Account', { exact: true }).click();
      await page.locator('[data-testid="profile-overlay"]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
    },
  },
  {
    name: '12-msg-actions',
    async run(page, { isPhone }) {
      await gotoApp(page);
      await page.getByPlaceholder(COMPOSER).waitFor({ timeout: 15000 });
      await openChatSession(page, isPhone, 'Pricing page rewrite', 'Recommended structure');
      const helpful = page.getByLabel('Helpful').last();
      await helpful.scrollIntoViewIfNeeded();
      await helpful.waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
    },
  },
];

const VIEWPORTS = [
  { tag: 'phone', width: 390, height: 844, dsf: 2, isPhone: true },
  { tag: 'wide', width: 1280, height: 800, dsf: 1, isPhone: false },
];

/* ---------- runner ---------- */

async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return null;
  } catch { /* not running */ }
  const proc = spawn(process.execPath, [resolve(HERE, 'serve.mjs')], {
    env: { ...process.env, VISUAL_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[serve] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[serve] ${d}`));
  const deadline = Date.now() + 8000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/index.html`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) break;
    } catch { /* retry */ }
    if (Date.now() > deadline) throw new Error('static server did not come up on ' + BASE);
    await new Promise((r) => setTimeout(r, 200));
  }
  return proc;
}

async function main() {
  if (!existsSync(resolve(DIST, 'index.html'))) {
    console.error(`dist-visual/index.html missing — run \`npm run visual:build\` first (expected ${DIST})`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const serverProc = await ensureServer();
  const only = process.argv[2] ? process.argv[2].split(',') : null;

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const state of STATES) {
      if (only && !only.some((o) => state.name.startsWith(o))) continue;
      for (const vp of VIEWPORTS) {
        if (vp.isPhone && state.skipPhone) {
          results.push({ name: `${state.name} [phone]`, status: 'SKIP', errors: [state.skipPhone], file: null });
          console.log(`SKIP  ${state.name} [phone] — ${state.skipPhone}`);
          continue;
        }
        const variants = [{ tag: vp.tag, theme: 'dark' }];
        if (state.light) variants.push({ tag: `${vp.tag}-light`, theme: 'light' });
        for (const variant of variants) {
          const file = resolve(OUT, `${state.name}-${variant.tag}.png`);
          const { context, page, errors } = await newPage(browser, {
            width: vp.width, height: vp.height, dsf: vp.dsf,
            signedIn: state.signedIn !== false, theme: variant.theme,
          });
          let status = 'PASS';
          try {
            await state.run(page, { isPhone: vp.isPhone });
            const real = errors.filter((e) => !(state.allowConsole || []).some((re) => re.test(e)));
            errors.length = 0; errors.push(...real);
            if (errors.length) status = 'FAIL';
            else await page.screenshot({ path: file });
          } catch (error) {
            status = 'FAIL';
            errors.push(error.message.split('\n')[0]);
            try { await page.screenshot({ path: file }); } catch { /* ignore */ }
          }
          results.push({ name: `${state.name} [${variant.tag}]`, status, errors, file });
          console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${state.name} [${variant.tag}]${errors.length ? ' — ' + errors.join(' | ') : ''}`);
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    if (serverProc) serverProc.kill();
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  // SKIP counts as neither pass nor fail in the denominator summary line.
  console.log(`\n${results.length - failed.length}/${results.length} states passed → ${OUT}`);
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
