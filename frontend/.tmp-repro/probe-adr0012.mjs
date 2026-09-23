// .tmp-repro/probe-adr0012.mjs — live computed-style probe for ADR 0012 visual review.
// Boots e2e/dist-server.mjs (serves dist/), then measures the four failing
// assertions and scans the CSSOM for dead `#appShell#appShell` rules.
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4188;
const BASE = `http://127.0.0.1:${PORT}/`;

const server = spawn(process.execPath, ['./e2e/dist-server.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, SMOKE_PORT: String(PORT) },
  stdio: 'ignore',
});
await new Promise((res, rej) => {
  const t = setTimeout(rej, 15000, new Error('server boot timeout'));
  const tryFetch = async () => {
    try { await fetch(BASE); clearTimeout(t); res(); }
    catch (_) { setTimeout(tryFetch, 400); }
  };
  tryFetch();
});

const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function bootPage(viewport, theme) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript((t) => {
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true }));
    localStorage.setItem('socrates-theme', t);
  }, theme);
  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/api/auth/me')) return json({ user: { id: 'u1', email: 'p@p.co', name: 'P', verifiedAt: '2026-01-01T00:00:00Z', plan: 'descartes', customInstructions: '', webSearchOn: true } });
    if (url.includes('/api/config')) return json({ hasBeagleKey: true });
    if (url.includes('/api/sessions')) return json(route.request().method() === 'GET' ? { sessions: [] } : { session: { id: 's1' } });
    return json({ ok: true, stub: true });
  });
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  return page;
}

const out = {};

// ---- 1. light landing geometry + palette (landing-light-visual mirror) ----
{
  const page = await bootPage({ width: 1440, height: 960 }, 'light');
  out.landing_light = await page.evaluate(() => {
    const rect = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null; };
    const cs = (s, p) => { const n = document.querySelector(s); return n ? getComputedStyle(n)[p] : null; };
    return {
      title: rect('#topicTitle'),
      composer: rect('#topicInputWrap'),
      composerBorderTopWidth: cs('#topicInputWrap', 'borderTopWidth'),
      composerBg: cs('#topicInputWrap', 'backgroundColor'),
      pageBg: cs('.main-content', 'backgroundColor'),
      titleColor: cs('#topicTitle', 'color'),
      gap: rect('#topicInputWrap') && rect('#topicTitle') ? rect('#topicInputWrap').top - rect('#topicTitle').bottom : null,
    };
  });
  await page.close();
}

// ---- 2. dead-rule CSSOM scan + winning border rule for #chatInputWrap proxy ----
{
  const page = await bootPage({ width: 1440, height: 960 }, 'light');
  out.cssom = await page.evaluate(() => {
    let dead = 0, deadWithImportant = 0; const deadSheets = {};
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (_) { continue; }
      for (const rule of rules) {
        if (!rule.selectorText) continue;
        if (rule.selectorText.includes('#appShell#appShell')) {
          dead += (rule.selectorText.split(',').length);
          if (rule.style && rule.style.length && rule.style.getPropertyPriority('border-top-width') === 'important') deadWithImportant += 1;
          const key = (sheet.href || 'inline').split('/').pop();
          deadSheets[key] = (deadSheets[key] || 0) + 1;
        }
      }
    }
    return { deadSelectors: dead, deadSheets };
  });
  await page.close();
}

// ---- 3. content-width display preference effect (home-customization mirror) ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-cookie-consent', JSON.stringify({ v: 1, choice: 'accept', nonEssential: true }));
    localStorage.setItem('socrates-theme', 'light');
    localStorage.setItem('socrates-display', JSON.stringify({ font: 1.375, width: 1.375 }));
  });
  await page.route('**/api/**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/api/auth/me') ? { user: { id: 'u1', email: 'p@p.co', name: 'P', verifiedAt: '2026-01-01T00:00:00Z' } } : { ok: true }) }));
  await page.goto(BASE, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  out.widthPref = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const wrap = document.querySelector('#topicInputWrap');
    return {
      topicWidth: wrap ? wrap.getBoundingClientRect().width : null,
      uiContentChat: cs.getPropertyValue('--ui-content-chat').trim(),
      conversationContentWidth: cs.getPropertyValue('--conversation-content-width').trim(),
      titleFontSize: document.querySelector('#topicTitle') ? getComputedStyle(document.querySelector('#topicTitle')).fontSize : null,
    };
  });
  await page.close();
}

// ---- 4. mobile 390 modeTabs geometry (mobile-home-visual mirror) ----
{
  const page = await bootPage({ width: 390, height: 844 }, 'dark');
  out.mobile390 = await page.evaluate(() => {
    const rect = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; };
    const sidebar = document.getElementById('sidebar');
    return {
      modeTabs: rect('#modeSegmentedTop'),
      composer: rect('#topicInputWrap'),
      sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
      sidebarX: sidebar ? sidebar.getBoundingClientRect().x : null,
      sidebarCollapsed: sidebar ? sidebar.classList.contains('collapsed') : null,
    };
  });
  await page.close();
}

// ---- 5. responsive sweep on landing (600→1440) ----
{
  const page = await bootPage({ width: 1440, height: 900 }, 'light');
  const sweep = [];
  for (const w of [600, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(350);
    sweep.push(await page.evaluate((vw) => {
      const rect = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; };
      return {
        vw,
        docScrollW: document.documentElement.scrollWidth,
        overflowX: document.documentElement.scrollWidth > vw + 1,
        composer: rect('#topicInputWrap'),
        title: rect('#topicTitle'),
        sidebar: rect('#sidebar'),
      };
    }, w));
  }
  out.sweep = sweep;
  await page.close();
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
server.kill();
process.exit(0);
