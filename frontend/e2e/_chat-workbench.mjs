import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

export const WORKBENCH_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  mobile: Object.freeze({ width: 390, height: 844 }),
});

export async function prepareChatWorkbench(page, options = {}) {
  const viewport = options.viewport || WORKBENCH_VIEWPORTS.desktop;
  await page.setViewportSize(viewport);
  await mockAuthedApp(page);
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
    window.state.phase = 'chat';
    window.state.topic = 'Workbench fixture';
    window.state.currentSessionId = sessionId;
    if (window.state.session) window.state.session.currentSessionId = sessionId;
    window.state.messages = Array.isArray(messages) ? messages : [];
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('mainInner')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.dataset.conversationActive = 'true';
    window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'workbench-fixture' });
  }, {
    sessionId: options.sessionId || 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    messages: options.messages || [],
  });
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
      sidebar: rect('#sidebar'),
      topbar: rect('.top-bar'),
      transcript: rect('#msgList'),
      composer: rect('#chatInputWrap'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}
