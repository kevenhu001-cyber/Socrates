import { expect, test } from '@playwright/test';
import { gotoAndSettle, publishChatRuntime } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The global error guard (src/app/errorGuard.ts) paints this banner for any
   uncaught error. A workbench page must never show it: an uncaught error is
   a bug, and a screenshot or spec that tolerates the banner hides it. */
export const GLOBAL_ERROR_BANNER = '#__socrates_global_err_banner';

function inTest() {
  try { return Boolean(test.info()); } catch { return false; }
}

function flagWorkbenchError(page, kind, detail) {
  const record = { kind, detail: String(detail).slice(0, 2000) };
  page.__workbenchErrors.push(record);
  if (inTest()) {
    expect.soft(record, `workbench ${kind}: the page raised an uncaught error`).toBeNull();
  } else {
    console.error(`[workbench] ${kind}:`, record.detail);
  }
}

/* Idempotent: listens for uncaught page errors and for the guard's banner
   (a MutationObserver reports it through a binding, so a banner raised after
   preparation still fails the test). */
async function watchGlobalErrors(page) {
  if (page.__workbenchErrors) return;
  page.__workbenchErrors = [];
  page.on('pageerror', (error) => {
    /* Only the app's own documents count: a spec's init script throwing on
       about:blank (no storage access) is not an app error. */
    if (!/^https?:/.test(page.url())) return;
    flagWorkbenchError(page, 'pageerror', error.stack || error.message);
  });
  await page.exposeBinding('__workbenchBanner', (_source, text) => flagWorkbenchError(page, 'error-banner', text));
  await page.addInitScript((selector) => {
    const report = () => {
      const banner = document.querySelector(selector);
      if (!banner || banner.dataset.workbenchReported) return;
      banner.dataset.workbenchReported = '1';
      window.__workbenchBanner(banner.textContent || '');
    };
    const start = () => new MutationObserver(report).observe(document.body, { childList: true });
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  }, GLOBAL_ERROR_BANNER);
}

/** Uncaught errors / banners the workbench saw on this page so far. */
export function workbenchErrors(page) {
  return page.__workbenchErrors ? [...page.__workbenchErrors] : [];
}

/** Hard assertion: no banner on screen and no uncaught error recorded. */
export async function expectNoGlobalError(page) {
  await expect(page.locator(GLOBAL_ERROR_BANNER)).toHaveCount(0);
  expect(workbenchErrors(page)).toEqual([]);
}

export const WORKBENCH_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
});

export async function prepareChatWorkbench(page, options = {}) {
  const viewport = options.viewport || WORKBENCH_VIEWPORTS.desktop;
  await page.setViewportSize(viewport);
  if (!options.allowGlobalErrors) await watchGlobalErrors(page);
  await mockAuthedApp(page, { lang: options.lang || 'en' });
  if (options.streamBody) {
    await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
      await route.fulfill({
        status: options.streamStatus || 200,
        contentType: options.streamContentType || 'text/event-stream',
        body: options.streamBody,
      });
    });
  }
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.evaluate(({ sessionId, messages }) => {
    window.stateStore.dispatch({ type: "state/set", key: "phase", value: 'chat' });
    window.stateStore.dispatch({ type: "state/set", key: "topic", value: 'Workbench fixture' });
    window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    if (window.stateStore.read("session")) window.stateStore.dispatch({ type: "state/set", key: "currentSessionId", value: sessionId });
    window.stateStore.dispatch({ type: "state/set", key: "messages", value: Array.isArray(messages) ? messages : [] });
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  }, {
    sessionId: options.sessionId || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    messages: options.messages || [],
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'workbench-fixture' });
  /* Messages are dispatched into the store above and rendered by a React
     root; wait for the first row so a spec's first measurement never sees
     an empty transcript. */
  if (Array.isArray(options.messages) && options.messages.length > 0) {
    await expect(page.locator('#msgList .msg').first()).toBeVisible();
  }
  if (!options.allowGlobalErrors) await expectNoGlobalError(page);
}

export function textFrame(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

export function reasoningFrame(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: text } }] })}\n\n`;
}

export function namedFrame(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function completeFrame() {
  return 'data: [DONE]\n\n';
}

export async function snapshotWorkbenchGeometry(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const value = node.getBoundingClientRect();
      return {
        top: Math.round(value.top),
        right: Math.round(value.right),
        bottom: Math.round(value.bottom),
        left: Math.round(value.left),
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    };
    return {
      app: rect('#appShell'),
      content: rect('#mainContent'),
      sidebar: rect('#sidebar'),
      topbar: rect('.top-bar'),
      transcript: rect('#msgList'),
      composer: rect('#composerInputWrap'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}
