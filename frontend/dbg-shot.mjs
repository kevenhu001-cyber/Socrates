import { chromium } from 'playwright';

const b = await chromium.launch({ args: ['--no-sandbox'] });

async function setup(page) {
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(500);
}

{
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('http://localhost:5180/', { waitUntil: 'networkidle', timeout: 15000 });
  await setup(p);
  await p.evaluate(() => {
    window.state.phase = 'chat';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    document.body.setAttribute('data-conversation-active', 'true');
  });
  await p.waitForTimeout(500);

  console.log('=== Empty ===');
  console.log(JSON.stringify(await p.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const body = wrap.querySelector('.chat-composer-body');
    return {
      wrap: { rect: wrap.getBoundingClientRect(), height: getComputedStyle(wrap).height, classes: Array.from(wrap.classList) },
      body: { rect: body.getBoundingClientRect(), rows: getComputedStyle(body).gridTemplateRows },
    };
  }), null, 2));

  await p.locator('#chatComposerRoot .rich-composer-editor').focus();
  await p.keyboard.type('Hello');
  await p.waitForTimeout(500);

  console.log('=== After Hello (single line) ===');
  console.log(JSON.stringify(await p.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const body = wrap.querySelector('.chat-composer-body');
    return {
      wrap: { rect: wrap.getBoundingClientRect(), height: getComputedStyle(wrap).height, classes: Array.from(wrap.classList) },
      body: { rect: body.getBoundingClientRect(), rows: getComputedStyle(body).gridTemplateRows },
    };
  }), null, 2));

  await p.keyboard.press('Shift+Enter');
  await p.keyboard.type('World');
  await p.waitForTimeout(500);

  console.log('=== After Shift+Enter World (2 lines) ===');
  console.log(JSON.stringify(await p.evaluate(() => {
    const wrap = document.getElementById('chatInputWrap');
    const body = wrap.querySelector('.chat-composer-body');
    return {
      wrap: { rect: wrap.getBoundingClientRect(), height: getComputedStyle(wrap).height, classes: Array.from(wrap.classList) },
      body: { rect: body.getBoundingClientRect(), rows: getComputedStyle(body).gridTemplateRows },
    };
  }), null, 2));

  await p.close();
}

await b.close();