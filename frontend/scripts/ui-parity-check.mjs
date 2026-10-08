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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const USER = { id: 'u1', email: 't@e.c', name: 'T', displayName: 'T', isGuest: false, tier: 'descartes' };
const PROVIDERS = [{ id: 'beagle', label: 'Beagle', url: 'https://api.example.test', model: 'Beagle', isActive: true, isBuiltIn: true, hasKey: true }];
const WELCOME_SESSION = { id: 'welcome', title: 'Welcome to Socrates', topic: 'Universal app', mode: 'chat', phase: 'chat', projectId: null };
const FIXTURE_SESSION = { id: 's1', title: FIXTURE.topic, topic: '', mode: 'chat', phase: 'chat', projectId: null };
const TUTOR_FIXTURE = {
  topic: 'Algebra',
  title: 'Tutor knowledge fixture',
  messages: [
    { clientId: 'tutor-fixture-user', role: 'user', rawText: 'Explain how algebra connects to real situations.', html: '<p>Explain how algebra connects to real situations.</p>' },
    { clientId: 'tutor-fixture-assistant', role: 'assistant', rawText: 'Let us connect the symbols to a concrete example.', html: '<p>Let us connect the symbols to a concrete example.</p>' },
  ],
  kbNodes: [
    { name: 'Basic concepts of Algebra', status: 'internalized', questions: 3, verifiedCount: 2, confidence_score: 4, system_note: 'Uses variables to represent unknown quantities.', user_note: 'Review the distinction between a term and a factor.' },
    { name: 'Practical applications of Algebra', status: 'fuzzy', questions: 2, verifiedCount: 1, confidence_score: 2, system_note: 'Can translate a word problem into an equation.', user_note: 'Practice setting up the equation before solving.' },
    { name: 'Symbolic transformations', status: 'blank', questions: 0, verifiedCount: 0, confidence_score: 0, system_note: '', user_note: '' },
  ],
  teachingPlan: {
    topic: 'Algebra', currentSubtopicIdx: 1,
    subtopics: [
      { name: 'Basic concepts of Algebra', status: 'internalized' },
      { name: 'Practical applications of Algebra', status: 'fuzzy' },
      { name: 'Symbolic transformations', status: 'blank' },
    ],
  },
  teachingStage: 'develop',
  substantiveCount: 0,
  practicePhase: 'foundation',
  practiceAttempts: 0,
  currentNode: 1,
  boundariesHistory: [
    { date: '2026-10-01', at: 1790812800000, summary: 'I 1 · F 1 · B 1', counts: { internalized: 1, fuzzy: 1, blank: 1 } },
  ],
  /* Mistake book rows in the baseline `ui/mistakeBook.js` record shape.
   * Timestamps are relative to the run so the relative-time meta reads the
   * same ("3h ago" / "Yesterday") on both shells. */
  mistakes: [
    {
      id: 'm-fixture-quiz', type: 'quiz', topic: 'Algebra', node: 'Practical applications of Algebra', nodeIdx: 1,
      q: 'Which expression models three more than x?',
      options: [{ letter: 'A', text: '3x' }, { letter: 'B', text: 'x + 3' }, { letter: 'C', text: 'x - 3' }],
      correct: 'B', userAnswer: 'A', judgedAnswer: null, timestamp: Date.now() - (3 * 3600 + 300) * 1000, redoCount: 1, quizSlotId: null,
    },
    {
      id: 'm-fixture-practice', type: 'practice', topic: 'Algebra', node: 'Practical applications of Algebra', nodeIdx: 1,
      q: 'Solve 2x + 1 = 7.', options: [], correct: 'x = 3', userAnswer: 'x = 4', judgedAnswer: 'x = 3',
      timestamp: Date.now() - 26 * 3600 * 1000, redoCount: 0, quizSlotId: null,
    },
  ],
};
const TUTOR_FIXTURE_SESSION = {
  id: 's1', title: TUTOR_FIXTURE.title, topic: TUTOR_FIXTURE.topic,
  mode: 'tutor', phase: 'chat', projectId: null,
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

async function mockUniversal(page, { tutor = false } = {}) {
  const fixtureSession = tutor ? TUTOR_FIXTURE_SESSION : FIXTURE_SESSION;
  const fixture = tutor ? TUTOR_FIXTURE : FIXTURE;
  const sessions = [WELCOME_SESSION, fixtureSession];
  const fulfill = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/auth/me', (route) => fulfill(route, { user: USER }));
  await page.route('**/api/v2/projects', (route) => fulfill(route, { projects: [] }));
  await page.route('**/api/v2/sessions?limit=50', (route) => fulfill(route, { sessions }));
  await page.route('**/api/v2/sessions?limit=50&archived=true', (route) => fulfill(route, { sessions: [], nextCursor: null }));
  await page.route('**/api/v2/api-key', (route) => fulfill(route, { providers: PROVIDERS, activeId: 'beagle' }));
  await page.route('**/api/v2/creations/items/assistants', (route) => fulfill(route, { items: [] }));
  await page.route('**/api/v2/account/usage', (route) => fulfill(route, {
    user: { id: 'u1', email: 't@e.c', displayName: 'T', tier: 'diophantus' },
    plan: { name: 'Diophantus' },
    usage: { sessionCount: 1, providerCount: 0, graphNodes: 0, beagleUsed: 0, beagleLimit: 1000000 },
  }));
  await page.route('**/api/v2/sessions/s1', (route) => fulfill(route, {
    ...fixtureSession,
    messages: fixture.messages,
    ...(tutor ? {
      kbNodes: TUTOR_FIXTURE.kbNodes,
      teachingPlan: TUTOR_FIXTURE.teachingPlan,
      teachingStage: TUTOR_FIXTURE.teachingStage,
      substantiveCount: TUTOR_FIXTURE.substantiveCount,
      practicePhase: TUTOR_FIXTURE.practicePhase,
      practiceAttempts: TUTOR_FIXTURE.practiceAttempts,
      currentNode: TUTOR_FIXTURE.currentNode,
      boundariesHistory: TUTOR_FIXTURE.boundariesHistory,
      mistakes: TUTOR_FIXTURE.mistakes,
    } : {}),
  }));
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
    const textRange = document.createRange();
    textRange.selectNodeContents(el);
    const tr = textRange.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100,
      rawX: r.x, rawY: r.y, rawWidth: r.width, rawHeight: r.height,
      textX: Math.round(tr.x * 100) / 100, textY: Math.round(tr.y * 100) / 100,
      textWidth: Math.round(tr.width * 100) / 100, textHeight: Math.round(tr.height * 100) / 100,
      rawTextX: tr.x, rawTextY: tr.y, rawTextWidth: tr.width, rawTextHeight: tr.height,
      clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      textClipped: el.scrollWidth > el.clientWidth + 1,
      radius: s.borderRadius,
      radiusPx: s.borderRadius.endsWith('%') ? String(Math.round((parseFloat(s.borderRadius) / 100) * Math.min(r.width, r.height) * 100) / 100) + 'px' : s.borderRadius,
      padTop: s.paddingTop, padLeft: s.paddingLeft, padRight: s.paddingRight, padBottom: s.paddingBottom, gap: s.gap,
      display: s.display, flexDirection: s.flexDirection, flex: s.flex, flexGrow: s.flexGrow,
      minHeight: s.minHeight, heightStyle: s.height, boxSizing: s.boxSizing, justifyContent: s.justifyContent, alignItems: s.alignItems,
      marginTop: s.marginTop, marginBottom: s.marginBottom,
      offsetHeight: el.offsetHeight, scrollHeight: el.scrollHeight,
      after: [getComputedStyle(el, '::after').content, getComputedStyle(el, '::after').height, getComputedStyle(el, '::after').display],
      letterSpacing: s.letterSpacing,
      textRendering: s.textRendering, webkitFontSmoothing: s.webkitFontSmoothing,
      fontKerning: s.fontKerning, fontSynthesis: s.fontSynthesis,
      fontVariant: s.fontVariant, fontVariantLigatures: s.fontVariantLigatures,
      fontFeatureSettings: s.fontFeatureSettings, fontOpticalSizing: s.fontOpticalSizing,
      fontStretch: s.fontStretch, fontStyle: s.fontStyle, wordSpacing: s.wordSpacing,
      fontVariantCaps: s.fontVariantCaps, fontVariationSettings: s.fontVariationSettings, fontSizeAdjust: s.fontSizeAdjust,
      textTransform: s.textTransform, textIndent: s.textIndent, textAlign: s.textAlign,
      whiteSpace: s.whiteSpace, wordBreak: s.wordBreak, overflowWrap: s.overflowWrap,
      textDecorationLine: s.textDecorationLine, textDecorationStyle: s.textDecorationStyle,
      textDecorationColor: s.textDecorationColor, textDecorationThickness: s.textDecorationThickness,
      bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight,
      fontWeight: s.fontWeight, fontFamily: s.fontFamily,
      opacity: s.opacity, visibility: s.visibility, filter: s.filter, transform: s.transform,
      boxShadow: s.boxShadow, backgroundClip: s.backgroundClip, backgroundOrigin: s.backgroundOrigin,
      borderWidth: s.borderWidth, borderStyle: s.borderStyle, borderColor: s.borderColor,
      borderTopWidth: s.borderTopWidth, borderRightWidth: s.borderRightWidth, borderBottomWidth: s.borderBottomWidth, borderLeftWidth: s.borderLeftWidth,
      borderTopStyle: s.borderTopStyle, borderRightStyle: s.borderRightStyle, borderBottomStyle: s.borderBottomStyle, borderLeftStyle: s.borderLeftStyle,
      borderTopColor: s.borderTopColor, borderRightColor: s.borderRightColor, borderBottomColor: s.borderBottomColor, borderLeftColor: s.borderLeftColor,
      textShadow: s.textShadow, webkitTextStrokeColor: s.webkitTextStrokeColor,
      webkitTextStrokeWidth: s.webkitTextStrokeWidth,
      paintStack: (() => {
        const stack = [];
        let node = el;
        while (node && node !== document.documentElement && stack.length < 12) {
          const style = getComputedStyle(node);
          stack.push({ tag: node.tagName, id: node.id, cls: String(node.className || '').slice(0, 40), color: style.color, opacity: style.opacity, filter: style.filter, textShadow: style.textShadow, transform: style.transform, translate: style.translate, rotate: style.rotate, scale: style.scale, transformStyle: style.transformStyle, willChange: style.willChange, contain: style.contain, isolation: style.isolation, perspective: style.perspective, backfaceVisibility: style.backfaceVisibility, mixBlendMode: style.mixBlendMode, display: style.display, position: style.position, verticalAlign: style.verticalAlign, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, whiteSpace: style.whiteSpace, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap });
          node = node.parentElement;
        }
        return stack;
      })(),
      styleAttr: el.getAttribute('style'),
      text: (el.textContent || '').trim().slice(0, 30),
      tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 70),
    };
  };
  const sidebar = document.querySelector('#appShell #sidebar');
  const composer = document.querySelector('#composerInputWrap') || document.querySelector('.composer-shell');
  const richComposer = document.querySelector('.rich-composer');
  const input = document.querySelector('.rich-composer-editor');
  const styleSnapshot = (node, pseudo = '') => {
    if (!node) return null;
    const s = getComputedStyle(node, pseudo);
    return Object.fromEntries(['color', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontSynthesis', 'fontVariant', 'fontVariantCaps', 'fontVariantLigatures', 'fontFeatureSettings', 'fontOpticalSizing', 'textRendering', 'textTransform', 'textAlign', 'whiteSpace', 'content'].map((key) => [key, s[key]]));
  };
  const effortBtn = document.querySelector('#appShell .effort-trigger');
  const effortTexts = [...(effortBtn?.querySelectorAll('.effort-label,.effort-value') || [])].map((el) => ({ ...of(el), paint: styleSnapshot(el) }));
  const composerPlaceholder = styleSnapshot(input?.querySelector('p.is-editor-empty:first-child'), '::before');
  const visibleLeafTexts = [...document.querySelectorAll('body *')].flatMap((el) => {
    const hasDirectText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!hasDirectText || [...el.children].some((child) => (child.textContent || '').trim())) return [];
    const range = document.createRange(); range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    for (let parent = el; parent && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || Number(parentStyle.opacity) === 0) return [];
    }
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return [];
    const s = getComputedStyle(el);
    return [{ text: (el.textContent || '').trim(), tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 50), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, fontStyle: s.fontStyle, lineHeight: s.lineHeight,
      font: s.font, fontVariantNumeric: s.fontVariantNumeric, fontVariantEastAsian: s.fontVariantEastAsian, fontVariantPosition: s.fontVariantPosition, fontVariantAlternates: s.fontVariantAlternates, fontVariantEmoji: s.fontVariantEmoji,
      letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing, color: s.color, opacity: s.opacity,
      webkitTextFillColor: s.webkitTextFillColor, webkitTextStrokeColor: s.webkitTextStrokeColor, textSizeAdjust: s.textSizeAdjust, direction: s.direction, unicodeBidi: s.unicodeBidi, verticalAlign: s.verticalAlign, display: s.display, position: s.position, textIndent: s.textIndent, mixBlendMode: s.mixBlendMode, backgroundClip: s.backgroundClip,
      textRendering: s.textRendering, webkitFontSmoothing: s.webkitFontSmoothing, fontKerning: s.fontKerning,
      fontSynthesis: s.fontSynthesis, fontVariant: s.fontVariant, fontVariantCaps: s.fontVariantCaps,
      fontVariantLigatures: s.fontVariantLigatures, fontFeatureSettings: s.fontFeatureSettings,
      fontOpticalSizing: s.fontOpticalSizing, fontVariationSettings: s.fontVariationSettings,
      fontSizeAdjust: s.fontSizeAdjust, fontStretch: s.fontStretch, textTransform: s.textTransform,
      textAlign: s.textAlign, whiteSpace: s.whiteSpace, wordBreak: s.wordBreak, overflowWrap: s.overflowWrap,
      textDecorationLine: s.textDecorationLine, textShadow: s.textShadow, webkitTextStrokeWidth: s.webkitTextStrokeWidth,
    }];
  });
  const visibleSvgs = [...document.querySelectorAll('svg')].flatMap((svg) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return [];
    const button = svg.closest('button,[role="button"]');
    const style = getComputedStyle(svg);
    const buttonRect = button?.getBoundingClientRect();
    return [{ label: button?.getAttribute('aria-label') || (button?.textContent || '').trim(), renderer: svg.getAttribute('data-socrates-icon-renderer'), html: svg.outerHTML, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      buttonBox: buttonRect ? [buttonRect.x, buttonRect.y, buttonRect.width, buttonRect.height] : null,
      viewBox: svg.getAttribute('viewBox'), fill: svg.getAttribute('fill'), stroke: style.stroke, strokeWidth: style.strokeWidth,
      strokeWidthAttr: svg.getAttribute('stroke-width'),
      color: style.color, opacity: style.opacity, shapeRendering: style.shapeRendering, overflow: style.overflow,
      parents: (() => {
        const stack = [];
        for (let node = svg; node && stack.length < 4; node = node.parentElement) {
          const s = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          stack.push({ tag: node.tagName, id: node.id, cls: String(node.className || '').slice(0, 45), x: box.x, y: box.y, width: box.width, height: box.height, display: s.display, position: s.position, opacity: s.opacity, color: s.color, transform: s.transform, willChange: s.willChange, contain: s.contain });
        }
        return stack;
      })(),
      linecap: style.strokeLinecap, linejoin: style.strokeLinejoin,
      shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')].map((shape) => ({
        tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
        x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'),
        points: shape.getAttribute('points'), fill: shape.getAttribute('fill'), stroke: shape.getAttribute('stroke'),
      strokeWidth: shape.getAttribute('stroke-width'), computedFill: getComputedStyle(shape).fill,
        computedStroke: getComputedStyle(shape).stroke, computedStrokeWidth: getComputedStyle(shape).strokeWidth,
        strokeLinecap: getComputedStyle(shape).strokeLinecap, strokeLinejoin: getComputedStyle(shape).strokeLinejoin,
        fillRule: getComputedStyle(shape).fillRule, shapeRendering: getComputedStyle(shape).shapeRendering,
        opacity: getComputedStyle(shape).opacity, vectorEffect: getComputedStyle(shape).vectorEffect,
      })) }];
  });
  const send = document.querySelector('.composer-primary-btn');
  const bubble = document.querySelector('#appShell #msgList .msg.user .msg-body');
  const userText = bubble?.querySelector('p, span, div') || bubble;
  const navText = document.querySelector('#appShell #sidebarNav .sidebar-nav-btn[data-nav="library"] span[data-i18n-key]');
  const navIcon = document.querySelector('#appShell #sidebarNav .sidebar-nav-btn[data-nav="library"] svg');
  const sessionText = document.querySelector('#appShell #sidebar .recent-item.active .recent-item-text');
  const firstMsg = document.querySelector('#appShell #msgList .msg');
  const assistant = document.querySelector('#appShell #msgList .msg.assistant .msg-body p');
  const toolBtn = document.querySelector('#appShell #msgList .msg-toolbar-btn');
  const topbar = document.querySelector('#appShell .top-bar');
  const modelSwitcher = document.querySelector('#topModelSwitcher');
  const modelName = document.querySelector('.top-model-switcher-name');
  const modelSub = document.querySelector('.top-model-switcher-model');
  const modelCaret = document.querySelector('.top-model-switcher-caret');
  const footer = document.querySelector('#appShell #sidebarFooter');
  const recentRows = [...document.querySelectorAll('#appShell #sidebar .recent-item')].map((row) => {
    const id = row.getAttribute('data-recent-actual') || '';
    return { id, row: of(row), title: of(row.querySelector('.recent-item-text')) };
  });
  const topControl = (selector) => {
    const el = document.querySelector(selector);
    const svg = el?.querySelector('svg');
    const labelText = el ? [...el.querySelectorAll('.summary-btn-label,span,div')].find((node) => node.children.length === 0 && (node.textContent || '').trim() === 'Summary') || null : null;
    return el ? {
      ...of(el),
      labelText: of(labelText),
      svg: svg ? {
        ...of(svg), viewBox: svg.getAttribute('viewBox'), fill: svg.getAttribute('fill'),
        stroke: svg.getAttribute('stroke'), strokeWidth: svg.getAttribute('stroke-width') || svg.getAttribute('strokeWidth'),
        effectiveStroke: getComputedStyle(svg).stroke,
        linecap: svg.getAttribute('stroke-linecap') || svg.getAttribute('strokeLinecap'),
        linejoin: svg.getAttribute('stroke-linejoin') || svg.getAttribute('strokeLinejoin'),
        shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline')].map((shape) => ({
          tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
          x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'),
          points: shape.getAttribute('points'), strokeWidth: shape.getAttribute('stroke-width'),
        })),
      } : null,
    } : null;
  };
  const messageActions = [...document.querySelectorAll('#appShell #msgList .msg-toolbar-btn')].map((el) => {
    const svg = el.querySelector('svg');
    return {
      label: el.getAttribute('aria-label') || '', button: of(el),
      svg: svg ? {
        ...of(svg), stroke: getComputedStyle(svg).stroke, strokeWidth: getComputedStyle(svg).strokeWidth,
        strokeWidthAttr: svg.getAttribute('stroke-width') || svg.getAttribute('strokeWidth'),
        linecap: getComputedStyle(svg).strokeLinecap, linejoin: getComputedStyle(svg).strokeLinejoin,
        shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline')].map((shape) => ({
          tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
          x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'), points: shape.getAttribute('points'),
        })),
      } : null,
    };
  });
  return {
    sidebar: of(sidebar),
    newChatBtn: of(document.querySelector('#appShell #newChatBtn')),
    mobileNewChat: of(document.querySelector('#mobileNewChatBtn')),
    navRow: of(document.querySelector('#appShell .sidebar-nav-btn')),
    navText: of(navText),
    navIcon: of(navIcon),
    timeText: of(document.querySelector('#appShell #sidebar .recents-time-label')),
    sessionText: of(sessionText),
    recentTitles: [...document.querySelectorAll('#appShell #sidebar .recent-item-text')].map((el) => (el.textContent || '').trim()),
    recentRows,
    recentsTitle: of(document.querySelector('#appShell .recents-title')),
    footerBtn: of(footer ? footer.querySelector('.icon-btn') : null),
    sidebarFooter: of(footer),
    avatar: of(document.querySelector('#appShell #sidebarUserRow .user-avatar')),
    userName: of(document.querySelector('#appShell #sidebarUserRow .user-name')),
    userPlan: of(document.querySelector('#appShell #sidebarUserRow .tier-badge')),
    sidebarLogo: of(document.querySelector('#appShell .sidebar-logo')),
    sidebarLogoText: of(document.querySelector('#appShell #sidebarHeader .sidebar-logo > span')),
    navBadge: of(document.querySelector('#appShell #sidebarNav .nav-new-badge')),
    topbar: of(topbar),
    topbarControls: {
      sidebar: topControl('#sidebarOpenBtn'), newChat: topControl('#mobileNewChatBtn'),
      model: topControl('#topModelSwitcher'), summary: topControl('.summary-btn'),
      find: topControl('#findBtn'), share: topControl('#shareBtn'),
    },
    messageActions,
    modelSwitcher: of(modelSwitcher),
    modelName: of(modelName),
    modelSub: of(modelSub),
    modelCaret: of(modelCaret),
    assistantLeaf: of(assistant),
    userBubble: of(bubble),
    userText: of(userText),
    firstMsg: of(firstMsg),
    assistantText: of(assistant),
    toolBtn: of(toolBtn),
    composer: of(composer),
    composerChildren: composer ? [...composer.children].map(of) : [],
    composerInput: of(input),
    composerPlaceholder,
    visibleLeafTexts,
    visibleSvgs,
    effortBtn: of(effortBtn),
    effortTexts,
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
    const textRange = document.createRange();
    textRange.selectNodeContents(el);
    const tr = textRange.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,
      width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100,
      rawX: r.x, rawY: r.y, rawWidth: r.width, rawHeight: r.height,
      textX: Math.round(tr.x * 100) / 100, textY: Math.round(tr.y * 100) / 100,
      textWidth: Math.round(tr.width * 100) / 100, textHeight: Math.round(tr.height * 100) / 100,
      rawTextX: tr.x, rawTextY: tr.y, rawTextWidth: tr.width, rawTextHeight: tr.height,
      radius: s.borderRadius,
      radiusPx: s.borderRadius.endsWith('%') ? String(Math.round((parseFloat(s.borderRadius) / 100) * Math.min(r.width, r.height) * 100) / 100) + 'px' : s.borderRadius,
      padTop: s.paddingTop, padLeft: s.paddingLeft, padRight: s.paddingRight, padBottom: s.paddingBottom, gap: s.gap,
      display: s.display, flexDirection: s.flexDirection, flex: s.flex, flexGrow: s.flexGrow,
      minHeight: s.minHeight, heightStyle: s.height, boxSizing: s.boxSizing, justifyContent: s.justifyContent, alignItems: s.alignItems,
      marginTop: s.marginTop, marginBottom: s.marginBottom,
      offsetHeight: el.offsetHeight, scrollHeight: el.scrollHeight,
      after: [getComputedStyle(el, '::after').content, getComputedStyle(el, '::after').height, getComputedStyle(el, '::after').display],
      letterSpacing: s.letterSpacing,
      textRendering: s.textRendering, webkitFontSmoothing: s.webkitFontSmoothing,
      fontKerning: s.fontKerning, fontSynthesis: s.fontSynthesis,
      fontVariant: s.fontVariant, fontVariantLigatures: s.fontVariantLigatures,
      fontFeatureSettings: s.fontFeatureSettings, fontOpticalSizing: s.fontOpticalSizing,
      fontStretch: s.fontStretch, fontStyle: s.fontStyle, wordSpacing: s.wordSpacing,
      fontVariantCaps: s.fontVariantCaps, fontVariationSettings: s.fontVariationSettings, fontSizeAdjust: s.fontSizeAdjust,
      textTransform: s.textTransform, textIndent: s.textIndent, textAlign: s.textAlign,
      whiteSpace: s.whiteSpace, wordBreak: s.wordBreak, overflowWrap: s.overflowWrap,
      textDecorationLine: s.textDecorationLine, textDecorationStyle: s.textDecorationStyle,
      textDecorationColor: s.textDecorationColor, textDecorationThickness: s.textDecorationThickness,
      bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, lineHeight: s.lineHeight,
      fontWeight: s.fontWeight, fontFamily: s.fontFamily,
      opacity: s.opacity, visibility: s.visibility, filter: s.filter, transform: s.transform,
      boxShadow: s.boxShadow, backgroundClip: s.backgroundClip, backgroundOrigin: s.backgroundOrigin,
      borderWidth: s.borderWidth, borderStyle: s.borderStyle, borderColor: s.borderColor,
      borderTopWidth: s.borderTopWidth, borderRightWidth: s.borderRightWidth, borderBottomWidth: s.borderBottomWidth, borderLeftWidth: s.borderLeftWidth,
      borderTopStyle: s.borderTopStyle, borderRightStyle: s.borderRightStyle, borderBottomStyle: s.borderBottomStyle, borderLeftStyle: s.borderLeftStyle,
      borderTopColor: s.borderTopColor, borderRightColor: s.borderRightColor, borderBottomColor: s.borderBottomColor, borderLeftColor: s.borderLeftColor,
      textShadow: s.textShadow, webkitTextStrokeColor: s.webkitTextStrokeColor,
      webkitTextStrokeWidth: s.webkitTextStrokeWidth,
      paintStack: (() => {
        const stack = [];
        let node = el;
        while (node && node !== document.documentElement && stack.length < 12) {
          const style = getComputedStyle(node);
          stack.push({ tag: node.tagName, id: node.id, cls: String(node.className || '').slice(0, 40), color: style.color, opacity: style.opacity, filter: style.filter, textShadow: style.textShadow, transform: style.transform, translate: style.translate, rotate: style.rotate, scale: style.scale, transformStyle: style.transformStyle, willChange: style.willChange, contain: style.contain, isolation: style.isolation, perspective: style.perspective, backfaceVisibility: style.backfaceVisibility, mixBlendMode: style.mixBlendMode, display: style.display, position: style.position, verticalAlign: style.verticalAlign, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, whiteSpace: style.whiteSpace, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap });
          node = node.parentElement;
        }
        return stack;
      })(),
      clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      textClipped: el.scrollWidth > el.clientWidth + 1,
      styleAttr: el.getAttribute('style'),
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
  const recentRows = [...(sidebar?.querySelectorAll('[role="button"][aria-label]') || [])]
    .filter((row) => ['Welcome to Socrates', 'Workbench fixture'].includes((row.getAttribute('aria-label') || '').trim()))
    .map((row) => ({ id: row.getAttribute('aria-label') || '', row: of(row), title: of(row.querySelector('[data-testid="socrates-sidebar-session-title"]')) }));
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
  const styleSnapshot = (node, pseudo = '') => {
    if (!node) return null;
    const s = getComputedStyle(node, pseudo);
    return Object.fromEntries(['color', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontSynthesis', 'fontVariant', 'fontVariantCaps', 'fontVariantLigatures', 'fontFeatureSettings', 'fontOpticalSizing', 'textRendering', 'textTransform', 'textAlign', 'whiteSpace', 'content'].map((key) => [key, s[key]]));
  };
  const effortBtn = byRole('Reasoning');
  const effortTexts = [...(effortBtn?.querySelectorAll('div,span') || [])].filter((el) => el.children.length === 0 && (el.textContent || '').trim()).map((el) => ({ ...of(el), paint: styleSnapshot(el) }));
  const composerPlaceholder = styleSnapshot(input, '::placeholder');
  const visibleLeafTexts = [...document.querySelectorAll('body *')].flatMap((el) => {
    const hasDirectText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!hasDirectText || [...el.children].some((child) => (child.textContent || '').trim())) return [];
    const range = document.createRange(); range.selectNodeContents(el);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    for (let parent = el; parent && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || Number(parentStyle.opacity) === 0) return [];
    }
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return [];
    const s = getComputedStyle(el);
    return [{ text: (el.textContent || '').trim(), tag: el.tagName, id: el.id, cls: String(el.className || '').slice(0, 50), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, fontStyle: s.fontStyle, lineHeight: s.lineHeight,
      font: s.font, fontVariantNumeric: s.fontVariantNumeric, fontVariantEastAsian: s.fontVariantEastAsian, fontVariantPosition: s.fontVariantPosition, fontVariantAlternates: s.fontVariantAlternates, fontVariantEmoji: s.fontVariantEmoji,
      letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing, color: s.color, opacity: s.opacity,
      webkitTextFillColor: s.webkitTextFillColor, webkitTextStrokeColor: s.webkitTextStrokeColor, textSizeAdjust: s.textSizeAdjust, direction: s.direction, unicodeBidi: s.unicodeBidi, verticalAlign: s.verticalAlign, display: s.display, position: s.position, textIndent: s.textIndent, mixBlendMode: s.mixBlendMode, backgroundClip: s.backgroundClip,
      textRendering: s.textRendering, webkitFontSmoothing: s.webkitFontSmoothing, fontKerning: s.fontKerning,
      fontSynthesis: s.fontSynthesis, fontVariant: s.fontVariant, fontVariantCaps: s.fontVariantCaps,
      fontVariantLigatures: s.fontVariantLigatures, fontFeatureSettings: s.fontFeatureSettings,
      fontOpticalSizing: s.fontOpticalSizing, fontVariationSettings: s.fontVariationSettings,
      fontSizeAdjust: s.fontSizeAdjust, fontStretch: s.fontStretch, textTransform: s.textTransform,
      textAlign: s.textAlign, whiteSpace: s.whiteSpace, wordBreak: s.wordBreak, overflowWrap: s.overflowWrap,
      textDecorationLine: s.textDecorationLine, textShadow: s.textShadow, webkitTextStrokeWidth: s.webkitTextStrokeWidth,
    }];
  });
  const visibleSvgs = [...document.querySelectorAll('svg')].flatMap((svg) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0 || rect.left >= innerWidth || rect.top >= innerHeight) return [];
    const button = svg.closest('button,[role="button"]');
    const style = getComputedStyle(svg);
    const buttonRect = button?.getBoundingClientRect();
    return [{ label: button?.getAttribute('aria-label') || (button?.textContent || '').trim(), renderer: svg.getAttribute('data-socrates-icon-renderer'), html: svg.outerHTML, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      buttonBox: buttonRect ? [buttonRect.x, buttonRect.y, buttonRect.width, buttonRect.height] : null,
      viewBox: svg.getAttribute('viewBox'), fill: svg.getAttribute('fill'), stroke: style.stroke, strokeWidth: style.strokeWidth,
      strokeWidthAttr: svg.getAttribute('stroke-width'),
      color: style.color, opacity: style.opacity, shapeRendering: style.shapeRendering, overflow: style.overflow,
      parents: (() => {
        const stack = [];
        for (let node = svg; node && stack.length < 4; node = node.parentElement) {
          const s = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          stack.push({ tag: node.tagName, id: node.id, cls: String(node.className || '').slice(0, 45), x: box.x, y: box.y, width: box.width, height: box.height, display: s.display, position: s.position, opacity: s.opacity, color: s.color, transform: s.transform, willChange: s.willChange, contain: s.contain });
        }
        return stack;
      })(),
      linecap: style.strokeLinecap, linejoin: style.strokeLinejoin,
      shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse')].map((shape) => ({
        tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
        x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'),
        points: shape.getAttribute('points'), fill: shape.getAttribute('fill'), stroke: shape.getAttribute('stroke'),
        strokeWidth: shape.getAttribute('stroke-width'), computedFill: getComputedStyle(shape).fill,
        computedStroke: getComputedStyle(shape).stroke, vectorEffect: getComputedStyle(shape).vectorEffect,
      })) }];
  });
  const shell = input ? up(input, (n) => parseFloat(getComputedStyle(n).borderTopWidth) > 0 && parseFloat(getComputedStyle(n).borderRadius) > 0) : null;
  const send = byRole('Send') || byRole('Send message') || byRole('Stop generating');
  const copyBtn = byRole('Copy') || byRole('Copied');
  const topControl = (name) => {
    const el = byRole(name);
    const svg = el?.querySelector('svg');
    const labelText = el ? [...el.querySelectorAll('div,span')].find((node) => node.children.length === 0 && (node.textContent || '').trim() === 'Summary') : null;
    return el ? {
      ...of(el),
      labelText: of(labelText),
      svg: svg ? {
        ...of(svg), viewBox: svg.getAttribute('viewBox'), fill: svg.getAttribute('fill'),
        stroke: svg.getAttribute('stroke'), strokeWidth: svg.getAttribute('stroke-width') || svg.getAttribute('strokeWidth'),
        effectiveStroke: getComputedStyle(svg).stroke,
        linecap: svg.getAttribute('stroke-linecap') || svg.getAttribute('strokeLinecap'),
        linejoin: svg.getAttribute('stroke-linejoin') || svg.getAttribute('strokeLinejoin'),
        shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline')].map((shape) => ({
          tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
          x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'),
          points: shape.getAttribute('points'), strokeWidth: shape.getAttribute('stroke-width'),
        })),
      } : null,
    } : null;
  };
  const toolLabels = new Set(['Copy', 'Copied', 'Edit message', 'Delete message', 'Share conversation', 'Regenerate response', 'Helpful', 'Not helpful', 'Branch from here', 'Re-explain from a different angle', 'Read aloud']);
  const messageActions = [...document.querySelectorAll('button,[role="button"]')].filter((el) => {
    if (!toolLabels.has((el.getAttribute('aria-label') || '').trim())) return false;
    return !!up(el, (node) => {
      const labels = [...node.querySelectorAll('button,[role="button"]')].map((button) => (button.getAttribute('aria-label') || '').trim());
      const text = node.textContent || '';
      return labels.length >= 2 && labels.length <= 8 && labels.every((label) => toolLabels.has(label))
        && (text.includes('Build a compact workbench.') || text.includes('The workbench is ready.'));
    });
  }).map((el) => {
    const svg = el.querySelector('svg');
    return {
      label: el.getAttribute('aria-label') || '', button: of(el),
      svg: svg ? {
        ...of(svg), stroke: getComputedStyle(svg).stroke, strokeWidth: getComputedStyle(svg).strokeWidth,
        strokeWidthAttr: svg.getAttribute('stroke-width') || svg.getAttribute('strokeWidth'),
        linecap: getComputedStyle(svg).strokeLinecap, linejoin: getComputedStyle(svg).strokeLinejoin,
        shapes: [...svg.querySelectorAll('path,circle,rect,line,polyline')].map((shape) => ({
          tag: shape.tagName, d: shape.getAttribute('d'), cx: shape.getAttribute('cx'), cy: shape.getAttribute('cy'), r: shape.getAttribute('r'),
          x: shape.getAttribute('x'), y: shape.getAttribute('y'), width: shape.getAttribute('width'), height: shape.getAttribute('height'), points: shape.getAttribute('points'),
        })),
      } : null,
    };
  });
  return {
    sidebar: of(sidebar),
    newChatBtn: of(byRole('Start a new chat')),
    mobileNewChat: of(byRole('New chat')),
    navRow: of(byRole('Library')),
    navText: of(byText('Library')),
    navIcon: of(byRole('Library')?.querySelector('svg')),
    timeText: of(byText('Today')),
    sessionText: of(byText('Workbench fixture')),
    recentTitles: [...document.querySelectorAll('[role="button"][aria-label]')]
      .map((el) => (el.getAttribute('aria-label') || '').trim())
      .filter((label) => label === 'Welcome to Socrates' || label === 'Workbench fixture'),
    recentRows,
    recentsTitle: of(byText('Recents')),
    footerBtn: of(footer ? footer.querySelector('[role="button"]') : null),
    sidebarFooter: of(footer),
    avatar: of(avatar),
    userName: of(name),
    userPlan: of(sidebar?.querySelector('#socrates-sidebar-user-plan')),
    sidebarLogo: of(sidebar?.querySelector('#socrates-sidebar-logo-text')),
    sidebarLogoText: of(sidebar?.querySelector('#socrates-sidebar-logo-text')),
    navBadge: of(sidebar?.querySelector('#socrates-sidebar-nav-badge-sites')),
    navBadgeWrap: of(sidebar?.querySelector('#socrates-sidebar-nav-badge-sites')?.parentElement),
    topbar: of(topbar),
    topbarControls: {
      sidebar: topControl('Toggle sidebar'), newChat: topControl('New chat'),
      model: topControl('Choose model'), summary: topControl('Summary') || topControl('Artifact summary'),
      find: topControl('Find in conversation'), share: topControl('Share conversation'),
    },
    messageActions,
    modelSwitcher: of(modelSwitcher),
    modelName: of(modelSwitcher ? [...modelSwitcher.querySelectorAll('div,span')].find((el) => el.children.length === 0 && (el.textContent || '').trim().length > 0) : null),
    modelSub: of(modelSwitcher?.children?.[1] || null),
    modelCaret: of(modelSwitcher?.children?.[2] || null),
    assistantLeaf: of(assistantText),
    userBubble: of(bubble),
    userText: of(userText),
    firstMsg: of(bubble),
    assistantText: of(proseOuter || assistantText),
    toolBtn: of(copyBtn),
    composer: of(shell),
    composerChildren: shell ? [...shell.children].map(of) : [],
    composerInput: of(input),
    composerPlaceholder,
    visibleLeafTexts,
    visibleSvgs,
    effortBtn: of(effortBtn),
    effortTexts,
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
    ['nav.letterSpacing', 'navRow', 'letterSpacing', 0],
    ['navText.fontSize', 'navText', 'fontSize', 0],
    ['navText.fontWeight', 'navText', 'fontWeight', 0],
    ['navText.glyphX', 'navText', 'textX', 0.1],
    ['navText.glyphY', 'navText', 'textY', 0.1],
    ['navText.glyphWidth', 'navText', 'textWidth', 0.1],
    ['navIcon.x', 'navIcon', 'x', TOL.px],
    ['navIcon.y', 'navIcon', 'y', TOL.px],
    ['navIcon.width', 'navIcon', 'width', TOL.px],
    ['navIcon.height', 'navIcon', 'height', TOL.px],
    ['recents.y', 'recentsTitle', 'y', TOL.px],
    ['recents.letterSpacing', 'recentsTitle', 'letterSpacing', 0],
    ['recents.fontSize', 'recentsTitle', 'fontSize', 0],
    ['recents.fontWeight', 'recentsTitle', 'fontWeight', 0],
    ['recents.glyphY', 'recentsTitle', 'textY', 0.1],
    ['time.fontSize', 'timeText', 'fontSize', 0],
    ['time.fontWeight', 'timeText', 'fontWeight', 0],
    ['time.letterSpacing', 'timeText', 'letterSpacing', 0],
    ['time.glyphY', 'timeText', 'textY', 0.1],
    ['session.fontSize', 'sessionText', 'fontSize', 0],
    ['session.fontWeight', 'sessionText', 'fontWeight', 0],
    ['session.letterSpacing', 'sessionText', 'letterSpacing', 0],
    ['session.glyphX', 'sessionText', 'textX', 0.1],
    ['session.glyphY', 'sessionText', 'textY', 0.1],
    ['session.glyphWidth', 'sessionText', 'textWidth', 0.1],
    ['userName.letterSpacing', 'userName', 'letterSpacing', 0],
    ['userName.fontWeight', 'userName', 'fontWeight', 0],
    ['userName.glyphX', 'userName', 'textX', 0.1],
    ['userName.glyphY', 'userName', 'textY', 0.1],
    ['userName.glyphWidth', 'userName', 'textWidth', 0.1],
    ['modelSub.letterSpacing', 'modelSub', 'letterSpacing', 0],
    ['input.letterSpacing', 'composerInput', 'letterSpacing', 0],
    ['footer.y', 'sidebarFooter', 'y', TOL.px],
    ['footer.height', 'sidebarFooter', 'height', TOL.px],
    ['topbar.height', 'topbar', 'height', TOL.px],
    ['modelSwitcher.x', 'modelSwitcher', 'x', TOL.px],
    ['modelSwitcher.width', 'modelSwitcher', 'width', TOL.px],
    ['modelName.x', 'modelName', 'x', TOL.px],
    ['modelName.width', 'modelName', 'width', TOL.px],
    ['modelSub.x', 'modelSub', 'x', TOL.px],
    ['modelSub.width', 'modelSub', 'width', TOL.px],
    ['modelCaret.x', 'modelCaret', 'x', TOL.px],
    ['modelCaret.y', 'modelCaret', 'y', TOL.px],
    ['modelCaret.width', 'modelCaret', 'width', TOL.px],
    ['modelCaret.height', 'modelCaret', 'height', TOL.px],
    ['modelName.letterSpacing', 'modelName', 'letterSpacing', 0],
    ['assistant.letterSpacing', 'assistantText', 'letterSpacing', 0],
    ['userText.letterSpacing', 'userText', 'letterSpacing', 0],
    ['modelName.fontWeight', 'modelName', 'fontWeight', 0],
    ['modelName.fontKerning', 'modelName', 'fontKerning', 0],
    ['modelName.fontVariantLigatures', 'modelName', 'fontVariantLigatures', 0],
    ['modelName.fontFeatures', 'modelName', 'fontFeatureSettings', 0],
    ['modelName.fontOpticalSizing', 'modelName', 'fontOpticalSizing', 0],
    ['assistant.fontWeight', 'assistantText', 'fontWeight', 0],
    ['assistant.fontKerning', 'assistantText', 'fontKerning', 0],
    ['assistant.fontVariantLigatures', 'assistantText', 'fontVariantLigatures', 0],
    ['assistant.fontFeatures', 'assistantText', 'fontFeatureSettings', 0],
    ['assistant.fontOpticalSizing', 'assistantText', 'fontOpticalSizing', 0],
    ['userText.fontWeight', 'userText', 'fontWeight', 0],
    ['userText.fontKerning', 'userText', 'fontKerning', 0],
    ['userText.fontVariantLigatures', 'userText', 'fontVariantLigatures', 0],
    ['userText.fontFeatures', 'userText', 'fontFeatureSettings', 0],
    ['userText.fontOpticalSizing', 'userText', 'fontOpticalSizing', 0],
    ['assistant.textRendering', 'assistantText', 'textRendering', 0],
    ['assistant.smoothing', 'assistantText', 'webkitFontSmoothing', 0],
    ['userText.smoothing', 'userText', 'webkitFontSmoothing', 0],
    ['nav.fontVariantLigatures', 'navRow', 'fontVariantLigatures', 0],
    ['nav.fontFeatures', 'navRow', 'fontFeatureSettings', 0],
    ['nav.fontOpticalSizing', 'navRow', 'fontOpticalSizing', 0],
    ['modelName.glyphX', 'modelName', 'textX', 0.1],
    ['modelName.glyphWidth', 'modelName', 'textWidth', 0.1],
    ['assistant.glyphX', 'assistantText', 'textX', 0.1],
    ['assistant.glyphY', 'assistantText', 'textY', 0.1],
    ['assistant.glyphWidth', 'assistantText', 'textWidth', 0.1],
    ['userText.glyphX', 'userText', 'textX', 0.1],
    ['userText.glyphWidth', 'userText', 'textWidth', 0.1],
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
    ['mobileNewChat.x', 'mobileNewChat', 'x', TOL.px],
    ['mobileNewChat.width', 'mobileNewChat', 'width', TOL.px],
    ['mobileNewChat.height', 'mobileNewChat', 'height', TOL.px],
    ['input.letterSpacing', 'composerInput', 'letterSpacing', 0],
    ['modelSwitcher.x', 'modelSwitcher', 'x', TOL.px],
    ['modelSwitcher.width', 'modelSwitcher', 'width', TOL.px],
    ['modelName.x', 'modelName', 'x', TOL.px],
    ['modelName.width', 'modelName', 'width', TOL.px],
    ['modelSub.x', 'modelSub', 'x', TOL.px],
    ['modelSub.width', 'modelSub', 'width', TOL.px],
    ['modelCaret.x', 'modelCaret', 'x', TOL.px],
    ['modelCaret.y', 'modelCaret', 'y', TOL.px],
    ['modelCaret.width', 'modelCaret', 'width', TOL.px],
    ['modelCaret.height', 'modelCaret', 'height', TOL.px],
    ['modelName.letterSpacing', 'modelName', 'letterSpacing', 0],
    ['assistant.letterSpacing', 'assistantText', 'letterSpacing', 0],
    ['userText.letterSpacing', 'userText', 'letterSpacing', 0],
    ['modelName.fontWeight', 'modelName', 'fontWeight', 0],
    ['modelName.fontKerning', 'modelName', 'fontKerning', 0],
    ['modelName.fontVariantLigatures', 'modelName', 'fontVariantLigatures', 0],
    ['modelName.fontFeatures', 'modelName', 'fontFeatureSettings', 0],
    ['modelName.fontOpticalSizing', 'modelName', 'fontOpticalSizing', 0],
    ['assistant.fontWeight', 'assistantText', 'fontWeight', 0],
    ['assistant.fontKerning', 'assistantText', 'fontKerning', 0],
    ['assistant.fontVariantLigatures', 'assistantText', 'fontVariantLigatures', 0],
    ['assistant.fontFeatures', 'assistantText', 'fontFeatureSettings', 0],
    ['assistant.fontOpticalSizing', 'assistantText', 'fontOpticalSizing', 0],
    ['userText.fontWeight', 'userText', 'fontWeight', 0],
    ['userText.fontKerning', 'userText', 'fontKerning', 0],
    ['userText.fontVariantLigatures', 'userText', 'fontVariantLigatures', 0],
    ['userText.fontFeatures', 'userText', 'fontFeatureSettings', 0],
    ['userText.fontOpticalSizing', 'userText', 'fontOpticalSizing', 0],
    ['assistant.textRendering', 'assistantText', 'textRendering', 0],
    ['assistant.smoothing', 'assistantText', 'webkitFontSmoothing', 0],
    ['userText.smoothing', 'userText', 'webkitFontSmoothing', 0],
    ['modelName.glyphX', 'modelName', 'textX', 0.1],
    ['modelName.glyphWidth', 'modelName', 'textWidth', 0.1],
    ['assistant.glyphX', 'assistantText', 'textX', 0.1],
    ['assistant.glyphY', 'assistantText', 'textY', 0.1],
    ['assistant.glyphWidth', 'assistantText', 'textWidth', 0.1],
    ['userText.glyphX', 'userText', 'textX', 0.1],
    ['userText.glyphWidth', 'userText', 'textWidth', 0.1],
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

async function compareScreenshots(browser, baseline, universal, viewport, includeDiffImage = false, elementZones = [], crop = null) {
  // crop: { ax, ay, bx, by, width, height } compares a sub-rectangle of each
  // shot (e.g. a panel both shells render at different scroll offsets).
  const cmpWidth = crop ? crop.width : viewport.width;
  const cmpHeight = crop ? crop.height : viewport.height;
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    return await page.evaluate(async ({ baseline, universal, width, height, includeDiffImage, elementZones, crop }) => {
      const load = (data) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = `data:image/png;base64,${data}`;
      });
      const [spa, rn] = await Promise.all([load(baseline), load(universal)]);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (crop) context.drawImage(spa, crop.ax, crop.ay, crop.width, crop.height, 0, 0, crop.width, crop.height);
      else context.drawImage(spa, 0, 0);
      const left = context.getImageData(0, 0, width, height).data;
      context.clearRect(0, 0, width, height);
      if (crop) context.drawImage(rn, crop.bx, crop.by, crop.width, crop.height, 0, 0, crop.width, crop.height);
      else context.drawImage(rn, 0, 0);
      const right = context.getImageData(0, 0, width, height).data;
      let differentPixels = 0, changedOver12 = 0, strongOver48 = 0, channelDelta = 0;
      const changedSamples = [];
      const outsideDrawerSamples = [];
      const strongSamples = [];
      const outsideDrawerRegions = { header: { exact: 0, over12: 0 }, transcript: { exact: 0, over12: 0 }, composer: { exact: 0, over12: 0 } };
      let outsideDrawerDiff = 0;
      let sidebarDiff = 0;
      const regions = Object.fromEntries(['sidebar', 'sidebarHeader', 'sidebarRecents', 'topbar', 'modelTopbar', 'actionsTopbar', 'transcript', 'composer'].map((name) => [name, { exact: 0, over12: 0 }]));
      const elementDiffs = Object.fromEntries(elementZones.map(({ name }) => [name, { exact: 0, over12: 0 }]));
      const diffCanvas = includeDiffImage ? document.createElement('canvas') : null;
      if (diffCanvas) { diffCanvas.width = width; diffCanvas.height = height; }
      const diffContext = diffCanvas?.getContext('2d');
      const diffImage = diffContext?.createImageData(width, height);
      for (let i = 0; i < left.length; i += 4) {
        const pixel = i / 4;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const region = width <= 768
          ? (y < 56 ? (x < 180 ? 'modelTopbar' : 'actionsTopbar') : y >= height - 150 ? 'composer' : 'transcript')
          : (x < 260 ? (y < 340 ? 'sidebarHeader' : 'sidebarRecents') : y < 52 ? 'topbar' : y >= height - 100 ? 'composer' : 'transcript');
        const delta = Math.max(Math.abs(left[i] - right[i]), Math.abs(left[i + 1] - right[i + 1]), Math.abs(left[i + 2] - right[i + 2]));
        channelDelta += delta;
        if (delta > 0) {
          differentPixels++;
          if (changedSamples.length < 256) changedSamples.push({ x, y, delta, spa: [left[i], left[i + 1], left[i + 2]], universal: [right[i], right[i + 1], right[i + 2]] });
          if (delta > 12 && strongSamples.length < 64) strongSamples.push({ x, y, delta, spa: [left[i], left[i + 1], left[i + 2]], universal: [right[i], right[i + 1], right[i + 2]] });
          if (width <= 768 && x >= 254) {
            outsideDrawerDiff++;
            const area = y < 56 ? 'header' : y >= height - 150 ? 'composer' : 'transcript';
            outsideDrawerRegions[area].exact++;
            if (delta > 12 && outsideDrawerSamples.length < 32) outsideDrawerSamples.push({ x, y, delta, spa: [left[i], left[i + 1], left[i + 2]], universal: [right[i], right[i + 1], right[i + 2]] });
          } else if (width <= 768) sidebarDiff++;
          regions[region].exact++;
          if (region === 'sidebarHeader' || region === 'sidebarRecents') regions.sidebar.exact++;
          if (region === 'modelTopbar' || region === 'actionsTopbar') regions.topbar.exact++;
          for (const box of elementZones) {
            if (x >= box.x && x < box.right && y >= box.y && y < box.bottom) elementDiffs[box.name].exact++;
          }
        }
        if (delta > 12) {
          changedOver12++;
          if (width <= 768 && x >= 254) {
            const area = y < 56 ? 'header' : y >= height - 150 ? 'composer' : 'transcript';
            outsideDrawerRegions[area].over12++;
          }
          regions[region].over12++;
          if (region === 'sidebarHeader' || region === 'sidebarRecents') regions.sidebar.over12++;
          if (region === 'modelTopbar' || region === 'actionsTopbar') regions.topbar.over12++;
          for (const box of elementZones) {
            if (x >= box.x && x < box.right && y >= box.y && y < box.bottom) elementDiffs[box.name].over12++;
          }
          if (delta > 48) strongOver48++;
        }
        if (diffImage) {
          diffImage.data[i] = delta > 0 ? 255 : 0;
          diffImage.data[i + 1] = 0;
          diffImage.data[i + 2] = 0;
          diffImage.data[i + 3] = 255;
        }
      }
      if (diffImage) diffContext.putImageData(diffImage, 0, 0);
      const total = width * height;
      return {
        differentPixels,
        changedSamples,
        strongSamples,
        outsideDrawerDiff,
        outsideDrawerSamples,
        outsideDrawerRegions,
        sidebarDiff,
        exactPct: Math.round(differentPixels / total * 1_000_000) / 10_000,
        changedOver12,
        changedPct: Math.round(changedOver12 / total * 1_000_000) / 10_000,
        strongOver48,
        meanDelta: Math.round(channelDelta / total * 100) / 100,
        regions,
        elementDiffs,
        diffPng: diffCanvas ? diffCanvas.toDataURL('image/png').split(',')[1] : null,
      };
    }, {
      baseline: baseline.toString('base64'), universal: universal.toString('base64'),
      width: cmpWidth, height: cmpHeight, includeDiffImage, elementZones, crop,
    });
  } finally {
    await page.close();
  }
}

async function shotBaseline(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockAuthedApp(page, { user: USER, apiKeys: { providers: PROVIDERS, activeId: 'beagle' } });
  await page.route('**/api/v2/sessions**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { await route.fallback(); return; }
    const url = new URL(req.url());
    if (url.pathname === '/api/v2/sessions') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [WELCOME_SESSION, FIXTURE_SESSION], nextCursor: null }) });
      return;
    }
    if (url.pathname === '/api/v2/sessions/s1') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...FIXTURE_SESSION, messages: FIXTURE.messages }) });
      return;
    }
    await route.fallback();
  });
  await page.goto(`http://127.0.0.1:${BASE_PORT}/`, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await page.locator('.recent-item[data-recent-actual="s1"]').waitFor({ state: 'attached', timeout: 15000 });
  await page.evaluate(({ topic, messages, sessionId, tier }) => {
    const s = window.stateStore;
    s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    s.dispatch({ type: 'state/set', key: 'topic', value: topic });
    s.dispatch({ type: 'state/set', key: 'currentSessionId', value: sessionId });
    s.dispatch({ type: 'state/set', key: 'messages', value: messages });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
    document.documentElement.dataset.userTier = tier;
    // The manual store injection skips the baseline's topbar state updater.
    // Match the authenticated active-conversation controls used by Universal.
    document.querySelector('#findBtn')?.classList.remove('hidden');
    document.querySelector('#shareBtn')?.classList.remove('hidden');
    window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'parity-fixture' });
    window.renderRecents?.();
  }, { ...FIXTURE, sessionId: 's1', tier: USER.tier });
  await settle(page);
  if (process.env.PARITY_INJECT_CSS) {
    await page.addStyleTag({ content: await readFile(process.env.PARITY_INJECT_CSS, 'utf8') });
    await settle(page);
  }
  const probe = await page.evaluate(`(${BASE_PROBE.toString()})()`);
  await page.mouse.move(0, 0);
  await settle(page);
  const screenshot = await page.screenshot({ animations: 'disabled' });
  const family = await page.evaluate(() => {
    const p = document.querySelector('#appShell #msgList .msg.assistant .msg-body p');
    return p ? getComputedStyle(p).fontFamily.slice(0, 40) : null;
  });
  const fontState = await page.evaluate(() => ({
    interReady: document.fonts.check('400 16px Inter'),
    notoReady: document.fonts.check('400 16px "Noto Sans SC"'),
    faces: [...new Map([...document.fonts].filter((face) => face.status === 'loaded' && /inter|noto/i.test(face.family)).map(({ family, weight }) => [`${family}:${weight}`, { family, weight }])).values()],
  }));
  await context.close();
  return { ...probe, assistantFamily: family, fontState, screenshot };
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
    if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await settle(page); }
  }
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.click();
  await settle(page);
  await page.getByText(FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  if (process.env.PARITY_INJECT_CSS) {
    await page.addStyleTag({ content: await readFile(process.env.PARITY_INJECT_CSS, 'utf8') });
    await settle(page);
  }
  await page.mouse.move(0, 0);
  await settle(page);
  const probe = await page.evaluate(`(${UNIVERSAL_PROBE.toString()})()`);
  const screenshot = await page.screenshot({ animations: 'disabled' });
  const family = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div,span')].find((n) => n.children.length === 0 && (n.textContent || '').trim() === 'The workbench is ready.');
    return el ? getComputedStyle(el).fontFamily.slice(0, 40) : null;
  });
  const fontState = await page.evaluate(() => ({
    interReady: document.fonts.check('400 16px Inter'),
    notoReady: document.fonts.check('400 16px "Noto Sans SC"'),
    faces: [...new Map([...document.fonts].filter((face) => face.status === 'loaded' && /inter|noto/i.test(face.family)).map(({ family, weight }) => [`${family}:${weight}`, { family, weight }])).values()],
  }));
  await context.close();
  return { ...probe, assistantFamily: family, fontState, screenshot };
}

async function shotTutorBaseline(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockAuthedApp(page, { user: USER, apiKeys: { providers: PROVIDERS, activeId: 'beagle' } });
  await page.addInitScript(() => localStorage.setItem('socrates-appmode', 'tutor'));
  await page.route('**/api/v2/sessions**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { await route.fallback(); return; }
    const url = new URL(req.url());
    if (url.pathname === '/api/v2/sessions') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [WELCOME_SESSION, TUTOR_FIXTURE_SESSION], nextCursor: null }) });
      return;
    }
    if (url.pathname === '/api/v2/sessions/s1') {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ...TUTOR_FIXTURE_SESSION, ...TUTOR_FIXTURE, messages: TUTOR_FIXTURE.messages }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`http://127.0.0.1:${BASE_PORT}/`, { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  if (viewport.width < 768) {
    await page.evaluate(() => {
      if (document.getElementById('sidebar')?.classList.contains('collapsed')) document.getElementById('sidebarOpenBtn')?.click();
    });
  }
  const row = page.locator('.recent-item[data-recent-actual="s1"]');
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.click();
  await page.getByText(TUTOR_FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => window.appMode === 'tutor');
  if (viewport.width < 768) {
    await page.evaluate(() => {
      if (document.getElementById('sidebar')?.classList.contains('collapsed')) document.getElementById('sidebarOpenBtn')?.click();
    });
  }
  const knowledgeTab = page.locator('#tabKnowledge');
  await knowledgeTab.waitFor({ state: 'visible', timeout: 5000 });
  if (!(await knowledgeTab.evaluate((node) => node.classList.contains('active')))) {
    await page.evaluate(() => window.toggleSidebarView('knowledge'));
  }
  await page.evaluate(() => window.updateKB());
  let tutorMetrics = null;
  if (process.env.PARITY_VERBOSE === '1') {
    tutorMetrics = await page.evaluate(() => {
      const measure = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { x: box.x, y: box.y, w: box.width, h: box.height, display: style.display, gap: style.gap, padding: style.padding, margin: style.margin, fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color, bg: style.backgroundColor, opacity: style.opacity, filter: style.filter, backdropFilter: style.backdropFilter, transform: style.transform, willChange: style.willChange, zIndex: style.zIndex, position: style.position, boxShadow: style.boxShadow, text: (el.textContent || '').trim().slice(0, 100) };
      };
      const metrics = Object.fromEntries([
        'sidebar:#sidebar', 'backdrop:#sidebarBackdrop', 'plan:#teachingPlanContent .teaching-plan', 'planTitle:#teachingPlanContent .teaching-plan-title', 'planProgress:#teachingPlanContent .teaching-plan-progress', 'planProgressText:#teachingPlanContent .teaching-plan-progress-text', 'planRow:#teachingPlanContent .teaching-plan-subtopic', 'transcript:#msgList',
        'knowledgePanel:#knowledgePanel', 'kb:#kbContent', 'kbHeader:#kbContent .kb-file-header', 'kbTitle:#kbContent .kb-file-title', 'kbMeta:#kbContent .kb-file-meta', 'kbSnapshot:#kbContent .kb-file-snapshot',
        'kbGraphWrap:#kbContent .kb-graph-wrap', 'kbGraph:#kbContent .kb-graph', 'kbSection:#kbContent .kb-section-title', 'practiceChip:#practiceProgressChip',
      ].map((entry) => { const [key, selector] = entry.split(':'); return [key, measure(selector)]; }));
      const row = document.querySelector('#teachingPlanContent .teaching-plan-subtopic');
      metrics.planRowChildren = [...(row?.children || [])].map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, padding: s.padding, text: (el.textContent || '').trim() }; });
      metrics.userTextLeaves = (() => {
        const root = document.querySelector("#msgList .msg.user");
        if (!root) return null;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const rects = [...range.getClientRects()].map((r) => [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]);
          const el = node.parentElement; const st = getComputedStyle(el); const box = el.getBoundingClientRect();
          out.push({ text: node.textContent.slice(0, 60), rects, box: [box.x, box.y, box.width, box.height], fontSize: st.fontSize, letterSpacing: st.letterSpacing, wordSpacing: st.wordSpacing, fontFamily: st.fontFamily.slice(0, 30), fontFeature: st.fontFeatureSettings, textRendering: st.textRendering, padding: st.padding, whiteSpace: st.whiteSpace, wordBreak: st.wordBreak, overflowWrap: st.overflowWrap, parentW: el.parentElement && el.parentElement.getBoundingClientRect().width });
        }
        return out;
      })();
      metrics.transcriptRows = [...document.querySelectorAll('#msgList > .msg')].map((el) => { const r = el.getBoundingClientRect(); return { role: el.classList.contains('user') ? 'user' : 'assistant', x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent || '').trim().slice(0, 70) }; });
      return metrics;
    });
    console.log(`[tutor baseline metrics ${viewport.name}] ${JSON.stringify(tutorMetrics)}`);
  }
  if (process.env.PARITY_VERBOSE === '1') {
    const visibility = await page.evaluate(() => {
      const node = document.querySelector('#kbContent .kb-graph');
      const chain = [];
      for (let el = node; el && chain.length < 8; el = el.parentElement) {
        const style = getComputedStyle(el);
        chain.push({ tag: el.tagName, id: el.id, cls: el.className, display: style.display, visibility: style.visibility, opacity: style.opacity, rect: (() => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })() });
      }
      return { appMode: window.appMode, bodyMode: document.body.dataset.appMode, chain };
    });
    console.log(`[tutor baseline visibility ${viewport.name}] ${JSON.stringify(visibility)}`);
  }
  await page.locator('#kbContent .kb-graph').waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.mouse.move(0, 0);
  const overview = await page.screenshot({ animations: 'disabled' });
  await page.locator('#kbContent .kb-graph-node[data-node-idx="1"]').click();
  await page.locator('#kbContent .kb-node-detail[data-node-idx="1"]').waitFor({ state: 'visible', timeout: 5000 });
  // Scroll to the bottom so the freshly opened panel is fully in view; the
  // comparison crops to the panel box (see main), so differing scroll maxima
  // cannot skew it.
  await page.evaluate(() => {
    const scroller = document.querySelector('#knowledgePanel');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await settle(page);
  await page.mouse.move(0, 0);
  const detail = await page.screenshot({ animations: 'disabled' });
  // The panel's scroll offset differs per shell, so the comparison crops to
  // the panel box (see main) instead of comparing scroll positions.
  const detailBox = await page.evaluate(() => {
    const r = document.querySelector('#kbContent .kb-node-detail[data-node-idx="1"]')?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  // Mistake book view (filter bar + cards + tab badge).
  await page.evaluate(() => window.toggleSidebarView('mistakes'));
  await page.locator('#mistakesList .mistake-card').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(() => { const panel = document.querySelector('#mistakesPanel'); if (panel) panel.scrollTop = 0; });
  await settle(page);
  await page.mouse.move(0, 0);
  const mistakes = await page.screenshot({ animations: 'disabled' });
  if (process.env.PARITY_VERBOSE === '1') {
    const mistakeMetrics = await page.evaluate(() => {
      const measure = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return { cls: el.className && el.className.baseVal === undefined ? el.className : '', x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, letterSpacing: s.letterSpacing, textTransform: s.textTransform, color: s.color, bg: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopColor} / L ${s.borderLeftWidth} ${s.borderLeftColor} / B ${s.borderBottomWidth} ${s.borderBottomColor}`, display: s.display, ff: s.fontFamily.slice(0, 24), radius: s.borderRadius, padding: s.padding, margin: s.margin, gap: s.gap, opacity: s.opacity, text: (el.children.length ? '' : (el.textContent || '').trim().slice(0, 60)) };
      };
      const walk = (el, depth, out) => { if (!el || depth > 6) return; out.push({ depth, ...measure(el) }); [...el.children].forEach((child) => walk(child, depth + 1, out)); };
      const out = [];
      walk(document.querySelector('#mistakesPanel'), 0, out);
      out.push({ depth: -1, ...measure(document.querySelector('#mistakesTabBadge')) });
      out.push({ depth: -1, ...measure(document.querySelector('#tabMistakes')) });
      return out;
    });
    console.log(`[mistakes baseline metrics ${viewport.name}] ${JSON.stringify(mistakeMetrics)}`);
  }
  await context.close();
  return { overview, detail, detailBox, mistakes, metrics: tutorMetrics };
}

async function shotTutorUniversal(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await mockUniversal(page, { tutor: true });
  await page.goto(`http://127.0.0.1:${RN_PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Choose model' }).waitFor({ state: 'visible', timeout: 20000 });
  const row = page.getByRole('button', { name: TUTOR_FIXTURE.title, exact: true });
  if (!(await row.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Toggle sidebar' }).click();
    await settle(page);
  }
  await row.waitFor({ state: 'visible', timeout: 10000 });
  await row.click();
  await page.getByText(TUTOR_FIXTURE.messages[1].rawText, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  if (viewport.width < 768) {
    const toggle = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await settle(page); }
  }
  if (viewport.width < 768) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
  }
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  if (viewport.width < 768) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
  }
  await page.getByText('Knowledge Boundary', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('#socrates-sidebar-recents svg').first().waitFor({ state: 'visible', timeout: 5000 });
  await settle(page);
  let tutorMetrics = null;
  if (process.env.PARITY_VERBOSE === '1') {
    tutorMetrics = await page.evaluate(() => {
      const measure = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { x: box.x, y: box.y, w: box.width, h: box.height, display: style.display, gap: style.gap, padding: style.padding, margin: style.margin, fontSize: style.fontSize, lineHeight: style.lineHeight, color: style.color, bg: style.backgroundColor, opacity: style.opacity, filter: style.filter, backdropFilter: style.backdropFilter, transform: style.transform, willChange: style.willChange, zIndex: style.zIndex, position: style.position, boxShadow: style.boxShadow, text: (el.textContent || '').trim().slice(0, 100) };
      };
      const metrics = Object.fromEntries([
        'sidebar:#socrates-sidebar', 'backdrop:#socrates-sidebar-backdrop', 'transcript:#socrates-message-list', 'scroll:#socrates-sidebar-recents', 'plan:[data-testid="socrates-teaching-plan"]', 'planTitle:[data-testid="socrates-teaching-plan-title"]', 'planProgress:[data-testid="socrates-teaching-plan-progress"]', 'planProgressText:[data-testid="socrates-teaching-plan-progress-text"]', 'planRow:[data-testid="socrates-teaching-plan-row-0"]',
        'knowledgePanel:[data-testid="socrates-sidebar-recents"]', 'kb:[data-testid="socrates-knowledge-boundary"]', 'kbHeader:[data-testid="socrates-kb-header"]', 'kbTitle:[data-testid="socrates-kb-header"] > *:first-child', 'kbMeta:[data-testid="socrates-kb-meta"]', 'kbSnapshot:[data-testid="socrates-kb-snapshot"]',
        'kbGraphWrap:[data-testid="socrates-kb-graph-wrap"]', 'kbGraphCaption:[data-testid="socrates-kb-graph-caption"]', 'kbGraphFrame:[data-testid="socrates-kb-graph-frame"]', 'practiceChip:#socrates-topbar-stage-chip',
      ].map((entry) => { const [key, selector] = entry.split(':'); return [key, measure(selector)]; }));
      const row = document.querySelector('[data-testid="socrates-teaching-plan-row-0"]');
      metrics.planRowChildren = [...(row?.children || [])].map((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { id: el.id, cls: el.className, x: r.x, y: r.y, w: r.width, h: r.height, fontSize: s.fontSize, lineHeight: s.lineHeight, padding: s.padding, text: (el.textContent || '').trim() }; });
      metrics.userTextLeaves = (() => {
        const root = document.querySelector("[id^='socrates-message-user-']");
        if (!root) return null;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const rects = [...range.getClientRects()].map((r) => [+r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]);
          const el = node.parentElement; const st = getComputedStyle(el); const box = el.getBoundingClientRect();
          out.push({ text: node.textContent.slice(0, 60), rects, box: [box.x, box.y, box.width, box.height], fontSize: st.fontSize, letterSpacing: st.letterSpacing, wordSpacing: st.wordSpacing, fontFamily: st.fontFamily.slice(0, 30), fontFeature: st.fontFeatureSettings, textRendering: st.textRendering, padding: st.padding, whiteSpace: st.whiteSpace, wordBreak: st.wordBreak, overflowWrap: st.overflowWrap, parentW: el.parentElement && el.parentElement.getBoundingClientRect().width });
        }
        return out;
      })();
      metrics.transcriptRows = [...document.querySelectorAll('#socrates-message-list [id^="socrates-message-row-"]')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent || '').trim().slice(0, 70) }; });
      return metrics;
    });
    console.log(`[tutor universal metrics ${viewport.name}] ${JSON.stringify(tutorMetrics)}`);
  }
  await page.mouse.move(0, 0);
  const overview = await page.screenshot({ animations: 'disabled' });
  await page.locator('[aria-label="Practical applications of Algebra"]').first().click();
  await page.getByRole('textbox', { name: 'Your note' }).waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(() => {
    const scroller = document.querySelector('#socrates-sidebar-recents');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await settle(page);
  await page.mouse.move(0, 0);
  const detail = await page.screenshot({ animations: 'disabled' });
  const detailBox = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="socrates-kb-detail"]')?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  // Mistake book view (filter bar + cards + tab badge).
  if (viewport.width < 768) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
  }
  await page.getByRole('button', { name: /^Mistakes/ }).first().click();
  if (viewport.width < 768) {
    await page.getByRole('button', { name: 'Search chats', exact: true }).first().click();
  }
  await page.getByTestId('socrates-mistakes-panel').waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(() => { const scroller = document.querySelector('#socrates-sidebar-recents'); if (scroller) scroller.scrollTop = 0; });
  await settle(page);
  await page.mouse.move(0, 0);
  const mistakes = await page.screenshot({ animations: 'disabled' });
  if (process.env.PARITY_VERBOSE === '1') {
    const mistakeMetrics = await page.evaluate(() => {
      const measure = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return { tid: el.getAttribute('data-testid') || '', x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, letterSpacing: s.letterSpacing, textTransform: s.textTransform, color: s.color, bg: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopColor} / L ${s.borderLeftWidth} ${s.borderLeftColor} / B ${s.borderBottomWidth} ${s.borderBottomColor}`, display: s.display, ff: s.fontFamily.slice(0, 24), radius: s.borderRadius, padding: s.padding, margin: s.margin, gap: s.gap, opacity: s.opacity, text: (el.children.length ? '' : (el.textContent || '').trim().slice(0, 60)) };
      };
      const walk = (el, depth, out) => { if (!el || depth > 7) return; out.push({ depth, ...measure(el) }); [...el.children].forEach((child) => walk(child, depth + 1, out)); };
      const out = [];
      walk(document.querySelector('[data-testid="socrates-mistakes-panel"]'), 0, out);
      out.push({ depth: -1, ...measure(document.querySelector('[data-testid="socrates-mistakes-badge"]')) });
      out.push({ depth: -1, ...measure(document.querySelector('[data-testid="socrates-mistakes-tab"]')) });
      return out;
    });
    console.log(`[mistakes universal metrics ${viewport.name}] ${JSON.stringify(mistakeMetrics)}`);
  }
  await context.close();
  return { overview, detail, detailBox, mistakes, metrics: tutorMetrics };
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
      const saveScreenshots = process.env.PARITY_SAVE_SHOTS === '1';
      const elementZones = [];
      const addElementZone = (name, spa, universal) => {
        if (!spa || !universal || !Number.isFinite(spa.x) || !Number.isFinite(universal.x)) return;
        const left = Math.max(0, Math.floor(Math.min(spa.x, universal.x)));
        const top = Math.max(0, Math.floor(Math.min(spa.y, universal.y)));
        const right = Math.min(viewport.width, Math.ceil(Math.max(spa.x + spa.width, universal.x + universal.width)));
        const bottom = Math.min(viewport.height, Math.ceil(Math.max(spa.y + spa.height, universal.y + universal.height)));
        if (right > left && bottom > top) elementZones.push({ name, x: left, y: top, right, bottom });
      };
      for (const key of ['composer', 'composerInput', 'effortBtn', 'sendBtn', 'modelName', 'modelSub', 'modelCaret', 'sessionText', 'recentsTitle', 'userName', 'userPlan', 'sidebarLogoText', 'navBadge', 'navBadgeWrap', 'navRow', 'navText', 'navIcon', 'timeText', 'sidebar', 'sidebarFooter', 'avatar', 'newChatBtn', 'topbar', 'userText', 'assistantText', 'firstMsg', 'toolBtn']) {
        addElementZone(key, base[key], uni[key]);
      }
      for (const row of base.recentRows || []) {
        const counterpart = (uni.recentRows || []).find((candidate) => candidate.id === row.id);
        if (counterpart) {
          addElementZone(`recentRow:${row.id}`, row.row, counterpart.row);
          addElementZone(`recentTitle:${row.id}`, row.title, counterpart.title);
        }
      }
      for (let index = 0; index < Math.max(base.effortTexts?.length || 0, uni.effortTexts?.length || 0); index++) {
        addElementZone(`effortText${index}`, base.effortTexts?.[index], uni.effortTexts?.[index]);
      }
      const pixels = await compareScreenshots(browser, base.screenshot, uni.screenshot, viewport, saveScreenshots, elementZones);
      if (saveScreenshots) {
        const artifactDir = join(frontend, 'test-results', 'ui-parity');
        await mkdir(artifactDir, { recursive: true });
        await Promise.all([
          writeFile(join(artifactDir, `${viewport.name}-spa.png`), base.screenshot),
          writeFile(join(artifactDir, `${viewport.name}-universal.png`), uni.screenshot),
          writeFile(join(artifactDir, `${viewport.name}-diff.png`), Buffer.from(pixels.diffPng, 'base64')),
        ]);
      }
      const strictPixels = process.env.PARITY_PIXEL_STRICT === '1';
      const pixelPass = pixels.differentPixels === 0;
      if (strictPixels && !pixelPass) failures += 1;
      lines.push(`  [${strictPixels ? (pixelPass ? 'PASS' : 'FAIL') : 'INFO'}] pixel diff exact ${pixels.differentPixels} (${pixels.exactPct}%) · Δ>12 ${pixels.changedOver12} (${pixels.changedPct}%) · Δ>48 ${pixels.strongOver48} · mean Δ${pixels.meanDelta}${strictPixels ? ' (strict)' : ''}`);
      if (process.env.PARITY_VERBOSE === '1') lines.push(`  [INFO] pixel regions ${JSON.stringify(pixels.regions)}`);
      if (process.env.PARITY_VERBOSE === '1') lines.push(`  [INFO] changed pixel samples ${JSON.stringify(pixels.changedSamples)}`);
      if (process.env.PARITY_VERBOSE === '1') lines.push(`  [INFO] pixel element zones ${JSON.stringify(pixels.elementDiffs)}`);
      if (process.env.PARITY_VERBOSE === '1') {
        const surfacePaint = (probe) => probe && Object.fromEntries(['bg', 'borderWidth', 'borderStyle', 'borderColor', 'borderTopColor', 'radius', 'boxShadow', 'backgroundClip', 'backgroundOrigin', 'opacity', 'filter', 'transform', 'minHeight', 'heightStyle', 'boxSizing', 'display', 'alignItems', 'justifyContent'].map((key) => [key, probe[key]]));
        const labelPaint = (probe) => probe && Object.fromEntries(['x', 'y', 'width', 'height', 'textX', 'textY', 'textWidth', 'textHeight', 'bg', 'borderWidth', 'borderStyle', 'borderColor', 'radius', 'padTop', 'padLeft', 'padRight', 'padBottom', 'display', 'position', 'verticalAlign', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'textRendering'].map((key) => [key, probe[key]]));
        lines.push(`  [INFO] sidebar logo text SPA=${JSON.stringify(labelPaint(base.sidebarLogoText))} Universal=${JSON.stringify(labelPaint(uni.sidebarLogoText))}`);
        lines.push(`  [INFO] nav badge SPA=${JSON.stringify(labelPaint(base.navBadge))} Universal=${JSON.stringify(labelPaint(uni.navBadge))} wrap=${JSON.stringify(labelPaint(uni.navBadgeWrap))}`);
        const toolbarIcons = (probe) => (probe?.visibleSvgs || []).filter((svg) => ['Read aloud', 'Share conversation'].includes(svg.label)).map(({ label, html, x, y, width, height, stroke, strokeWidth, strokeWidthAttr, shapeRendering, overflow, linecap, linejoin, viewBox, shapes }) => ({ label, html, x, y, width, height, stroke, strokeWidth, strokeWidthAttr, shapeRendering, overflow, linecap, linejoin, viewBox, shapes }));
        lines.push(`  [INFO] residual toolbar SVGs SPA=${JSON.stringify(toolbarIcons(base))} Universal=${JSON.stringify(toolbarIcons(uni))}`);
        lines.push(`  [INFO] composer bounds SPA=${JSON.stringify(labelPaint(base.composer))} Universal=${JSON.stringify(labelPaint(uni.composer))}`);
        lines.push(`  [INFO] composer surface paint SPA=${JSON.stringify(surfacePaint(base.composer))} Universal=${JSON.stringify(surfacePaint(uni.composer))}`);
        lines.push(`  [INFO] composer paint stack SPA=${JSON.stringify(base.composer?.paintStack?.slice(0, 8))} Universal=${JSON.stringify(uni.composer?.paintStack?.slice(0, 8))}`);
        lines.push(`  [INFO] effort button paint SPA=${JSON.stringify(surfacePaint(base.effortBtn))} Universal=${JSON.stringify(surfacePaint(uni.effortBtn))}`);
      }
      lines.push(`  [INFO] font raster SPA=${base.assistantText?.fontFamily} (${base.assistantText?.fontSynthesis}) · Universal=${uni.assistantText?.fontFamily} (${uni.assistantText?.fontSynthesis})`);
      if (process.env.PARITY_VERBOSE === '1') lines.push(`  [INFO] SVG renderer SPA=${JSON.stringify((base.visibleSvgs || []).filter((svg) => /Copy|Edit|Delete/i.test(svg.label)).map(({ label, renderer, html, strokeWidth, strokeWidthAttr, parents }) => ({ label, renderer, strokeWidth, strokeWidthAttr, parents, html })))} Universal=${JSON.stringify((uni.visibleSvgs || []).filter((svg) => /Copy|Edit|Delete/i.test(svg.label)).map(({ label, renderer, html, strokeWidth, strokeWidthAttr, parents }) => ({ label, renderer, strokeWidth, strokeWidthAttr, parents, html })))}`);
      lines.push(`  [INFO] font faces SPA=${JSON.stringify(base.fontState)} Universal=${JSON.stringify(uni.fontState)}`);
      lines.push(`  [INFO] glyph box precision SPA=${JSON.stringify({ assistant: base.assistantLeaf && { x: base.assistantLeaf.rawTextX, y: base.assistantLeaf.rawTextY, w: base.assistantLeaf.rawTextWidth, h: base.assistantLeaf.rawTextHeight }, user: base.userText && { x: base.userText.rawTextX, y: base.userText.rawTextY, w: base.userText.rawTextWidth, h: base.userText.rawTextHeight } })} Universal=${JSON.stringify({ assistant: uni.assistantLeaf && { x: uni.assistantLeaf.rawTextX, y: uni.assistantLeaf.rawTextY, w: uni.assistantLeaf.rawTextWidth, h: uni.assistantLeaf.rawTextHeight }, user: uni.userText && { x: uni.userText.rawTextX, y: uni.userText.rawTextY, w: uni.userText.rawTextWidth, h: uni.userText.rawTextHeight } })}`);
      const textStyleDiffs = [];
      const textTagDiffs = [];
      const usedTextRows = new Set();
      for (const item of base.visibleLeafTexts || []) {
        const candidates = (uni.visibleLeafTexts || []).filter((candidate) => candidate.text === item.text && !usedTextRows.has(candidate));
        const candidate = candidates.sort((a, b) => Math.abs(a.x - item.x) + Math.abs(a.y - item.y) - Math.abs(b.x - item.x) - Math.abs(b.y - item.y))[0];
        if (!candidate) continue;
        usedTextRows.add(candidate);
        if (item.tag !== candidate.tag) textTagDiffs.push({ text: item.text, at: `${Math.round(item.x)},${Math.round(item.y)}`, tags: [item.tag, candidate.tag], classes: [item.cls, candidate.cls] });
        const styleProps = ['font', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantNumeric', 'fontVariantEastAsian', 'fontVariantPosition', 'fontVariantAlternates', 'fontVariantEmoji', 'lineHeight', 'letterSpacing', 'wordSpacing', 'color', 'opacity', 'webkitTextFillColor', 'webkitTextStrokeColor', 'textSizeAdjust', 'direction', 'unicodeBidi', 'verticalAlign', 'display', 'position', 'textIndent', 'mixBlendMode', 'backgroundClip', 'textRendering', 'webkitFontSmoothing', 'fontKerning', 'fontSynthesis', 'fontVariant', 'fontVariantCaps', 'fontVariantLigatures', 'fontFeatureSettings', 'fontOpticalSizing', 'fontVariationSettings', 'fontSizeAdjust', 'fontStretch', 'textTransform', 'textAlign', 'whiteSpace', 'wordBreak', 'overflowWrap', 'textDecorationLine', 'textShadow', 'webkitTextStrokeWidth'];
        const changed = styleProps.filter((prop) => item[prop] !== candidate[prop]);
        const geometry = ['x', 'y', 'width', 'height'].filter((prop) => Math.abs(item[prop] - candidate[prop]) > 0.001);
        if (changed.length || geometry.length) textStyleDiffs.push({ text: item.text, at: `${Math.round(item.x)},${Math.round(item.y)}`, tags: [item.tag, candidate.tag], ids: [item.id, candidate.id], classes: [item.cls, candidate.cls], geometry: Object.fromEntries(geometry.map((prop) => [prop, [item[prop], candidate[prop]]])), changed: Object.fromEntries(changed.map((prop) => [prop, [item[prop], candidate[prop]]])) });
      }
      if (textStyleDiffs.length) lines.push(`  [INFO] visible text CSS differences ${JSON.stringify(textStyleDiffs.slice(0, 16))}`);
      if (process.env.PARITY_VERBOSE === '1' && textTagDiffs.length) lines.push(`  [INFO] visible text DOM tag differences ${JSON.stringify(textTagDiffs.slice(0, 24))}`);
      if (process.env.PARITY_VERBOSE === '1') {
        const paintStack = (probe) => (probe?.paintStack || []).map(({ tag, id, cls, color, opacity, filter, textShadow, transform, translate, rotate, scale, transformStyle, willChange, contain, isolation, perspective, backfaceVisibility, mixBlendMode, display, position, verticalAlign, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, whiteSpace, wordBreak, overflowWrap }) => ({ tag, id, cls, color, opacity, filter, textShadow, transform, translate, rotate, scale, transformStyle, willChange, contain, isolation, perspective, backfaceVisibility, mixBlendMode, display, position, verticalAlign, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, whiteSpace, wordBreak, overflowWrap }));
        const paintStackDiffs = ['navText', 'sessionText', 'recentsTitle', 'userName', 'modelName', 'userText', 'assistantLeaf']
          .flatMap((key) => {
            const spa = paintStack(base[key]);
            const universal = paintStack(uni[key]);
            return JSON.stringify(spa) === JSON.stringify(universal) ? [] : [{ key, spa, universal }];
          });
        if (paintStackDiffs.length) lines.push(`  [INFO] text ancestor paint differences ${JSON.stringify(paintStackDiffs)}`);
      }
      const svgDiffs = [];
      const usedSvgs = new Set();
      for (const icon of base.visibleSvgs || []) {
        const remaining = (uni.visibleSvgs || []).filter((candidate) => !usedSvgs.has(candidate));
        const sameLabel = remaining.filter((candidate) => candidate.label === icon.label);
        const candidates = sameLabel.length ? sameLabel : remaining;
        const candidate = candidates.sort((a, b) => (Math.abs(a.x - icon.x) + Math.abs(a.y - icon.y)) - (Math.abs(b.x - icon.x) + Math.abs(b.y - icon.y)))[0];
        if (!candidate) { svgDiffs.push({ label: icon.label, missing: true, at: `${Math.round(icon.x)},${Math.round(icon.y)}` }); continue; }
        usedSvgs.add(candidate);
        // `color` only participates in paint when SVG uses currentColor. Here
        // each shape's computed fill/stroke already captures that resolved
        // paint; RNW otherwise leaves an unused white `color` on the root SVG.
        const signature = ({ viewBox, fill, stroke, strokeWidth, opacity, shapeRendering, overflow, linecap, linejoin, shapes }) => JSON.stringify({ viewBox, fill, stroke, strokeWidth, opacity, shapeRendering, overflow, linecap, linejoin, shapes: shapes.map(({ tag, d, cx, cy, r, x, y, width, height, points, computedFill, computedStroke, vectorEffect }) => [tag, d, cx, cy, r, x, y, width, height, points, computedFill, computedStroke, vectorEffect]) });
        if (signature(icon) !== signature(candidate) || Math.abs(icon.x - candidate.x) > 0.001 || Math.abs(icon.y - candidate.y) > 0.001 || icon.width !== candidate.width || icon.height !== candidate.height) {
          svgDiffs.push({ label: icon.label, matchedLabel: candidate.label, at: `${Math.round(icon.x)},${Math.round(icon.y)}`, box: [[icon.x, icon.y, icon.width, icon.height], [candidate.x, candidate.y, candidate.width, candidate.height]], buttonBox: [icon.buttonBox, candidate.buttonBox], signatures: [signature(icon), signature(candidate)] });
        }
      }
      if (svgDiffs.length) lines.push(`  [INFO] visible SVG differences ${JSON.stringify(svgDiffs.slice(0, 24))}`);
      lines.push(`  [INFO] composer placeholder paint SPA=${JSON.stringify(base.composerPlaceholder)} Universal=${JSON.stringify(uni.composerPlaceholder)}`);
      if (viewport.name === 'desktop') lines.push(`  [INFO] effort SPA=${JSON.stringify({ button: base.effortBtn && { x: base.effortBtn.x, y: base.effortBtn.y, width: base.effortBtn.width, height: base.effortBtn.height }, texts: base.effortTexts?.map(({ x, y, width, height, paint }) => ({ x, y, width, height, paint })) })} Universal=${JSON.stringify({ button: uni.effortBtn && { x: uni.effortBtn.x, y: uni.effortBtn.y, width: uni.effortBtn.width, height: uni.effortBtn.height }, texts: uni.effortTexts?.map(({ x, y, width, height, paint }) => ({ x, y, width, height, paint })) })}`);
      if (viewport.name === 'desktop') {
        const recentListsMatch = JSON.stringify(base.recentTitles) === JSON.stringify(uni.recentTitles);
        if (!recentListsMatch) failures += 1;
        lines.push(`  [${recentListsMatch ? 'PASS' : 'FAIL'}] recents fixture SPA=${JSON.stringify(base.recentTitles)} Universal=${JSON.stringify(uni.recentTitles)}`);
      }
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
        { label: 'model.label', expected: base.modelSub?.text, actual: uni.modelSub?.text, ok: base.modelSub?.text === uni.modelSub?.text },
        { label: 'model.brand', expected: base.modelName?.text, actual: uni.modelName?.text, ok: base.modelName?.text === uni.modelName?.text },
        { label: 'model.brand fits', expected: base.modelName?.textClipped, actual: uni.modelName?.textClipped, ok: base.modelName?.textClipped === false && uni.modelName?.textClipped === false },
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
      {
        for (const key of ['sidebar', 'newChat', 'summary', 'find', 'share']) {
          if (viewport.name !== 'mobile' && (key === 'sidebar' || key === 'newChat')) continue;
          const a = base.topbarControls?.[key];
          const b = uni.topbarControls?.[key];
          if (!a || !b) {
            const ok = !a && !b;
            if (!ok) failures += 1;
            lines.push(`  [${ok ? 'PASS' : 'FAIL'}] pair topbar.${key}.presence SPA=${!!a} Universal=${!!b}`);
            continue;
          }
          if (key === 'summary' && viewport.name === 'mobile') {
            const pick = (node) => node && Object.fromEntries(['x', 'y', 'width', 'height', 'display', 'alignItems', 'justifyContent', 'lineHeight', 'fontFamily', 'fontSize', 'fontWeight', 'color', 'styleAttr', 'tag', 'cls'].map((prop) => [prop, node[prop]]));
            lines.push(`  [INFO] summary DOM SPA=${JSON.stringify({ button: pick(a), icon: pick(a.svg), label: pick(a.labelText) })}`);
            lines.push(`  [INFO] summary DOM Universal=${JSON.stringify({ button: pick(b), icon: pick(b.svg), label: pick(b.labelText) })}`);
          }
          for (const prop of ['x', 'y', 'width', 'height', 'bg', 'opacity']) {
            const tolerance = ['x', 'y', 'width', 'height'].includes(prop) ? TOL.px : 0;
            const row = checkRow(`pair topbar.${key}.${prop}`, a[prop], b[prop], tolerance);
            if (!row.ok) failures += 1;
            lines.push(`  [${row.ok ? 'PASS' : 'FAIL'}] ${row.label.padEnd(22)} SPA ${String(row.expected)} Universal ${row.actual}`);
          }
          for (const prop of ['viewBox', 'fill', 'strokeWidth', 'effectiveStroke', 'linecap', 'shapes']) {
            const expected = a.svg?.[prop] ?? null;
            const actual = b.svg?.[prop] ?? null;
            const ok = JSON.stringify(expected) === JSON.stringify(actual);
            if (!ok) failures += 1;
            lines.push(`  [${ok ? 'PASS' : 'FAIL'}] pair topbar.${key}.svg.${prop} SPA ${JSON.stringify(expected)} Universal ${JSON.stringify(actual)}`);
          }
          if (a.svg && b.svg) {
            for (const prop of ['x', 'y', 'width', 'height']) {
              const row = checkRow(`pair topbar.${key}.svg.${prop}`, a.svg[prop], b.svg[prop], TOL.px);
              if (!row.ok) failures += 1;
              if (!row.ok) lines.push(`  [FAIL] ${row.label} SPA ${row.expected} Universal ${row.actual}`);
            }
          }
          if (a.labelText || b.labelText) {
            for (const prop of ['x', 'y', 'width', 'height', 'textX', 'textY', 'textWidth', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'fontFamily']) {
              const expected = a.labelText?.[prop] ?? null;
              const actual = b.labelText?.[prop] ?? null;
              const tolerance = ['x', 'y', 'width', 'height', 'textX', 'textY', 'textWidth'].includes(prop) ? 0.1 : 0;
              const row = checkRow(`pair topbar.${key}.label.${prop}`, expected, actual, tolerance);
              if (!row.ok) failures += 1;
              if (!row.ok) lines.push(`  [FAIL] ${row.label} SPA ${JSON.stringify(expected)} Universal ${JSON.stringify(actual)}`);
            }
          }
        }
        for (const key of ['assistantText', 'assistantLeaf', 'userText', 'navText', 'modelName', 'recentsTitle', 'timeText', 'sessionText', 'userName']) {
          const expected = base[key]?.paintStack;
          const actual = uni[key]?.paintStack;
          if (!expected || !actual) continue;
          const paint = (stack) => ({
            foreground: stack[0]?.color,
            composite: stack.slice(1).map(({ opacity, filter, textShadow, transform }) => ({
              opacity, filter, textShadow,
              transform: transform === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : transform,
            })).filter((entry) => entry.opacity !== '1' || entry.filter !== 'none' || entry.textShadow !== 'none' || entry.transform !== 'none'),
          });
          const expectedPaint = paint(expected);
          const actualPaint = paint(actual);
          if (JSON.stringify(expectedPaint) === JSON.stringify(actualPaint)) continue;
          failures += 1;
          lines.push(`  [FAIL] pair paintStack.${key} SPA ${JSON.stringify(expectedPaint)} Universal ${JSON.stringify(actualPaint)}`);
        }
        for (const prop of ['color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textRendering', 'webkitFontSmoothing', 'fontKerning', 'fontFeatureSettings', 'fontOpticalSizing', 'textX', 'textY', 'textWidth', 'textHeight']) {
          const expected = base.assistantLeaf?.[prop] ?? null;
          const actual = uni.assistantLeaf?.[prop] ?? null;
          const tolerance = ['textX', 'textY', 'textWidth', 'textHeight'].includes(prop) ? 0.1 : 0;
          const row = checkRow(`pair assistantLeaf.${prop}`, expected, actual, tolerance);
          if (!row.ok) failures += 1;
          if (!row.ok) lines.push(`  [FAIL] ${row.label} SPA ${JSON.stringify(expected)} Universal ${JSON.stringify(actual)}`);
        }
        for (const key of ['assistantText', 'assistantLeaf', 'userText', 'navText', 'timeText', 'sessionText', 'recentsTitle', 'userName', 'modelName', 'modelSub']) {
          for (const prop of ['color', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'wordSpacing', 'fontKerning', 'fontSynthesis', 'fontVariant', 'fontVariantCaps', 'fontVariantLigatures', 'fontFeatureSettings', 'fontOpticalSizing', 'fontVariationSettings', 'fontSizeAdjust', 'textRendering', 'webkitFontSmoothing', 'textTransform', 'textIndent', 'textAlign', 'whiteSpace', 'wordBreak', 'overflowWrap', 'textDecorationLine', 'textDecorationStyle', 'textDecorationColor', 'textDecorationThickness']) {
            if (!base[key] || !uni[key]) continue;
            const expected = base[key]?.[prop] ?? null;
            const actual = uni[key]?.[prop] ?? null;
            const row = checkRow(`pair ${key}.${prop}`, expected, actual, 0);
            if (!row.ok) {
              failures += 1;
              lines.push(`  [FAIL] ${row.label} SPA ${JSON.stringify(expected)} Universal ${JSON.stringify(actual)}`);
            }
          }
        }
      }
      if (base.messageActions && uni.messageActions) {
        const a = base.messageActions;
        const b = uni.messageActions;
        if (a.length !== b.length) {
          failures += 1;
          lines.push(`  [FAIL] pair messageActions.count SPA=${a.length} Universal=${b.length}`);
          lines.push(`        ↳ Universal action labels: ${JSON.stringify(b.map((action) => action.label))}`);
        }
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
          if (a[i].label !== b[i].label) {
            failures += 1;
            lines.push(`  [FAIL] pair messageActions[${i}].label SPA=${a[i].label} Universal=${b[i].label}`);
          }
          for (const prop of ['x', 'y', 'width', 'height']) {
            const row = checkRow(`pair messageActions[${i}].${prop}`, a[i].button[prop], b[i].button[prop], TOL.px);
            if (!row.ok) {
              failures += 1;
              lines.push(`  [FAIL] ${row.label} SPA=${row.expected} Universal=${row.actual}`);
            }
          }
          for (const prop of ['x', 'y', 'width', 'height', 'stroke', 'strokeWidth', 'linecap', 'linejoin', 'shapes']) {
            const expected = a[i].svg?.[prop] ?? null;
            const actual = b[i].svg?.[prop] ?? null;
            if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
            failures += 1;
            lines.push(`  [FAIL] pair messageActions[${i}].svg.${prop} SPA=${JSON.stringify(expected)} Universal=${JSON.stringify(actual)}`);
            if (prop === 'strokeWidth') {
              lines.push(`        ↳ stroke attrs SPA=${a[i].svg?.strokeWidthAttr} Universal=${b[i].svg?.strokeWidthAttr} · labels SPA=${a[i].label} Universal=${b[i].label}`);
            }
          }
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

    // Tutor knowledge view is a separate visual state from chat: compare the
    // same persisted plan, boundary nodes, history and expanded node detail
    // on both shells at each viewport.
    for (const viewport of VIEWPORTS) {
      const base = await shotTutorBaseline(browser, viewport);
      const uni = await shotTutorUniversal(browser, viewport);
      const tutorZones = [];
      for (const name of ['sidebar', 'plan', 'planTitle', 'planProgress', 'planRow', 'knowledgePanel', 'kb', 'kbHeader', 'kbTitle', 'kbMeta', 'kbSnapshot', 'kbGraphWrap', 'kbGraph', 'kbGraphFrame', 'kbSection', 'backdrop', 'transcript']) {
        const a = base.metrics?.[name];
        const b = uni.metrics?.[name];
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
        const x = Math.max(0, Math.floor(Math.min(a.x, b.x)));
        const y = Math.max(0, Math.floor(Math.min(a.y, b.y)));
        const right = Math.min(viewport.width, Math.ceil(Math.max(a.x + a.w, b.x + b.w)));
        const bottom = Math.min(viewport.height, Math.ceil(Math.max(a.y + a.h, b.y + b.h)));
        if (right > x && bottom > y) tutorZones.push({ name, x, y, right, bottom });
      }
      for (const state of ['overview', 'detail', 'mistakes']) {
        // Detail panels sit at different scroll offsets per shell, so crop to
        // the panel boxes (same origin) instead of comparing scroll position.
        // Height mismatch is reported alongside, not hidden: only the shared
        // prefix is pixel-compared.
        let crop = null;
        if (state === 'detail' && base.detailBox && uni.detailBox) {
          const width = Math.floor(Math.min(base.detailBox.w, uni.detailBox.w));
          const height = Math.floor(Math.min(base.detailBox.h, uni.detailBox.h));
          crop = {
            ax: Math.round(base.detailBox.x), ay: Math.round(base.detailBox.y),
            bx: Math.round(uni.detailBox.x), by: Math.round(uni.detailBox.y),
            width, height,
          };
          lines.push(`  [INFO] detail panel SPA=${base.detailBox.w.toFixed(1)}x${base.detailBox.h.toFixed(1)}@${Math.round(base.detailBox.y)} Universal=${uni.detailBox.w.toFixed(1)}x${uni.detailBox.h.toFixed(1)}@${Math.round(uni.detailBox.y)} crop=${width}x${height}`);
        }
        const pixels = await compareScreenshots(browser, base[state], uni[state], viewport, process.env.PARITY_SAVE_SHOTS === '1', state === 'detail' ? [] : tutorZones, crop);
        const strictPixels = process.env.PARITY_PIXEL_STRICT === '1';
        const pixelPass = pixels.differentPixels === 0;
        if (strictPixels && !pixelPass) failures += 1;
        lines.push(`\n===== tutor ${state === 'mistakes' ? 'mistake book' : `knowledge ${state}`} · ${viewport.name} ${viewport.width}x${viewport.height} =====`);
        lines.push(`  [${strictPixels ? (pixelPass ? 'PASS' : 'FAIL') : 'INFO'}] pixel diff exact ${pixels.differentPixels} (${pixels.exactPct}%) · Δ>12 ${pixels.changedOver12} (${pixels.changedPct}%) · Δ>48 ${pixels.strongOver48} · mean Δ${pixels.meanDelta}${strictPixels ? ' (strict)' : ''}`);
        if (process.env.PARITY_VERBOSE === '1') lines.push(`  [INFO] tutor element zones ${JSON.stringify(pixels.elementDiffs)} strong samples=${JSON.stringify(pixels.strongSamples)}`);
        if (process.env.PARITY_VERBOSE === '1' && viewport.width <= 768) lines.push(`  [INFO] mobile diff split sidebar=${pixels.sidebarDiff} outsideDrawer=${pixels.outsideDrawerDiff} areas=${JSON.stringify(pixels.outsideDrawerRegions)} samples=${JSON.stringify(pixels.outsideDrawerSamples)}`);
        if (process.env.PARITY_SAVE_SHOTS === '1') {
          const artifactDir = join(frontend, 'test-results', 'ui-parity');
          await mkdir(artifactDir, { recursive: true });
          await Promise.all([
            writeFile(join(artifactDir, `tutor-${state}-${viewport.name}-spa.png`), base[state]),
            writeFile(join(artifactDir, `tutor-${state}-${viewport.name}-universal.png`), uni[state]),
            writeFile(join(artifactDir, `tutor-${state}-${viewport.name}-diff.png`), Buffer.from(pixels.diffPng, 'base64')),
          ]);
        }
      }
    }
  } finally {
    await browser.close();
    rnSrv.close();
    baselineSrv.kill();
  }
  const compactLines = lines.filter((line) =>
    line.trimStart().startsWith('=====') || line.includes('pixel diff') || line.includes('[FAIL]')
    || line.includes('visible text CSS differences') || line.includes('visible SVG differences')
    || line.includes('[PASS] recents fixture'));
  console.log((process.env.PARITY_VERBOSE === '1' ? lines : compactLines).join('\n'));
  console.log(`\n[parity-check] ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
}

await main();
