import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.addInitScript(() => {
  try {
    localStorage.setItem('socrates-lang-app', 'zh');
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true, updatedAt: new Date().toISOString() }));
  } catch (_) {}
});
await page.route('**/api/**', (route) => {
  const url = route.request().url().replace('/api/v2/', '/api/');
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'a@b.c', name: 'Adex Hu', plan: 'plus', verifiedAt: '2026-01-01T00:00:00Z' } });
  if (url.includes('/api/sessions') && route.request().method() === 'GET') return json({ sessions: [] });
  return json({ ok: true, items: [], providers: [] });
});
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1200);

const dump = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    h: Math.round(r.height), w: Math.round(r.width), display: cs.display, minH: cs.minHeight,
    padding: cs.padding, order: cs.order, flex: cs.flex, pos: cs.position, mh: cs.maxHeight,
  };
}, sel);

console.log('LANDING topicWrap', JSON.stringify(await dump('#topicInputWrap')));
console.log('LANDING editor', JSON.stringify(await dump('#topicComposerRoot')));
console.log('LANDING tiptap', JSON.stringify(await dump('#topicComposerRoot .tiptap')));
console.log('LANDING effort', JSON.stringify(await dump('#topicInputWrap .effort-picker')));
console.log('LANDING effortTrigger', JSON.stringify(await dump('#topicInputWrap .effort-trigger')));
console.log('LANDING mic', JSON.stringify(await dump('#topicMobileMicBtn')));
console.log('LANDING start', JSON.stringify(await dump('#startBtn')));
console.log('LANDING tools', JSON.stringify(await dump('#topicComposerToolsBtn')));

await page.evaluate(() => {
  window.stateStore?.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
  window.stateStore?.dispatch({ type: 'state/set', key: 'topic', value: 'probe' });
  document.getElementById('topicSetup')?.classList.add('hidden');
  document.getElementById('mainInner')?.classList.add('hidden');
  document.getElementById('chatView')?.classList.remove('hidden');
  document.body.dataset.conversationActive = 'true';
});
await page.waitForTimeout(400);

console.log('CHAT wrap', JSON.stringify(await dump('#chatInputWrap')));
console.log('CHAT body', JSON.stringify(await dump('#chatInputWrap .chat-composer-body')));
console.log('CHAT footer', JSON.stringify(await dump('#chatInputWrap .chat-input-footer')));
console.log('CHAT leftGroup', JSON.stringify(await dump('#chatInputWrap .footer-left-group')));
console.log('CHAT editor', JSON.stringify(await dump('#chatComposerRoot')));
console.log('CHAT tiptap', JSON.stringify(await dump('#chatComposerRoot .tiptap')));
console.log('CHAT effort', JSON.stringify(await dump('#chatInputWrap .effort-picker')));
console.log('CHAT mic', JSON.stringify(await dump('#chatMobileMicBtn')));
console.log('CHAT send', JSON.stringify(await dump('#sendBtn')));
console.log('CHAT tools', JSON.stringify(await dump('#chatComposerToolsBtn')));
console.log('CHAT richComposer', JSON.stringify(await dump('#chatComposerRoot .rich-composer')));

await page.screenshot({ path: 'test-results/probe-mobile-chat.png', fullPage: false });
await browser.close();
console.log('done');
