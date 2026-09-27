#!/usr/bin/env node
/* perf/bench.mjs — reproducible benchmark for the three hot paths users feel:
 *   switching between history sessions (cold + warm), starting a new chat,
 *   and sending a message (bubble → first token → stream end, jank while
 *   streaming).
 *
 * Usage (after `npm run build`):
 *   node perf/bench.mjs --label before [--runs 3] [--cpu 4] [--latency 120]
 *   node perf/bench.mjs --compare perf/results/before.json perf/results/after.json
 *
 * Timings are measured inside the page, from the trusted pointerdown event's
 * timeStamp to the first animation frame where the target content is in the
 * DOM, so harness overhead (CDP round-trips) is excluded.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBenchServer } from './bench-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };

if (args[0] === '--compare') { compare(args[1], args[2]); process.exit(0); }

const LABEL = arg('label', 'run');
const RUNS = Number(arg('runs', 3));
const CPU = Number(arg('cpu', 4));
const LATENCY = Number(arg('latency', 120));
const PORT = Number(arg('port', 4391));

/* ---------- in-page instrumentation ---------- */
function instrument() {
  const B = (window.__bench = { longtasks: [], events: [], lastPointer: 0 });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) B.longtasks.push([e.startTime, e.duration]); })
      .observe({ type: 'longtask', buffered: true });
  } catch (_) {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) B.events.push([e.name, e.startTime, e.duration]); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (_) {}
  document.addEventListener('pointerdown', (e) => { B.lastPointer = e.timeStamp; }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') B.lastPointer = e.timeStamp; }, true);

  const lastMsgsText = (n) => {
    const list = document.getElementById('msgList');
    let s = '';
    let el = list && list.lastElementChild;
    for (let i = 0; el && i < n; el = el.previousElementSibling) {
      if (!el.classList.contains('msg')) continue;
      s += el.textContent; i++;
    }
    return s;
  };
  const check = (t) => {
    if (t.kind === 'text') return lastMsgsText(3).includes(t.marker);
    if (t.kind === 'visible') { const el = document.querySelector(t.selector); return !!el && !el.classList.contains('hidden') && el.offsetParent !== null; }
    return false;
  };
  /* targets: [{name, kind, marker|selector}] checked in order each frame. */
  B.arm = (targets) => {
    B.armedAt = performance.now();
    B.lastPointer = 0;
    B.hits = {};
    B.frames = [];
    B.lastMutation = 0;
    const list = document.getElementById('msgList');
    if (B.mo) B.mo.disconnect();
    B.mo = new MutationObserver(() => { B.lastMutation = performance.now(); });
    const root = document.body;
    B.mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: false });
    void list;
    let idx = 0;
    const loop = (ts) => {
      B.frames.push(ts);
      while (idx < targets.length && check(targets[idx])) { B.hits[targets[idx].name] = performance.now(); idx++; }
      if (performance.now() - B.armedAt < 30000) B.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(B.raf);
    B.raf = requestAnimationFrame(loop);
  };
  B.result = (windowMs, streamFrom, streamTo) => new Promise((res) => {
    const t0 = B.lastPointer || B.armedAt;
    const done = () => {
      cancelAnimationFrame(B.raf);
      if (B.mo) B.mo.disconnect();
      const inWin = B.longtasks.filter(([s]) => s >= t0 - 5 && s <= t0 + windowMs);
      const ev = B.events.filter(([n, s]) => s >= t0 - 5 && s <= t0 + 200 && /pointer|click|key/.test(n));
      const hits = {};
      for (const k of Object.keys(B.hits)) hits[k] = +(B.hits[k] - t0).toFixed(1);
      const out = {
        hits,
        settle: B.lastMutation ? +(Math.min(B.lastMutation, t0 + windowMs) - t0).toFixed(1) : 0,
        longTaskTotal: +inWin.reduce((a, [, d]) => a + d, 0).toFixed(1),
        longTaskMax: +(inWin.reduce((a, [, d]) => Math.max(a, d), 0)).toFixed(1),
        inputDelayMax: +(ev.reduce((a, [, , d]) => Math.max(a, d), 0)).toFixed(1),
      };
      const sc = document.getElementById('msgList');
      if (sc && sc.offsetParent !== null) out.pinnedBottom = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) < 80 ? 1 : 0;
      if (streamFrom && B.hits[streamFrom] && B.hits[streamTo]) {
        const a = B.hits[streamFrom], b = B.hits[streamTo];
        const fr = B.frames.filter((f) => f >= a && f <= b);
        let janky = 0, maxGap = 0;
        for (let i = 1; i < fr.length; i++) { const g = fr[i] - fr[i - 1]; if (g > 50) janky++; if (g > maxGap) maxGap = g; }
        const lt = B.longtasks.filter(([s]) => s >= a && s <= b);
        out.stream = {
          frames: fr.length, jankyFrames: janky, maxFrameGap: +maxGap.toFixed(1),
          fps: +(fr.length / ((b - a) / 1000)).toFixed(1),
          longTaskTotal: +lt.reduce((x, [, d]) => x + d, 0).toFixed(1),
        };
      }
      res(out);
    };
    const wait = () => {
      const now = performance.now();
      const allHit = B.targets == null || true;
      if (now - t0 >= windowMs && allHit) return done();
      setTimeout(wait, 100);
    };
    wait();
  });
  /* Resolve once no long task and no mutation happened for `quietMs`. */
  B.quiet = (quietMs, maxMs) => new Promise((res) => {
    const start = performance.now();
    let last = performance.now();
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      const lt = B.longtasks.length ? B.longtasks[B.longtasks.length - 1] : null;
      if (lt && lt[0] + lt[1] > last) last = lt[0] + lt[1];
      if (now - last >= quietMs || now - start > maxMs) { mo.disconnect(); res(+(now - start).toFixed(0)); return; }
      setTimeout(tick, 50);
    };
    tick();
  });
}

const PROFILE = arg('profile', '');
const TRACE = arg('trace', '');
function summarizeTrace(events, name) {
  const main = events.filter((e) => e.ph === 'X' && e.dur);
  const agg = new Map();
  for (const e of main) {
    const k = e.name;
    const a = agg.get(k) || { n: 0, dur: 0, max: 0, elems: 0 };
    a.n++; a.dur += e.dur / 1000; a.max = Math.max(a.max, e.dur / 1000);
    if (e.args && e.args.elementCount) a.elems += e.args.elementCount;
    if (e.args && e.args.beginData && e.args.beginData.dirtyObjects) a.elems += e.args.beginData.dirtyObjects;
    agg.set(k, a);
  }
  console.log('=== trace', name);
  for (const [k, a] of [...agg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 25)) {
    console.log(a.dur.toFixed(1).padStart(9), String(a.n).padStart(6), 'max', a.max.toFixed(1).padStart(7), 'elems', String(a.elems).padStart(8), k);
  }
}
let CDP = null;
async function step(page, name, targets, action, { windowMs = 4000, stream } = {}) {
  await page.evaluate(() => window.__bench.quiet(600, 8000));
  await page.evaluate((t) => window.__bench.arm(t), targets);
  const prof = PROFILE && PROFILE.split(',').includes(name) && CDP;
  const trace = TRACE && TRACE.split(',').includes(name) && CDP;
  let traceEvents = [];
  if (trace) {
    CDP.on('Tracing.dataCollected', (d) => { traceEvents.push(...d.value); });
    await CDP.send('Tracing.start', { categories: process.env.TRACE_CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReportEvents' });
  }
  if (prof) { await CDP.send('Profiler.enable'); await CDP.send('Profiler.setSamplingInterval', { interval: 200 }); await CDP.send('Profiler.start'); }
  await action();
  const r = await page.evaluate(([w, a, b]) => window.__bench.result(w, a, b), [windowMs, stream?.[0], stream?.[1]]);
  if (trace) {
    const done = new Promise((r) => CDP.once('Tracing.tracingComplete', r));
    await CDP.send('Tracing.end');
    await done;
    fs.writeFileSync(resolve(__dirname, 'results', `${LABEL}.${name}.trace.json`), JSON.stringify({ traceEvents }));
    summarizeTrace(traceEvents, name);
  }
  if (prof) {
    const { profile } = await CDP.send('Profiler.stop');
    fs.mkdirSync(resolve(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(resolve(__dirname, 'results', `${LABEL}.${name}.cpuprofile`), JSON.stringify(profile));
    console.log('=== profile', name); summarizeProfile(profile);
  }
  return { name, ...r };
}

function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  const total = new Map();
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop()}:${f.lineNumber + 1}`; };
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    const d = (dt[i] || 0) / 1000;
    self.set(key(n), (self.get(key(n)) || 0) + d);
    const seen = new Set();
    let cur = n;
    while (cur) { const k = key(cur); if (!seen.has(k)) { total.set(k, (total.get(k) || 0) + d); seen.add(k); } cur = byId.get(parent.get(cur.id)); }
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  console.log('--- self time ---');
  for (const [k, v] of top(self, 25)) console.log(v.toFixed(1).padStart(8), k);
  console.log('--- total time ---');
  for (const [k, v] of top(total, 45)) console.log(v.toFixed(1).padStart(8), k);
}

async function oneRun(browserType, base, SESSIONS, stats, runIdx) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'zh-CN' });
  await context.addCookies([
    { name: 'csrf', value: 'bench-csrf', domain: '127.0.0.1', path: '/' },
    { name: 'xsrf-token', value: 'bench-csrf', domain: '127.0.0.1', path: '/' },
    { name: 'sid', value: 'bench-sid', domain: '127.0.0.1', path: '/' },
  ]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
      localStorage.setItem('socrates-lang-app', 'zh');
      localStorage.setItem('socrates-appmode', 'chat');
    } catch (_) {}
  });
  await context.addInitScript(instrument);
  if (process.env.EXTRA_CSS) {
    await context.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); });
    }, process.env.EXTRA_CSS);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await context.newCDPSession(page);
  CDP = cdp;
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const row = (s) => `.recent-item[data-recent-actual="${s.id}"]`;
  await page.waitForSelector(row(SESSIONS.long), { timeout: 30000 });
  await page.waitForTimeout(1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const last = (s) => `MARK-${s.id}-${(s.messages.length / 2) - 1}`;
  const sw = (key, label) => step(page, label, [{ name: 'visible', kind: 'text', marker: key === 'short' ? `MARK-${SESSIONS.short.id}-1` : last(SESSIONS[key]) }],
    () => page.click(row(SESSIONS[key])), { windowMs: 5000 });

  const results = [];
  const snap = () => JSON.parse(JSON.stringify({ d: stats.detailGets, c: stats.chatTurnPosts }));
  const withNet = async (p) => {
    const before = snap();
    const r = await p;
    const after = snap();
    const gets = Object.keys(after.d).reduce((a, k) => a + (after.d[k] - (before.d[k] || 0)), 0);
    r.detailGets = gets;
    return r;
  };
  results.push(await withNet(sw('long', 'switch.long.cold')));
  results.push(await withNet(sw('medium', 'switch.medium.cold')));
  results.push(await withNet(sw('short', 'switch.short.cold')));
  results.push(await withNet(sw('long', 'switch.long.warm')));
  results.push(await withNet(sw('medium', 'switch.medium.warm')));
  results.push(await withNet(sw('short', 'switch.short.warm')));
  results.push(await withNet(sw('long', 'switch.long.warm2')));

  /* Send inside the long session. */
  const editor = '#chatComposerRoot .rich-composer-editor';
  const q1 = `BENCHQ-${runIdx}-a 请再举一个例子`;
  await page.fill(editor, q1);
  results.push(await step(page, 'send.long', [
    { name: 'bubble', kind: 'text', marker: q1 },
    { name: 'firstToken', kind: 'text', marker: 'STREAMTOKEN0' },
    { name: 'streamEnd', kind: 'text', marker: 'STREAMEND' },
  ], () => page.click('#sendBtn'), { windowMs: 9000, stream: ['firstToken', 'streamEnd'] }));

  /* New chat from inside a long session. */
  results.push(await step(page, 'newchat', [{ name: 'visible', kind: 'visible', selector: '#topicSetup' }],
    () => page.click('#newChatBtn'), { windowMs: 1500 }));

  /* First message of a new chat. */
  const q2 = `BENCHQ-${runIdx}-b 什么是积分`;
  await page.fill('#topicComposerRoot .rich-composer-editor', q2);
  results.push(await step(page, 'send.newchat', [
    { name: 'bubble', kind: 'text', marker: q2 },
    { name: 'firstToken', kind: 'text', marker: 'STREAMTOKEN0' },
    { name: 'streamEnd', kind: 'text', marker: 'STREAMEND' },
  ], () => page.press('#topicComposerRoot .rich-composer-editor', 'Enter'), { windowMs: 9000, stream: ['firstToken', 'streamEnd'] }));

  /* Switching away from a freshly-finished chat back into history. */
  results.push(await withNet(sw('long', 'switch.long.afterSend')));

  await browser.close();
  return { results, errors };
}

function median(xs) { const a = xs.filter((x) => typeof x === 'number').sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : +((a[m - 1] + a[m]) / 2).toFixed(1); }

function flatten(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'name') continue;
    if (v && typeof v === 'object') for (const [k2, v2] of Object.entries(v)) o[`${k}.${k2}`] = v2;
    else o[k] = v;
  }
  return o;
}

async function main() {
  const { server, stats, SESSIONS } = createBenchServer({ latencyMs: LATENCY });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = `http://127.0.0.1:${PORT}`;
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`run ${i + 1}/${RUNS}… `);
    const r = await oneRun(chromium, base, SESSIONS, stats, i);
    runs.push(r);
    console.log(r.errors.length ? `(${r.errors.length} page errors)` : 'ok');
    for (const e of r.errors.slice(0, 3)) console.log('   ', e.slice(0, 200));
  }
  server.close();
  const names = runs[0].results.map((r) => r.name);
  const summary = {};
  for (const n of names) {
    const flats = runs.map((r) => flatten(r.results.find((x) => x.name === n) || {}));
    const keys = [...new Set(flats.flatMap((f) => Object.keys(f)))];
    summary[n] = {};
    for (const k of keys) summary[n][k] = median(flats.map((f) => f[k]));
  }
  const out = { label: LABEL, cpu: CPU, latency: LATENCY, runs: RUNS, at: new Date().toISOString(), summary, raw: runs };
  const dir = resolve(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${LABEL}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  printSummary(summary);
  console.log('\nwrote', file);
}

function printSummary(summary) {
  for (const [n, m] of Object.entries(summary)) {
    console.log(n.padEnd(22), Object.entries(m).map(([k, v]) => `${k}=${v}`).join('  '));
  }
}

function compare(a, b) {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')).summary;
  const Bs = JSON.parse(fs.readFileSync(b, 'utf8')).summary;
  for (const n of Object.keys(A)) {
    console.log('\n' + n);
    for (const k of Object.keys(A[n])) {
      const x = A[n][k], y = Bs[n]?.[k];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      const pct = x ? (((y - x) / x) * 100).toFixed(0) + '%' : '';
      console.log('  ' + k.padEnd(26), String(x).padStart(9), '→', String(y).padStart(9), pct.padStart(6));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
