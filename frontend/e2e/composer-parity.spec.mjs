// e2e/composer-parity.spec.mjs — the landing composer (#topicInputWrap) is the
// single source of truth; the in-session composer (#chatInputWrap) must match
// it exactly: same DOM shape, same class vocabulary, same computed geometry and
// paint, on desktop and phone, in light and dark themes.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

async function boot(page, { width, height, theme }) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((theme) => {
    localStorage.setItem('socrates-theme', theme);
    localStorage.setItem('socrates-websearch', 'false');
  }, theme);
  await mockAuthedApp(page, { lang: 'en' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

async function enterChat(page) {
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
  });
  await page.waitForTimeout(350);
}

/* Classes that only name WHICH surface an element belongs to (kept for the
   JS that targets one surface) or transient state; everything else is shared
   vocabulary and must be identical. */
const SURFACE_OR_STATE = new Set([
  'topic-input-wrap', 'chat-input-wrap', 'start-btn', 'send-btn',
  'hidden', 'composer-multiline', 'is-empty', 'is-focused', 'has-draft',
  'is-streaming', 'is-recording', 'voice-recording-active', 'has-text', 'active', 'composer-focused',
]);

function describe(page, sel) {
  return page.evaluate(({ sel, skip }) => {
    const wrap = document.querySelector(sel);
    if (!wrap) return null;
    const skipSet = new Set(skip);
    /* DOM shape: depth + shared classes of every element down to the
       controls, stopping at the editor root (its inside is TipTap's) and svg. */
    const shape = [];
    const walk = (el, depth) => {
      for (const child of el.children) {
        if (child.tagName === 'INPUT' && child.type === 'file') continue;
        const cls = [...child.classList].filter((c) => !skipSet.has(c)).sort().join('.');
        shape.push(`${depth}:${child.tagName.toLowerCase()}.${cls}`);
        if (child.tagName === 'svg' || child.classList.contains('composer-editor-root')) continue;
        if (child.id === 'startBtnContent' || child.id === 'sendBtnContent') continue;
        walk(child, depth + 1);
      }
    };
    walk(wrap, 0);

    const px = (v) => Math.round(parseFloat(v) * 10) / 10;
    const box = (el) => {
      if (!el || !el.getClientRects().length) return { visible: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0,
        w: Math.round(r.width), h: Math.round(r.height),
        radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, color: cs.color,
      };
    };
    const ws = getComputedStyle(wrap);
    const wr = wrap.getBoundingClientRect();
    const editor = wrap.querySelector('.rich-composer-editor');
    const es = editor ? getComputedStyle(editor) : null;
    const tracks = ws.gridTemplateColumns.split(' ').filter(Boolean);
    return {
      shape,
      shell: {
        h: Math.round(wr.height), w: Math.round(wr.width),
        padding: ws.padding, border: `${ws.borderTopWidth} ${ws.borderTopStyle} ${ws.borderTopColor}`,
        radius: ws.borderTopLeftRadius, bg: ws.backgroundColor, shadow: ws.boxShadow,
        display: ws.display, areas: ws.gridTemplateAreas, trackCount: tracks.length,
        // All tracks except the flexible editor column.
        fixedTracks: tracks.filter((_, i) => i !== 1).map(px),
      },
      editor: es ? { fontSize: es.fontSize, lineHeight: es.lineHeight, padding: es.padding, color: es.color } : null,
      plus: box(wrap.querySelector('.composer-tools-trigger')),
      effort: box(wrap.querySelector('.effort-trigger')),
      mic: box(wrap.querySelector('.mobile-mic-btn')),
      primary: box(wrap.querySelector('#startBtn, #sendBtn')),
    };
  }, { sel, skip: [...SURFACE_OR_STATE] });
}

function diff(a, b, path = '') {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return [`${path}: topic=${JSON.stringify(a)} chat=${JSON.stringify(b)}`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => diff(a[k], b[k], path ? `${path}.${k}` : k));
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`chat composer matches the landing composer (${vp.name}, ${theme})`, async ({ page }) => {
      await boot(page, { ...vp, theme });
      const topic = await describe(page, '#topicInputWrap');
      await enterChat(page);
      const chat = await describe(page, '#chatInputWrap');
      expect(topic, 'landing composer present').not.toBeNull();
      expect(chat, 'chat composer present').not.toBeNull();
      const { shape: topicShape, ...topicRest } = topic;
      const { shape: chatShape, ...chatRest } = chat;
      expect.soft(chatShape, 'same DOM shape and class vocabulary').toEqual(topicShape);
      expect.soft(diff(topicRest, chatRest), 'computed style differences').toEqual([]);
      expect(chat.effort.visible, 'effort picker shown in the conversation').toBe(true);
    });
  }
}
