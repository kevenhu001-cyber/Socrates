import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Skeleton and chart invariants (2026-11-19 consistency pass).
 *
 * 1. Every skeleton placeholder fills the measure of whatever holds it, so a
 *    streamed card lands on the pixels it reserved instead of reflowing.
 * 2. `.tool-inline-attachments` is a flex row: a child without its own width
 *    collapses to min-content. The visualization skeleton is rendered there
 *    directly, so it must not.
 * 3. `chart` and `visualization` are one card contract — a `chart` node that
 *    carries a template draws through the same renderer as `visualization`. */

const msg = (clientId, rawText) => ({
  clientId,
  role: 'assistant',
  type: 'assistant',
  _streamSettled: true,
  rawText,
  html: '',
});
const row = (page, clientId) => page.locator(`[data-client-id="${clientId}"]`).first();

async function open(page, messages, { viewport, colorScheme = 'light' } = {}) {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), colorScheme);
  await prepareChatWorkbench(page, { messages, viewport, lang: 'zh', allowGlobalErrors: true });
}

/** The element's border-box width against its parent's *content* box. */
async function fillRatio(page, selector) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element.parentElement);
      const inner =
        element.parentElement.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      return { width: element.getBoundingClientRect().width, inner };
    });
}

/** Stub the chat stream so a turn stays open and frames can be pushed. */
async function openLiveTurn(page, prompt) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    let push = null;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (!url.includes('/chat/stream')) return nativeFetch(input, init);
      const stream = new ReadableStream({
        start(controller) {
          push = (text) => controller.enqueue(encoder.encode(text));
          window.__outPushFrame = (event, data) => push(frame(event, data));
          window.__outText = (content) =>
            push('data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n');
          window.__outFinish = () => {
            push('data: [DONE]\n\n');
            controller.close();
          };
        },
      });
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      );
    };
  });
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate((text) => {
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({
      session: { currentSessionId: '77777777-7777-4777-8777-777777777777' },
    });
    window.__socratesTestState.patch({
      session: { messages: [{ clientId: 'live-user', role: 'user', rawText: text, html: null }] },
    });
    window.__testActivateMainView('chatView');
    window.__turnPromise = window.askChatTurn(text);
  }, prompt);
  await page.waitForFunction(() => typeof window.__outPushFrame === 'function', null, {
    timeout: 15_000,
  });
}

function functionSpec(title) {
  return {
    version: 1,
    template: 'function',
    title,
    caption: 'caption with math $y = x^2$',
    accessibilitySummary: 'The graph of y equals x squared.',
    payload: {
      functions: [{ expression: 'x^2', label: 'y = x^2' }],
      xRange: [-3, 3],
      yRange: [-1, 9],
    },
  };
}

test('a streamed scaffold skeleton spans the card it is about to become', async ({ page }) => {
  await open(page, []);
  await page.evaluate(async () => {
    window.__skelCtl = await window.addStreamingMessage({ userPrompt: '测试实时卡片' });
    /* An open practice card whose problem body has not started yet: the body
       is one placeholder line, and it must cover the width the text will. */
    window.__skelCtl.append('已经输出的正文。\n\n<practice>');
  });
  const preview = page.locator('.sc-live').first();
  await expect(preview).toBeVisible();
  const skeleton = preview.locator('.sc-live-body > .sc-live-skeleton').first();
  await expect(skeleton).toBeVisible();
  const { width, inner } = await fillRatio(page, '.sc-live-body > .sc-live-skeleton');
  expect(width).toBeGreaterThan(inner * 0.98);
});

test('the visualization skeleton fills the flex row that holds it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLiveTurn(page, 'Run it');
  /* A call whose arguments already name the chart but whose result has not
     landed: the skeleton is the only thing on screen. */
  await page.evaluate(
    (input) =>
      window.__outPushFrame('tool_use', [
        {
          id: 'viz-skel',
          name: 'render_intelligent_ui',
          input: { version: 1, nodes: [{ ...input, id: 'visual', type: 'visualization' }] },
        },
      ]),
    functionSpec('Probe skeleton'),
  );
  const skeleton = page.locator('.viz-state-skeleton').last();
  await expect(skeleton).toBeVisible();
  const { width, inner } = await fillRatio(page, '.viz-state-skeleton');
  /* `.tool-inline-attachments` is `display:flex; flex-wrap:wrap`, so a child
     with no width of its own collapsed to the title bar's min-content. */
  expect(width).toBeGreaterThan(inner * 0.98);
});

test('a chart node draws through the same card as a visualization node', async ({ page }) => {
  const spec = functionSpec('Same contract');
  const call = (id, type) => ({
    id,
    name: 'render_intelligent_ui',
    input: { version: 1, nodes: [{ ...spec, id, type }] },
    output: 'Visualization ready',
    visualizations: [{ ...spec, nodeId: id, index: 0 }],
    durationMs: 400,
    status: 'completed',
    textOffset: 0,
  });
  const sessionId = '88888888-8888-4888-8888-888888888888';
  await mockAuthedApp(page);
  await page.route(new RegExp('/api/(?:v2/)?sessions/' + sessionId + '(?:\\?.*)?$'), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: sessionId,
        topic: 'Chart node contract',
        title: 'Chart node contract',
        domain: 'math',
        mode: 'chat',
        kind: 'chat',
        phase: 'chat',
        messages: [
          { id: 'u1', role: 'user', rawText: 'Draw two', html: '<p>Draw two</p>' },
          {
            id: 'a1',
            role: 'assistant',
            rawText: 'Both cards.',
            html: '<p>stale snapshot</p>',
            toolCalls: [call('visual', 'visualization'), call('chart-node', 'chart')],
          },
        ],
        kbNodes: [],
        mistakes: [],
      }),
    }),
  );
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForFunction(() => typeof window.loadSession === 'function', null, {
    timeout: 15_000,
  });
  await page.evaluate((id) => window.loadSession(id), sessionId);
  /* Both node spellings reach the reader as the same card: same host class,
     same engine slot. */
  const cards = page
    .locator('#msgList .msg.assistant')
    .last()
    .locator('.intui-chart .visualization-card');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card.locator('.visualization-stage')).toBeVisible();
  }
});
