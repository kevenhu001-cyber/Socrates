import { chromium } from 'playwright';

const OUT = 'C:/Users/Jiacheng/AppData/Local/Temp/opencode';
const b = await chromium.launch({ args: ['--no-sandbox'] });

async function setup(page) {
  await page.evaluate(() => {
    document.getElementById('authGate')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.documentElement.dataset.mode = 'dark';
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e => e.remove());
    document.querySelectorAll('div').forEach(e => {
      const t = e.textContent?.trim();
      if (t === "Couldn't reach the server. Check your connection and retry.") e.style.display = 'none';
    });
  });
}

async function setupChat(page) {
  await setup(page);
  await page.evaluate(() => {
    document.getElementById('topicSetup')?.classList.add('hidden');
    document.getElementById('chatView')?.classList.remove('hidden');
    document.body.setAttribute('data-conversation-active', 'true');
  });
}

async function shotComposer(p, name, focus) {
  await p.waitForTimeout(600);
  if (focus) {
    // Add composer-focused class directly. Clicking the editor triggers
    // RichComposer to manage the class itself, which can race with our
    // test setup; toggling the class directly keeps the layout stable
    // while we screenshot it.
    await p.evaluate(() => {
      const wrap = document.getElementById('chatInputWrap');
      if (wrap) wrap.classList.add('composer-focused');
    });
    await p.waitForTimeout(500);
  }
  // Grab the entire chat-input-bar plus a generous strip above so the
  // vision model can see both the editor area and the footer row.
  const box = await p.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const bar = document.getElementById('chatInputBar');
    if (!wrap || !bar) return null;
    bar.scrollIntoView({ block: 'end' });
    const r = bar.getBoundingClientRect();
    const padTop = 60;
    const padBottom = 30;
    return { x: 0, y: Math.max(0, r.top - padTop), width: window.innerWidth, height: Math.min(window.innerHeight - Math.max(0, r.top - padTop), r.height + padTop + padBottom) };
  });
  if (!box || box.height < 20) { console.error(name, 'no usable box', box); return; }
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: box });
  console.log(name, 'ok');
}

async function shotTopic(p, name) {
  await p.waitForTimeout(600);
  const box = await p.evaluate(() => {
    const w = document.getElementById('topicInputWrap');
    if (!w) return null;
    w.scrollIntoView({ block: 'end' });
    const r = w.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top - 30), width: window.innerWidth, height: Math.min(window.innerHeight - Math.max(0, r.top - 30), r.height + 40) };
  });
  if (!box || box.height < 20) { console.error(name, 'no usable box', box); return; }
  await p.screenshot({ path: `${OUT}/${name}.png`, clip: box });
  console.log(name, 'ok');
}

// Mobile chat - collapsed
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setupChat(p);
  await shotComposer(p, 'mic-fix-mobile-collapsed', false);
  await p.close();
}
// Mobile chat - focused
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setupChat(p);
  await shotComposer(p, 'mic-fix-mobile-focused', true);
  await p.close();
}
// Desktop chat
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setupChat(p);
  await p.waitForTimeout(700);
  // Crop to just the composer pill (a few pixels of padding around it)
  const box = await p.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    if (!wrap) return null;
    wrap.scrollIntoView({ block: 'center' });
    const r = wrap.getBoundingClientRect();
    return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height + 16 };
  });
  if (!box || box.height < 20) { console.error('mic-fix-desktop: no box'); await p.close(); return; }
  await p.screenshot({ path: `${OUT}/mic-fix-desktop.png`, clip: box });
  console.log('mic-fix-desktop ok');
  await p.close();
}
// Mobile topic
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setup(p);
  await shotTopic(p, 'mic-fix-topic-mobile');
  await p.close();
}
// Desktop topic
{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setup(p);
  await shotTopic(p, 'mic-fix-topic-desktop');
  await p.close();
}

await b.close();
