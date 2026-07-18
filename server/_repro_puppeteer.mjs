// Reproduce the user's reported bug
import 'dotenv/config';
import { initDb, getDb, closeDb } from '/home/ubuntu/User/Socrates/server/src/db/index.js';
import { users, authSessions, sessions, messages } from '/home/ubuntu/User/Socrates/server/src/db/schema.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { eq, desc, asc } from 'drizzle-orm';
import { spawn } from 'node:child_process';

await initDb(process.env.DATABASE_URL);
const db = getDb();
const email = 'bug_repro_' + Date.now() + '@example.com';
const password = 'changeme';
const passwordHash = await bcrypt.hash(password, 10);
const userId = crypto.randomUUID();
await db.insert(users).values({
  id: userId, email, passwordHash,
  verifiedAt: new Date(), displayName: 'BugRepro', isGuest: false,
});
const token = crypto.randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 30*24*60*60*1000);
await db.insert(authSessions).values({token, userId, expiresAt});

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: '/home/ubuntu/User/Socrates/frontend',
  stdio: ['ignore', 'pipe', 'pipe'],
});
let viteReady = false;
vite.stdout.on('data', d => { if (String(d).includes('ready in')) viteReady = true; });
for (let i = 0; i < 30 && !viteReady; i++) await new Promise(r => setTimeout(r, 500));
if (!viteReady) { console.log('Vite failed to start'); process.exit(1); }
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

// Step 1: Start a new chat
await page.click('#topicInput');
await page.keyboard.type('Bug repro topic');
await page.click('#startBtn');
console.log('STEP 1: clicked Begin');
await new Promise(r => setTimeout(r, 3000));

// Step 2: Send first message
await page.click('#chatInputArea');
await page.keyboard.type('What is 2+2?');
await page.keyboard.press('Enter');
console.log('STEP 2: sent first message');
await new Promise(r => setTimeout(r, 15000));

function snap(label) {
  return page.evaluate(() => {
    return {
      stateLen: window.state?.messages?.length,
      stateMsgs: (window.state?.messages || []).map(m => ({
        role: m.role,
        cid: m.clientId,
        id: m.id,
        type: m.type,
        text: (m.rawText || m.content || '').slice(0, 50),
      })),
      domMsgs: Array.from(document.querySelectorAll('#msgList .msg')).map(m => ({
        role: m.classList.contains('user') ? 'user' : (m.classList.contains('assistant') ? 'assistant' : '?'),
        text: (m.querySelector('.msg-body')?.textContent || '').slice(0, 50),
        cid: m.dataset.clientId,
      })),
      recentsCount: document.querySelectorAll('#recentsList .recent-item').length,
    };
  });
}

let s = await snap('after first response');
console.log('STATE:', JSON.stringify(s.stateMsgs, null, 2));
console.log('DOM:', JSON.stringify(s.domMsgs, null, 2));

let sessId = await page.evaluate(() => window.state?.session?.currentSessionId);
console.log('Session ID:', sessId);
let dbMsgs = await db.select().from(messages).where(eq(messages.sessionId, sessId)).orderBy(asc(messages.createdAt));
console.log('DB messages:', dbMsgs.length);
dbMsgs.forEach((m, i) => console.log(`  [${i}] ${m.role} cid=${m.clientId} id=${m.id} text="${(m.rawText||'').slice(0,50)}"`));

// Step 3: Click regenerate on the LAST assistant
const regenInfo = await page.evaluate(() => {
  const btns = document.querySelectorAll('button[data-action="regenerate"]');
  if (btns.length === 0) return {clicked: false};
  const last = btns[btns.length - 1];
  const bar = last.closest('.msg-toolbar');
  const lastMsg = bar.closest('.msg');
  return {
    clicked: true,
    btnCount: btns.length,
    btnMsgId: bar?.dataset.messageId,
    btnMsgCid: lastMsg?.dataset.clientId,
    btnMsgRole: lastMsg?.className,
    btnMsgText: (lastMsg?.querySelector('.msg-body')?.textContent || '').slice(0, 80),
  };
});
console.log('REGEN_INFO:', JSON.stringify(regenInfo, null, 2));

await page.evaluate(() => {
  const btns = document.querySelectorAll('button[data-action="regenerate"]');
  if (btns.length > 0) btns[btns.length - 1].click();
});
console.log('STEP 3: regenerate clicked');
await new Promise(r => setTimeout(r, 8000));

s = await snap('after regenerate');
console.log('STATE:', JSON.stringify(s.stateMsgs, null, 2));
console.log('DOM:', JSON.stringify(s.domMsgs, null, 2));

dbMsgs = await db.select().from(messages).where(eq(messages.sessionId, sessId)).orderBy(asc(messages.createdAt));
console.log('DB messages after regenerate:', dbMsgs.length);
dbMsgs.forEach((m, i) => console.log(`  [${i}] ${m.role} cid=${m.clientId} id=${m.id} text="${(m.rawText||'').slice(0,50)}"`));

// Step 4: Refresh page
await page.reload({waitUntil: 'domcontentloaded'});
await new Promise(r => setTimeout(r, 5000));

s = await snap('after refresh');
console.log('STATE after refresh:', JSON.stringify(s.stateMsgs, null, 2));
console.log('DOM after refresh:', JSON.stringify(s.domMsgs, null, 2));

await browser.close();
vite.kill();
process.exit(0);
