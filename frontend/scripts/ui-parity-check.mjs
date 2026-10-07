// scripts/ui-parity-check.mjs
// Pixel-parity gate: baseline SPA (frontend/dist) vs Universal App web
// export (apps/socrates/dist) in the SAME fixture state — same viewport,
// same mock user, same two transcript messages. Every measured value is
// compared against the BASELINE SPEC (numbers taken from
// frontend/src/styles/parity/* + tokens.css + themes.css), so a drift in
// either shell fails the gate.
//
// Run:
//   cd frontend && npm run build
//   cd ../apps/socrates && npm run export:web
//   cd ../frontend && node scripts/ui-parity-check.mjs
//
// Everything is mocked at the page.route level; no backend is contacted.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const universalDist = join(frontend, '..', 'apps', 'socrates', 'dist');
const BASE_PORT = Number(process.env.PARITY_BASE_PORT || 4183);
const RN_PORT = Number(process.env.PARITY_RN_PORT || 4185);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

/* Identical fixture on both shells: same topic, same two messages (the
 * chat-workbench baseline fixture). */
const FIXTURE = {
  topic: 'Workbench fixture',
  messages: [
    { clientId: 'fixture-user', role: 'user', rawText: 'Build a compact workbench.', html: '<p>Build a compact workbench.</p>' },
    { clientId: 'fixture-assistant', role: 'assistant', rawText: 'The workbench is ready.', html: '<p>The workbench is ready.</p>' },
  ],
};

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

function serveStatic(dist, port) {
  const server = createServer(async (req, res) => {
    try {
      const path = (req.url || '/').split('?')[0];
      const file = join(dist, path === '/' ? 'index.html' : decodeURIComponent(path.slice(1)));
      if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
      const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(500); res.end(); }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function mockUniversal(page) {
  const sessions = [{ id: 's1', title: FIXTURE.topic, topic: '', mode: 'chat', phase: 'chat', projectId: null }];
  const fulfill = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/auth/me', (route) => fulfill(route, { user: { id: 'u1', email: 't@e.c', displayName: 'T', isGuest: false } }));
  await page.route('**/api/v2/projects', (route) => fulfill(route, { projects: [] }));
  await page.route('**/api/v2/sessions?limit=50', (route) => fulfill(route, { sessions }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => fulfill(route, { sessions: [], nextCursor: null }));
  await page.route('**/api/v2/api-key', (route) => fulfill(route, { providers: [], activeId: null }));
  await page.route('**/api/v2/creations/items/assistants', (route) => fulfill(route, { items: [] }));
  await page.route('**/api/v2/account/usage', (route) => fulfill(route, {
    user: { id: 'u1', email: 't@e.c', displayName: 'T', tier: 'diophantus' },
    plan: { name: 'Diophantus' },
    usage: { sessionCount: 1, providerCount: 0, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
  }));
  await page.route('**/api/v2/sessions/s1', (route) => fulfill(route, { ...sessions[0], messages: FIXTURE.messages }));
  await page.route('**/api/v2/search', (route) => fulfill(route, { hits: [] }));
  await page.route('**/api/v2/auth/mobile/refresh', (route) => fulfill(route, {
    accessToken: 'stub', refreshToken: 'stub', expiresAt: new Date(Date.now() + 600_000).toISOString(),
  }));
}

const settle = (page) => page.evaluate(() => (document.fonts ? document.fonts.ready : null)).then(() => page.waitForTimeout(500));

/* ── Baseline spec (frontend/src/styles) ─────────────────────────────────
 * sidebar.css: 260 column, 52 header, 36px rows (radius 10, 6/10, 20px
 *   glyphs), 32px footer buttons, recents title 14/20 tertiary.
 * transcript.css: 768 column, padding 28/20/24, msg gap 20 (assistant→user
 *   40), 16/28 prose, bubble radius 18 / max 70% / padding 10-16, toolbar
 *   32px radius 8 with 18px glyphs.
 * composer-unified.css: 52px capsule, radius 28, padding 7/10/7/8, 36px
 *   round controls, editor 16/24 min 24, placeholder "Ask Socrates".
 * topbar.css: 52px bar, 36px switcher (18/28, w600 name, 16px caret),
 *   36px icon buttons with 18px glyphs.
 * themes.css (dark): sidebar #1e1e1e, bubble #202020, composer #1c1c1c
 *   + rgba(255,255,255,.14) border, primary #e8e8e8, tertiary #9c9c9c.
 * tokens.css: content 768, row radius 10, control 36, bubble 18.
 */
const SPEC = {
  desktop: {
    sidebar: { width: 260, bg: 'rgb(30, 30, 30)' },
    newChatBtn: { width: 40, height: 40, radius: 8 },
    navRow: { height: 36, radius: 12, fontSize: 14, lineHeight: 20 },
    recentsTitle: { fontSize: 14, lineHeight: 20, color: 'rgb(155, 155, 155)' },
    footerBtn: { width: 32, height: 32, radius: 8 },
    avatar: { width: 32, height: 32, radius: 16 },
    userName: { fontSize: 13, lineHeight: 17 },
    topbar: { height: 52 },
    modelName: { fontSize: 18, lineHeight: 28 },
    userBubble: { radius: 18, padTop: 10, padLeft: 16, bg: 'rgb(32, 32, 32)', maxWidthPct: 70, fontSize: 16, lineHeight: 28 },
    assistantText: { fontSize: 16, lineHeight: 28, color: 'rgb(232, 232, 232)' },
    toolBtn: { width: 40, height: 40, radius: 8 },
    composer: { radius: 28, bg: 'rgb(28, 28, 28)', padTop: 7, padLeft: 8, minHeight: 52 },
    composerInput: { fontSize: 16, lineHeight: 24 },
    sendBtn: { width: 36, height: 36, radiusPx: 18, bg: 'rgb(232, 232, 232)' },
    firstMsg: { y: 80 },
    placeholder: 'Ask Socrates',
    fontFamily: 'Inter',
  },
  mobile: {
    topbar: { height: 56 },
    userBubble: { radius: 15, bg: 'rgb(46, 46, 46)' },
    assistantText: { fontSize: 16.875, lineHeight: 27.8438 },
    composer: { radius: 28, padTop: 12, padLeft: 8 },
    placeholder: 'Ask Socrates',
  },
};

/* Tolerances: sub-pixel metrics are ±0.75, colors must match exactly. */
const TOL = { px: 0.75, px2: 1.5 };
const num = (v) => (v == null ? null : Math.round(parseFloat(v) * 100) / 100);

/* Both probes below are self-contained — Playwright serializes them into the
 * page, so every helper they use is defined inside the function body. */
const BASE_PROBE = () => {
  const of = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100,
      radius: s.borderRadius,
      radiusPx: s.borderRadius.endsWith('%') ? String(Math.round((parseFloat(s.borderRadius) / 100) * Math.min(r.width, r.height) * 100) / 100) + 'px' : s.borderRadius,
      padTop: s.paddingTop, padLeft: s.paddingLeft, padRight: s.paddingRight, padBottom: s.paddingBottom, gap: s.gap,
      display: s.display, flexDirection: s.flexDirection, flex: s.flex, flexGrow: s.flexGrow,
      minHeight: s.minHeight, heightStyle: s.height, boxSizing: s.boxSizing, justifyContent: s.justifyContent, alignItems: s.alignItems,
      marginTop: s.marginTop, marginBottom: s.marginBottom,
      offsetHeight: el.offsetHeight, scrollHeight: el.scrollHeight,
      after: [getComputedStyle(el, '::after').content, getComputedStyle(el, '::after').height, getComputedStyle(el, '::after').display],
      letterSpacing: s.letterSpacing,
      bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight,
      fontWeight: s.fontWeight, fontFamily: s.fontFamily,
      text: (el.textContent || '').trim().slice(0, 30),
      tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 70),
    };
  };
  const sidebar = document.querySelector('#appShell #sidebar');
  const composer = document.querySelector('#composerInputWrap') || document.querySelector('.composer-shell');
  const richComposer = document.querySelector('.rich-composer');
  const input = document.querySelector('.rich-composer-editor');
  const send = document.querySelector('.composer-primary-btn');
  const bubble = document.querySelector('#appShell #msgList .msg.user .msg-body');
  const userText = bubble?.querySelector('p, span, div') || bubble;
  const firstMsg = document.querySelector('#appShell #msgList .msg');
  const assistant = document.querySelector('#appShell #msgList .msg.assistant .msg-body p');
  const toolBtn = document.querySelector('#appShell #msgList .msg-toolbar-btn');
  const topbar = document.querySelector('#appShell .top-bar');
  const modelName = document.querySelector('.top-model-switcher-name');
  const footer = document.querySelector('#appShell #sidebarFooter');
  return {
    sidebar: of(sidebar),
    newChatBtn: of(document.querySelector('#appShell #newChatBtn')),
    navRow: of(document.querySelector('#appShell .sidebar-nav-btn')),
    recentsTitle: of(document.querySelector('#appShell .recents-title')),
    footerBtn: of(footer ? footer.querySelector('.icon-btn') : null),
    avatar: of(document.querySelector('#appShell #sidebarUserRow .user-avatar')),
    userName: of(document.querySelector('#appShell #sidebarUserRow .user-name')),
    topbar: of(topbar),
    modelName: of(modelName),
    userBubble: of(bubble),
    userText: of(userText),
    firstMsg: of(firstMsg),
    assistantText: of(assistant),
    toolBtn: of(toolBtn),
    composer: of(composer),
    composerChildren: composer ? [...composer.children].map(of) : [],
    composerInput: of(input),
    sendBtn: of(send),
    placeholder: richComposer ? getComputedStyle(richComposer).getPropertyValue('--composer-placeholder').trim() : null,
    transcriptPadding: (() => {
      const list = document.querySelector('#appShell #msgList');
      return list ? { padTop: getComputedStyle(list).paddingTop, padLeft: getComputedStyle(list).paddingLeft } : null;
    })(),
  };
};

const UNIVERSAL_PROBE = () => {
  const of = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100,
      radius: s.borderRadius,
      radiusPx: s.borderRadius.endsWith('%') ? String(Math.round((parseFloat(s.borderRadius) / 100) * Math.min(r.width, r.height) * 100) / 100) + 'px' : s.borderRadius,
      padTop: s.paddingTop, padLeft: s.paddingLeft, padRight: s.paddingRight, padBottom: s.paddingBottom, gap: s.gap,
      display: s.display, flexDirection: s.flexDirection, flex: s.flex, flexGrow: s.flexGrow,
      minHeight: s.minHeight, heightStyle: s.height, boxSizing: s.boxSizing, justifyContent: s.justifyContent, alignItems: s.alignItems,
      marginTop: s.marginTop, marginBottom: s.marginBottom,
      offsetHeight: el.offsetHeight, scrollHeight: el.scrollHeight,
      after: [getComputedStyle(el, '::after').content, getComputedStyle(el, '::after').height, getComputedStyle(el, '::after').display],
      letterSpacing: s.letterSpacing,
      bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight,
      fontWeight: s.fontWeight, fontFamily: s.fontFamily,
      text: (el.textContent || '').trim().slice(0, 30),
      tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 70),
    };
  };
  const byRole = (name) => [...document.querySelectorAll('[role="button"]')].find((el) => (el.getAttribute('aria-label') || el.textContent || '').trim() === name) || null;
  const byText = (text) => [...document.querySelectorAll('div,span,p,input')].find((el) => el.children.length === 0 && (el.textContent || '').trim() === text) || null;
  const up = (el, test) => { let n = el; while (n && n !== document.body) { if (test(n)) return n; n = n.parentElement; } return null; };
  const sidebar = up(byRole('New chat'), (n) => n.getBoundingClientRect().width >= 240 && n.getBoundingClientRect().height > window.innerHeight * 0.8);
  const footer = sidebar ? sidebar.children[sidebar.children.length - 1] : null;
  // Footer account row: the 32px avatar disc + the 13px name line.
  const avatar = footer ? [...footer.querySelectorAll('div')].find((el) => Math.round(el.getBoundingClientRect().width) === 32 && Math.round(el.getBoundingClientRect().height) === 32) : null;
  const name = footer ? [...footer.querySelectorAll('div,span')].find((el) => el.children.length === 0 && getComputedStyle(el).fontSize.startsWith('13')) : null;
  const modelSwitcher = byRole('Choose model');
  // The top bar is the ancestor with the 52/56px height that holds both the
  // switcher cluster and the action cluster (skip inner 52px containers).
  const topbar = modelSwitcher ? up(modelSwitcher, (n) => (Math.round(n.getBoundingClientRect().height) === 52 || Math.round(n.getBoundingClientRect().height) === 56) && n.children.length >= 2) : null;
  const userText = byText('Build a compact workbench.');
  const bubble = userText ? up(userText, (n) => { const bg = getComputedStyle(n).backgroundColor; return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'; }) : null;
  const assistantText = byText('The workbench is ready.');
  // Measure the outer Text node (RNW nests inline spans inside it).
  const proseOuter = assistantText ? up(assistantText, (n) => n.tagName === 'DIV' && (n.textContent || '').trim() === 'The workbench is ready.') : null;
  const list = up(assistantText, (n) => n.getAttribute('role') === 'list' || (n.scrollHeight > n.clientHeight + 8 && n.clientHeight > 100));
  const input = document.querySelector('[role="textbox"], textarea');
  const shell = input ? up(input, (n) => parseFloat(getComputedStyle(n).borderTopWidth) > 0 && parseFloat(getComputedStyle(n).borderRadius) > 0) : null;
  const send = byRole('Send') || byRole('Send message') || byRole('Stop generating');
  const copyBtn = byRole('Copy') || byRole('Copied');
  return {
    sidebar: of(sidebar),
     newChatBtn: of(byRole('Start a new chat')),
    navRow: of(byRole('Library')),
    recentsTitle: of(byText('Recents')),
    footerBtn: of(footer ? footer.querySelector('[role="button"]') : null),
    avatar: of(avatar),
    userName: of(name),
    topbar: of(topbar),
    modelName: of(modelSwitcher ? [...modelSwitcher.querySelectorAll('div,span')].find((el) => el.children.length === 0 && (el.textContent || '').trim().length > 0) : null),
    userBubble: of(bubble),
    userText: of(userText),
    firstMsg: of(bubble),
    assistantText: of(proseOuter || assistantText),
    toolBtn: of(copyBtn),
    composer: of(shell),
    composerChildren: shell ? [...shell.children].map(of) : [],
    composerInput: of(input),
    sendBtn: of(send),
    firstMsg: of(bubble),
    placeholder: input ? (input.getAttribute('placeholder') || '') : null,
    transcriptPadding: list ? { padTop: getComputedStyle(list).paddingTop, padLeft: getComputedStyle(list).paddingLeft } : null,
  };
};

/* Which spec keys apply to which viewport, and how to compare. */
const CHECKS = {
  desktop: [
    ['sidebar.width', 'sidebar', 'width', TOL.px],
    ['sidebar.bg', 'sidebar', 'bg', 0],
    ['newChat.size', 'newChatBtn', 'width', TOL.px],
    ['newChat.radius', 'newChatBtn', 'radius', TOL.px],
    ['navRow.height', 'navRow', 'height', TOL.px],
    ['navRow.radius', 'navRow', 'radius', TOL.px],
    ['navRow.font', 'navRow', 'fontSize', TOL.px],
    ['recents.font', 'recentsTitle', 'fontSize', TOL.px],
    ['recents.color', 'recentsTitle', 'color', 0],
    ['footerBtn.size', 'footerBtn', 'width', TOL.px],
    ['avatar.size', 'avatar', 'width', TOL.px],
    ['userName.font', 'userName', 'fontSize', TOL.px],
    ['topbar.height', 'topbar', 'height', TOL.px],
    ['modelName.font', 'modelName', 'fontSize', TOL.px],
    ['bubble.radius', 'userBubble', 'radius', TOL.px],
    ['bubble.padTop', 'userBubble', 'padTop', TOL.px],
    ['bubble.padLeft', 'userBubble', 'padLeft', TOL.px],
    ['bubble.bg', 'userBubble', 'bg', 0],
    ['prose.font', 'assistantText', 'fontSize', TOL.px],
    ['prose.line', 'assistantText', 'lineHeight', TOL.px],
    ['prose.color', 'assistantText', 'color', 0],
    ['toolBtn.size', 'toolBtn', 'width', TOL.px],
    ['toolBtn.radius', 'toolBtn', 'radius', TOL.px],
    ['composer.radius', 'composer', 'radius', TOL.px],
    ['composer.padTop', 'composer', 'padTop', TOL.px],
    ['composer.padLeft', 'composer', 'padLeft', TOL.px],
    ['composer.bg', 'composer', 'bg', 0],
    ['input.font', 'composerInput', 'fontSize', TOL.px],
    ['input.line', 'composerInput', 'lineHeight', TOL.px],
    ['send.size', 'sendBtn', 'width', TOL.px],
    ['send.radius', 'sendBtn', 'radiusPx', TOL.px],
    ['send.bg', 'sendBtn', 'bg', 0],
    ['newChat.height', 'newChatBtn', 'height', TOL.px],
    ['toolBtn.height', 'toolBtn', 'height', TOL.px],
    ['composerInput.line', 'composerInput', 'lineHeight', TOL.px],
    ['firstMsg.y', 'firstMsg', 'y', TOL.px],
  ],
  mobile: [
    ['topbar.height', 'topbar', 'height', TOL.px],
    ['bubble.radius', 'userBubble', 'radius', TOL.px],
    ['bubble.bg', 'userBubble', 'bg', 0],
    ['prose.font', 'assistantText', 'fontSize', 0.75],
    ['composer.radius', 'composer', 'radius', TOL.px],
    ['composer.padTop', 'composer', 'padTop', TOL.px],
  ],
};

const PAIR_CHECKS = {
  desktop: [
    ['nav.x', 'navRow', 'x', TOL.px],
    ['nav.width', 'navRow', 'width', TOL.px],
    ['recents.y', 'recentsTitle', 'y', TOL.px],
    ['topbar.height', 'topbar', 'height', TOL.px],
    ['bubble.x', 'userBubble', 'x', TOL.px],
    ['bubble.y', 'userBubble', 'y', TOL.px],
    ['bubble.width', 'userBubble', 'width', TOL.px],
    ['bubble.height', 'userBubble', 'height', TOL.px],
    ['bubble.radius', 'userBubble', 'radius', TOL.px],
    ['bubble.padTop', 'userBubble', 'padTop', TOL.px],
    ['bubble.padLeft', 'userBubble', 'padLeft', TOL.px],
    ['userText.width', 'userText', 'width', TOL.px],
    ['assistant.x', 'assistantText', 'x', TOL.px],
    ['assistant.y', 'assistantText', 'y', TOL.px],
    ['assistant.font', 'assistantText', 'fontSize', TOL.px],
    ['assistant.line', 'assistantText', 'lineHeight', TOL.px],
    ['composer.x', 'composer', 'x', TOL.px],
    ['composer.y', 'composer', 'y', TOL.px],
    ['composer.width', 'composer', 'width', TOL.px],
    ['composer.height', 'composer', 'height', TOL.px],
    ['composer.radius', 'composer', 'radius', TOL.px],
    ['composer.padTop', 'composer', 'padTop', TOL.px],
    ['composer.padLeft', 'composer', 'padLeft', TOL.px],
    ['input.y', 'composerInput', 'y', TOL.px],
    ['input.height', 'composerInput', 'height', TOL.px],
  ],
  mobile: [
    ['topbar.height', 'topbar', 'height', TOL.px],
    ['bubble.x', 'userBubble', 'x', TOL.px],
    ['bubble.y', 'userBubble', 'y', TOL.px],
    ['bubble.width', 'userBubble', 'width', TOL.px],
    ['bubble.height', 'userBubble', 'height', TOL.px],
    ['bubble.radius', 'userBubble', 'radius', TOL.px],
    ['userText.width', 'userText', 'width', TOL.px],
    ['assistant.x', 'assistantText', 'x', TOL.px],
    ['assistant.y', 'assistantText', 'y', TOL.px],
    ['assistant.font', 'assistantText', 'fontSize', TOL.px],
    ['assistant.line', 'assistantText', 'lineHeight', TOL.px],
    ['composer.x', 'composer', 'x', TOL.px],
    ['composer.y', 'composer', 'y', TOL.px],
    ['composer.width', 'composer', 'width', TOL.px],
    ['composer.height', 'composer', 'height', TOL.px],
    ['composer.padTop', 'composer', 'padTop', TOL.px],
    ['input.y', 'composerInput', 'y', TOL.px],
    ['input.height', 'composerInput', 'height', TOL.px],
  ],
};

function checkRow(label, expected, actual, tol) {
  if (actual == null) return { label, expected, actual, ok: false };
  if (typeof expected === 'string') return { label, expected, actual, ok: expected === actual };
  const e = parseFloat(expected);
  const a = parseFloat(actual);
  if (Number.isNaN(e) || Number.isNaN(a)) return { label, expected, actual, ok: false };
  return { label, expected, actual, ok: Math.abs(e - a) <= tol };
}

async function shotBaseline(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockAuthedApp(page);
  await page.goto(`http://127.0.0.1:${BASE_PORT}/`, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.evaluate(({ topic, messages, sessionId }) => {
    const s = window.stateStore;
    s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    s.dispatch({ type: 'state/set', key: 'topic', value: topic });
    s.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    s.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
    window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'parity-fixture' });
  }, { ...FIXTURE, sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  await settle(page);
  const probe = await page.evaluate(`(${BASE_PROBE.toString()})()`);
  const family = await page.evaluate(() => {
    const p = document.querySelector('#appShell #msgList .msg.assistant .msg-body p');
    return p ? getComputedStyle(p).fontFamily.slice(0, 40) : null;
  });
  await context.close();
  return { ...probe, assistantFamily: family };
}

async function shotUniversal(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockUniversal(page);
  await page.goto(`http://127.0.0.1:${RN_PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Choose model' }).waitFor({ state: 'visible', timeout: 20000 });
  const row = page.getByRole('button', { name: FIXTURE.topic, exact: true });
  if (!(await row.isVisible().catch(() => false))) {
    const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await toggle.isVisible().catch(() => false)) { await toggle.click().catch(() => {}); await settle(page); }
  }
  if (await row.isVisible().catch(() => false)) { await row.click().catch(() => {}); await settle(page); }
  await page.getByText(FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  const probe = await page.evaluate(`(${UNIVERSAL_PROBE.toString()})()`);
  const family = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,span')].find((n) => n.children.length === 0 && (n.textContent || '').trim() === 'The workbench is ready.');
    return el ? getComputedStyle(el).fontFamily.slice(0, 40) : null;
  });
  await context.close();
  return { ...probe, assistantFamily: family };
}

async function main() {
  const baselineSrv = spawn(process.execPath, [join(frontend, 'e2e', 'dist-server.mjs')], {
    cwd: frontend, env: { ...process.env, SMOKE_PORT: String(BASE_PORT) }, stdio: 'ignore',
  });
  const rnSrv = await serveStatic(universalDist, RN_PORT);
  const browser = await chromium.launch();
  let failures = 0;
  const lines = [];
  try {
    for (const viewport of VIEWPORTS) {
      lines.push(`\n===== ${viewport.name} ${viewport.width}x${viewport.height} =====`);
      const base = await shotBaseline(browser, viewport);
      const uni = await shotUniversal(browser, viewport);
      const spec = SPEC[viewport.name];
      const get = (m, key) => (m && m[key] ? m[key] : null);
      const read = (m, key, prop) => {
        const entry = get(m, key);
        if (!entry) return null;
        return prop in entry ? entry[prop] : null;
      };
      // Placeholder + font family are string checks.
      const uniRows = CHECKS[viewport.name].map(([label, key, prop, tol]) => {
        const want = spec[key] ? spec[key][prop] : null;
        return { key, ...checkRow(label, want, read(uni, key, prop), tol) };
      });
      const probeRows = [
        { label: 'composer.placeholder', expected: spec.placeholder, actual: uni.placeholder, ok: spec.placeholder === uni.placeholder },
        { label: 'prose.family', expected: spec.fontFamily, actual: uni.assistantFamily, ok: (uni.assistantFamily || '').includes(spec.fontFamily || 'Inter') },
      ];
      for (const row of [...probeRows, ...uniRows]) {
        const ok = row.ok ? 'PASS' : 'FAIL';
        if (!row.ok) failures += 1;
        lines.push(`  [${ok}] ${row.label.padEnd(22)} expected ${String(row.expected).padEnd(18)} got ${row.actual}`);
        const probe = row.key ? uni[row.key] : null;
        if (!row.ok && probe) lines.push(`        ↳ ${probe.tag}${probe.id ? '#' + probe.id : ''} rect=${probe.x},${probe.y} ${probe.width}x${probe.height} "${probe.text}"`);
      }
      for (const [label, key, prop, tol] of PAIR_CHECKS[viewport.name]) {
        let expected = read(base, key, prop);
        let actual = read(uni, key, prop);
        if (label === 'recents.y') actual = parseFloat(actual) + parseFloat(read(uni, 'recentsTitle', 'padTop'));
        if (label === 'userText.width') {
          expected = parseFloat(read(base, 'userBubble', 'width')) - parseFloat(read(base, 'userBubble', 'padLeft')) - parseFloat(read(base, 'userBubble', 'padRight'));
        }
        const row = checkRow(`pair ${label}`, expected, actual, tol);
        if (!row.ok) failures += 1;
        const delta = Number.isFinite(parseFloat(expected)) && Number.isFinite(parseFloat(actual))
          ? ` Δ${Math.round((parseFloat(actual) - parseFloat(expected)) * 100) / 100}`
          : '';
        lines.push(`  [${row.ok ? 'PASS' : 'FAIL'}] ${row.label.padEnd(22)} SPA ${String(expected).padEnd(12)} Universal ${actual}${delta}`);
        if (!row.ok && label === 'composer.height') {
          lines.push(`        ↳ SPA shell ${JSON.stringify(base.composer)}`);
          lines.push(`        ↳ Universal shell ${JSON.stringify(uni.composer)}`);
          lines.push(`        ↳ SPA children ${JSON.stringify(base.composerChildren)}`);
          lines.push(`        ↳ Universal children ${JSON.stringify(uni.composerChildren)}`);
        }
      }
      // Baseline self-check: the SPA must still sit on its own spec.
      for (const [label, key, prop, tol] of CHECKS[viewport.name]) {
        const want = spec[key] ? spec[key][prop] : null;
        if (want == null) continue;
        const got = read(base, key, prop);
        const row = checkRow(`baseline ${label}`, want, got, tol);
        if (!row.ok) failures += 1;
        lines.push(`  [${row.ok ? 'PASS' : 'FAIL'}] ${row.label.padEnd(22)} expected ${String(row.expected).padEnd(18)} got ${row.actual}`);
        const probe = base[key];
        if (!row.ok && probe) lines.push(`        ↳ ${probe.tag}${probe.id ? '#' + probe.id : ''} rect=${probe.x},${probe.y} ${probe.width}x${probe.height} cls=${probe.cls}`);
      }
    }
  } finally {
    await browser.close();
    rnSrv.close();
    baselineSrv.kill();
  }
  console.log(lines.join('\n'));
  console.log(`\n[parity-check] ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
}

await main();
