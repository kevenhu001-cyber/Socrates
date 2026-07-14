import 'dotenv/config';
import { initDb, getDb, closeDb } from './src/db/index.js';
import { users, authSessions } from './src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';

await initDb(process.env.DATABASE_URL);
const db = getDb();
const email = 'test_browser_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const id = crypto.randomUUID();
await db.insert(users).values({id, email, passwordHash, verifiedAt: new Date(), displayName: 'TB', isGuest: false});
const token = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 30*24*60*60*1000);
await db.insert(authSessions).values({token, userId: id, expiresAt});
await closeDb();

const browser = await puppeteer.launch({
  executablePath: '/home/ubuntu/.cache/puppeteer/chrome/linux-150.0.7871.24/chrome-linux64/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setCookie({name: 'sid', value: token, domain: 'localhost', path: '/', httpOnly: true});

const consoleLogs = [];
const fetchLogs = [];
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0,200)}`));
page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));
page.on('request', req => {
  if (req.url().includes('/api/files/') && req.url().includes('/raw')) {
    fetchLogs.push({url: req.url(), method: req.method()});
  }
});
page.on('response', async res => {
  if (res.url().includes('/api/files/') && res.url().includes('/raw')) {
    const last = fetchLogs[fetchLogs.length-1];
    last.status = res.status;
    last.contentType = res.headers()['content-type'];
    let body=null; try { body=await res.buffer(); } catch(e){}
    last.bodySize = body?.length;
    last.bodyFirst8 = body?.slice(0,8).toString('hex');
  }
});

await page.goto('http://localhost:3037/', {waitUntil: 'domcontentloaded'});
console.log('Page loaded');
await new Promise(r => setTimeout(r, 3000));

const inputInfo = await page.evaluate(() => {
  const candidates = document.querySelectorAll('textarea, [contenteditable], input[type="text"]');
  const list = [];
  for (const c of candidates) {
    list.push({tag: c.tagName, id: c.id, class: c.className, name: c.name, placeholder: c.placeholder, vis: !!c.offsetParent});
  }
  return list;
});
console.log('INPUTS:', JSON.stringify(inputInfo, null, 2));

const code = `import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
x = np.linspace(-2,2,200)
fig, axes = plt.subplots(2,2,figsize=(6,5))
for ax,fn in zip(axes.flatten(), [np.sin, np.cos, np.tan, np.exp]):
  ax.plot(x, fn(x))
  ax.set_title(fn.__name__)
fig.tight_layout()
fig.savefig('/artifacts/four_transcendental.png')
print('saved')
`;

const typed = await page.evaluate((msg) => {
  const i = document.querySelector('#chatInput, [contenteditable="true"], textarea');
  if (!i) return false;
  if (i.tagName === 'TEXTAREA' || i.tagName === 'INPUT') {
    i.value = msg;
    i.dispatchEvent(new Event('input', {bubbles: true}));
  } else {
    i.innerText = msg;
    i.dispatchEvent(new Event('input', {bubbles: true}));
  }
  return true;
}, 'Plot four transcendental functions with this code: ' + code);
console.log('TYPED:', typed);

await new Promise(r => setTimeout(r, 500));
const sendBtn = await page.$('button[aria-label*="send" i], button.send, [data-action*="send"]');
if (sendBtn) {
  await sendBtn.click();
  console.log('Send clicked');
} else {
  await page.keyboard.press('Enter');
  console.log('Enter pressed');
}

await new Promise(r => setTimeout(r, 30000));

const state = await page.evaluate(() => {
  return {
    toolCards: Array.from(document.querySelectorAll('.agent-tool-card')).map(c => ({
      name: c.querySelector('.agent-tool-name')?.textContent,
      imgs: Array.from(c.querySelectorAll('img')).map(i => ({
        src: i.src?.slice(-80),
        naturalWidth: i.naturalWidth,
        naturalHeight: i.naturalHeight,
        complete: i.complete
      })),
      hasArtifactError: c.querySelectorAll('.artifact-error').length,
      out: c.querySelector('.agent-tool-out')?.textContent?.slice(0,200)
    }))
  };
});
console.log('STATE:', JSON.stringify(state, null, 2));
console.log('FETCH LOGS:', JSON.stringify(fetchLogs, null, 2));
console.log('CONSOLE LOGS (last 30):', consoleLogs.slice(-30).join('\n'));
await browser.close();
process.exit(0);
