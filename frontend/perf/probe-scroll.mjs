/* perf/probe-scroll.mjs — where does the transcript sit after a switch / send?
 * Diagnostic: BENCH_DIST=<dir> node perf/probe-scroll.mjs */
import { chromium } from '@playwright/test';
import { createBenchServer } from './bench-server.mjs';

const { server, SESSIONS } = createBenchServer({ latencyMs: 40 });
await new Promise((r) => server.listen(4393, '127.0.0.1', r));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1360, height: 860 } });
await context.addCookies([{ name: 'csrf', value: 'x', domain: '127.0.0.1', path: '/' }, { name: 'sid', value: 'x', domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { localStorage.setItem('socrates-appmode', 'chat'); localStorage.setItem('socrates-lang-app', 'zh'); localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() })); });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 200)));
await page.goto('http://127.0.0.1:4393/');
const metrics = () => page.evaluate(() => {
  const l = document.getElementById('msgList');
  const last = l.lastElementChild;
  const r = last && last.getBoundingClientRect();
  return { top: Math.round(l.scrollTop), height: l.scrollHeight, client: l.clientHeight, gap: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight), rows: l.querySelectorAll(':scope > .msg').length, lastBottom: r && Math.round(r.bottom), listBottom: Math.round(l.getBoundingClientRect().bottom) };
});
for (const key of ['long', 'medium', 'long']) {
  await page.click(`.recent-item[data-recent-actual="${SESSIONS[key].id}"]`, { timeout: 30000 });
  for (const t of [300, 1500, 4000]) { await page.waitForTimeout(t === 300 ? 300 : t - 300); console.log(key, t, JSON.stringify(await metrics())); }
}
await browser.close();
server.close();
