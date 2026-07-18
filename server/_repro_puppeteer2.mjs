// Investigate the rendering issue further
import 'dotenv/config';
import { initDb, getDb, closeDb } from '/home/ubuntu/User/Socrates/server/src/db/index.js';
import { users, authSessions, messages } from '/home/ubuntu/User/Socrates/server/src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { eq, asc } from 'drizzle-orm';
import { spawn } from 'node:child_process';

await initDb(process.env.DATABASE_URL);
const db = getDb();
const email = 'bug_repro_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const userId = crypto.randomUUID();
await db.insert(users).values({id: userId, email, passwordHash, verifiedAt: new Date(), displayName: 'BugRepro', isGuest: false});
const token = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 30*24*60*60*1000);
await db.insert(authSessions).values({token, userId, expiresAt});

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {cwd: '/home/ubuntu/User/Socrates/frontend', stdio: ['ignore', 'pipe', 'pipe']});
let viteReady = false;
vite.stdout.on('data', d => { if (String(d).includes('ready in')) viteReady = true; });
for (let i = 0; i < 30 && !viteReady; i++) await new Promise(r => setTimeout(r, 500));
if (!viteReady) { console.log('Vite failed'); process.exit(1); }
await new Promise(r => setTimeout(r, 1000));

const browser = await puppeteer.launch({
  executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1228/chrome-linux/chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setCookie({name: 'sid', value: token, domain: '127.0.0.1', path: '/', httpOnly: true});
const consoleLogs = [];
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0,300)}`));
page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));

await page.goto('http://127.0.0.1:5173/', {waitUntil: 'domcontentloaded', timeout: 60000});
await new Promise(r => setTimeout(r, 4000));

await page.click('#topicInput');
await page.keyboard.type('Bug repro topic');
await page.click('#startBtn');
await new Promise(r => setTimeout(r, 3000));

await page.click('#chatInputArea');
await page.keyboard.type('What is 2+2?');
await page.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 15000));

// Get state and DB BEFORE regenerate
let sessId = await page.evaluate(() => window.state?.session?.currentSessionId);
let dbMsgs = await db.select().from(messages).where(eq(messages.sessionId, sessId)).orderBy(asc(messages.createdAt));
console.log('=== BEFORE REGENERATE ===');
dbMsgs.forEach((m, i) => console.log(`  [${i}] ${m.role} cid=${m.clientId} id=${m.id} text="${(m.rawText||'').slice(0,80)}"`));

// Click regenerate on the LAST assistant
await page.evaluate(() => {
  const btns = document.querySelectorAll('button[data-action="regenerate"]');
  if (btns.length > 0) btns[btns.length - 1].click();
});
console.log('=== CLICKED REGENERATE ===');
await new Promise(r => setTimeout(r, 15000));

// Get state and DB AFTER regenerate
let sessId2 = await page.evaluate(() => window.state?.session?.currentSessionId);
console.log('Session ID after regen:', sessId2, 'same?', sessId === sessId2);
dbMsgs = await db.select().from(messages).where(eq(messages.sessionId, sessId)).orderBy(asc(messages.createdAt));
console.log('=== AFTER REGENERATE (DB) ===');
dbMsgs.forEach((m, i) => console.log(`  [${i}] ${m.role} cid=${m.clientId} id=${m.id} text="${(m.rawText||'').slice(0,80)}"`));

// Refresh
await page.reload({waitUntil: 'domcontentloaded'});
await new Promise(r => setTimeout(r, 6000));

// Get state and DOM after refresh
const final = await page.evaluate(() => {
  return {
    stateMsgs: (window.state?.messages || []).map(m => ({
      role: m.role,
      cid: m.clientId,
      id: m.id,
      type: m.type,
      rawText: (m.rawText || '').slice(0, 50),
      html: (m.html || '').slice(0, 100),
    })),
    domMsgs: Array.from(document.querySelectorAll('#msgList .msg')).map(m => {
      const body = m.querySelector('.msg-body');
      return {
        role: m.classList.contains('user') ? 'user' : (m.classList.contains('assistant') ? 'assistant' : '?'),
        text: (body?.textContent || '').slice(0, 50),
        innerHtml: (body?.innerHTML || '').slice(0, 200),
        cid: m.dataset.clientId,
      };
    }),
    recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
    activeRecents: Array.from(document.querySelectorAll('#recentsList .recent-item.active')).length,
  };
});
console.log('=== AFTER REFRESH ===');
console.log('STATE:', JSON.stringify(final.stateMsgs, null, 2));
console.log('DOM:', JSON.stringify(final.domMsgs, null, 2));
console.log('Recents count:', final.recentsCount, 'Active:', final.activeRecents);

await browser.close();
vite.kill();
process.exit(0);
