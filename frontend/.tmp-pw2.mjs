// TEMP verification harness (not committed): render an in-chat transcript and
// capture geometry + screenshot via Playwright on the on-disk Chrome.
import { chromium } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './e2e/_chat-workbench.mjs';
import { setLang } from './e2e/_lib.mjs';

const EXEC = '/root/.cache/puppeteer/chrome/linux-155.0.8059.39/chrome-linux64/chrome';

const messages = [
  { clientId: 'u1', role: 'user', rawText: 'Compare Socrates and ChatGPT.', html: '<p>Compare Socrates and ChatGPT.</p>', type: 'user' },
  {
    clientId: 'a1', role: 'assistant', type: 'assistant', _streamSettled: true,
    rawText: 'Here is a short comparison.',
    html: '<p>Here is a short comparison of the two assistants.</p>',
    _activity: { type: 'public_reasoning_summary', text: 'Weighing the two products.' },
  },
];

const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: WORKBENCH_VIEWPORTS.desktop, deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4173' });
const page = await context.newPage();
await prepareChatWorkbench(page, { messages, viewport: WORKBENCH_VIEWPORTS.desktop });
await setLang(page, 'en');
await page.waitForTimeout(600);

const info = await page.evaluate(() => {
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { w: Math.round(b.width), h: Math.round(b.height), gap: cs.gap, display: cs.display }; };
  const toolbar = document.querySelector('.msg-toolbar');
  const buttons = toolbar ? Array.from(toolbar.querySelectorAll('button')).map((b) => ({ label: b.getAttribute('aria-label'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })) : [];
  return {
    theme: document.documentElement.dataset.theme,
    transcript: r('#msgList'),
    firstMsg: r('#msgList .msg'),
    toolbar: r('.msg-toolbar'),
    toolbarButtons: buttons,
    accordion: r('.thinking-accordion'),
  };
});
console.log('INFO', JSON.stringify(info, null, 2));

await page.screenshot({ path: 'test-results/_tmp-verify/chat.png' });
console.log('shot written');
await browser.close();
