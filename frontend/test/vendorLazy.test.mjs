import test from 'node:test';
import assert from 'node:assert/strict';

/* The vendored-loaders module is browser-only (it reads `window` and builds
   <script>/<link> elements), but its contracts are exactly the ones that broke
   production before: dedupe concurrent loads, retry transient network failures,
   never let a rejected promise poison the cache for the rest of the session,
   and fire KaTeX listeners once when the library finally arrives. Each test
   installs a fresh module instance so module-level `inflight`/attempt state
   cannot leak between cases. */

function makeDom() {
  const appended = [];
  return {
    appended,
    createElement(tag) {
      return {
        tag,
        dataset: {},
        set src(v) { this._src = v; },
        get src() { return this._src; },
      };
    },
    head: {
      appendChild(node) { appended.push(node); return node; },
    },
    querySelector() { return null; },
  };
}

async function freshLoader() {
  const win = {};
  const dom = makeDom();
  globalThis.window = win;
  globalThis.document = dom;
  // Cache-bust so each case gets its own `inflight` / attempt counters.
  const mod = await import(`../src/vendor/lazy.ts?t=${Math.random()}`);
  return { ...mod, win, dom };
}

test.afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

test('a vendored script resolves once it loads and publishes its global', async () => {
  const { ensureHighlight, win, dom } = await freshLoader();
  const pending = ensureHighlight();
  const script = dom.appended.at(-1);
  assert.equal(script.tag, 'script');
  assert.match(script.src, /highlight\.min\.js$/);
  win.hljs = { highlight: true };
  script.onload();
  assert.equal((await pending).highlight, true);
});

test('concurrent callers share one injection instead of racing', async () => {
  const { ensureEcharts, win, dom } = await freshLoader();
  const a = ensureEcharts();
  const b = ensureEcharts();
  assert.equal(dom.appended.length, 1, 'second caller must not inject another tag');
  win.echarts = 'EC';
  dom.appended[0].onload();
  assert.equal(await a, 'EC');
  assert.equal(await b, 'EC');
});

test('an already-present global short-circuits without touching the DOM', async () => {
  const { ensurePlotly, win, dom } = await freshLoader();
  win.Plotly = 'READY';
  assert.equal(await ensurePlotly(), 'READY');
  assert.equal(dom.appended.length, 0);
});

test('a script that loads without publishing its global rejects', async () => {
  const { ensureMermaid, dom } = await freshLoader();
  const pending = ensureMermaid();
  // Loads successfully but window.mermaid never appears — a packaging bug.
  dom.appended[0].onload();
  await assert.rejects(pending, /loaded but global mermaid is missing/);
});

test('a missing browser rejects rather than hanging forever', async () => {
  delete globalThis.window;
  delete globalThis.document;
  const mod = await import(`../src/vendor/lazy.ts?nobrowser=${Math.random()}`);
  await assert.rejects(mod.ensureMermaid(), /requires a browser/);
});

test('a transient failure retries and the retry succeeds', async (t) => {
  // Enable fake timers before onerror() schedules the backoff, otherwise the
  // real timer is used and tick() has nothing to fire.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ensureMermaid, win, dom } = await freshLoader();
  const pending = ensureMermaid();
  dom.appended[0].onerror();           // first attempt fails
  t.mock.timers.tick(800);             // 700ms * attempts
  const retry = dom.appended.at(-1);
  assert.equal(dom.appended.length, 2, 'a failed attempt must be retried');
  win.mermaid = 'RECOVERED';
  retry.onload();
  assert.equal(await pending, 'RECOVERED');
});

test('an exhausted retry clears the cache so a later call can try again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { ensureMermaid, dom } = await freshLoader();
  const pending = ensureMermaid();
  for (const wait of [800, 2100]) {
    dom.appended.at(-1).onerror();
    t.mock.timers.tick(wait);
  }
  dom.appended.at(-1).onerror();       // third and final attempt
  await assert.rejects(pending, /failed to load mermaid/);
  // The poisoned entry must be gone, so the next call re-injects rather than
  // replaying the rejected promise forever.
  ensureMermaid();
  assert.equal(dom.appended.length, 4, 'cache should be cleared after exhaustion');
});

test('onKatexReady fires immediately when katex is already loaded', async () => {
  const { onKatexReady, win } = await freshLoader();
  win.katex = { version: '0.16' };
  let called = 0;
  const off = onKatexReady(() => { called += 1; });
  assert.equal(called, 1);
  off();
});

test('pending katex listeners fire once the library loads', async () => {
  const { ensureKatex, onKatexReady, win, dom } = await freshLoader();
  const order = [];
  onKatexReady(() => order.push('first'));
  const offSecond = onKatexReady(() => order.push('second'));
  offSecond();                        // unsubscribe before load
  const pending = ensureKatex();
  win.katex = 'K';
  dom.appended[0].onload();
  await pending;
  assert.deepEqual(order, ['first'], 'only still-subscribed listeners fire');
});

test('a throwing katex listener does not break the others', async () => {
  const { ensureKatex, onKatexReady, win, dom } = await freshLoader();
  const order = [];
  onKatexReady(() => { throw new Error('listener blew up'); });
  onKatexReady(() => order.push('survivor'));
  const pending = ensureKatex();
  win.katex = 'K';
  dom.appended[0].onload();
  assert.equal(await pending, 'K');
  assert.deepEqual(order, ['survivor']);
});

test('the katex stylesheet is injected exactly once', async () => {
  const { ensureKatex, win, dom } = await freshLoader();
  const pending = ensureKatex();
  win.katex = 'K';
  dom.appended[0].onload();
  await pending;
  const links = dom.appended.filter((node) => node.tag === 'link');
  assert.equal(links.length, 1);
  assert.equal(links[0].rel, 'stylesheet');
  assert.match(links[0].href, /katex\.min\.css$/);
});
