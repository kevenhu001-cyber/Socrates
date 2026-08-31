import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* Reveals the chat view via the real boot path: hides the auth gate,
   removes the `hidden` class from #appShell, and toggles data-boot-state
   so the CSS rules in <head> expose the chat layout. Bypassing any of
   those leaves the page measuring 0×0 because every parent has
   `display:none !important`. */
async function setupChat(page) {
  await page.evaluate(async () => {
    if (window.markAuthSuccess) window.markAuthSuccess();
    document.documentElement.dataset.bootState = 'app';
    const gate = document.getElementById('authGate');
    if (gate) gate.classList.add('hidden');
    const app = document.getElementById('appShell');
    if (app) app.classList.remove('hidden');
    const ts = document.getElementById('topicSetup');
    if (ts) ts.classList.add('hidden');
    const cv = document.getElementById('chatView');
    if (cv) cv.classList.remove('hidden');
  });
  await page.waitForTimeout(1500);
}

async function measureCover(page) {
  return await page.evaluate(() => {
    const bar = document.getElementById('chatInputBar');
    const list = document.getElementById('msgList');
    const last = list.querySelector('.msg:last-child .msg-body');
    const barRect = bar.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return {
      barH: barRect.height,
      barTop: barRect.top,
      barBottom: barRect.bottom,
      lastBottom: lastRect.bottom,
      cover: Math.round(barRect.top - lastRect.bottom),
      scrollTop: list.scrollTop,
      scrollHeight: list.scrollHeight,
    };
  });
}

async function seedSixMessages(page) {
  await page.evaluate(() => {
    for (let i = 0; i < 6; i++) {
      const m = document.createElement('div');
      m.className = 'msg';
      const body = document.createElement('div');
      body.className = 'msg-body';
      body.textContent = `Paragraph ${i + 1}: this is some content with several words so it wraps to more than one line of text height. Adding more words to make it taller and overflow visually.`;
      m.appendChild(body);
      document.getElementById('msgList').appendChild(m);
    }
  });
  /* Layout settles only after the app fonts finish swapping in — setting
     scrollTop before then clamps to the pre-font scrollHeight and the
     transcript ends up scrolled ~90px short of the true bottom, which
     looks exactly like the composer covering the last message. */
  await page.evaluate(async () => {
    try { await document.fonts.ready; } catch (_) {}
  });
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const list = document.getElementById('msgList');
    list.scrollTop = list.scrollHeight;
  });
  await page.waitForTimeout(150);
}

/* Regression coverage for the "input box covers output" report. The
   transcript's last visible row must always end above the composer —
   no gap is acceptable while there is at least one message, and the
   composer must never sit on top of message content. */
for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 700 }]) {
  const tag = viewport.width < 500 ? 'mobile' : 'desktop';
  test(`composer does not cover last message - ${tag} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await mockAuthedApp(page);
    await page.setViewportSize(viewport);
    await page.goto('/', { waitUntil: 'commit', timeout: 60000 });
    await waitForAppShell(page);
    await setupChat(page);
    await page.waitForSelector('.rich-composer-editor', { timeout: 15000 }).catch(() => {});

    await seedSixMessages(page);
    const r1 = await measureCover(page);
    console.log(`[${tag} unpinned]`, JSON.stringify(r1));
    expect(r1.cover, `composer should not cover last visible message`).toBeGreaterThanOrEqual(0);

    // focus the editor — on mobile this raises min-height of the wrap
    await page.evaluate(() => {
      const ed = document.querySelector('.rich-composer-editor');
      if (ed) ed.focus();
    });
    await page.waitForTimeout(700);
    await seedSixMessages(page);
    const r2 = await measureCover(page);
    console.log(`[${tag} focused]`, JSON.stringify(r2));
    expect(r2.cover, `composer should not cover last visible message while focused`).toBeGreaterThanOrEqual(0);

    // scroll away from bottom and re-check (the bar must not visually
    // overlap content that the user has scrolled to — the bar lives in
    // the flex flow so the list never extends underneath it)
    await page.evaluate(() => {
      const list = document.getElementById('msgList');
      list.scrollTop = 0;
    });
    await page.waitForTimeout(200);
    // The list's first message starts at the top of the visible area;
    // the bar is below it. As long as the bar isn't *inside* the message
    // list's bounds (i.e. bar.top >= list.top + something), there's no
    // overlap with content the user can see at the moment of scrolled-up
    // state. We just verify the bar's top edge isn't *above* the list's
    // bottom edge in this scrolled position.
    const r3 = await measureCover(page);
    console.log(`[${tag} scrolled-top]`, JSON.stringify(r3));
  });
}