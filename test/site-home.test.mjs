import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { sitePage, startSite, stopSite } from './helpers/site-browser.mjs';

let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

for (const prefix of ['', '/zh']) {
  const path = `${prefix}/`;
  for (const width of [320, 390, 760, 761, 1280, 1920]) {
    test(`${path} at ${width}px: centered question entry, readable cards and contained text`, async (t) => {
      const page = await sitePage(site, t, path, width);
      const geometry = await page.evaluate(() => {
        const visible = (node) => node.checkVisibility();
        const text = [...document.querySelectorAll('main h1, main h2, main h3, main p:not(.home-sr-only), .demo-node')].filter(visible);
        const demo = document.querySelector('.demo-tutor-body p');
        const hero = document.querySelector('.home-hero').getBoundingClientRect();
        const art = document.querySelector('.hero-art').getBoundingClientRect();
        const ask = document.querySelector('.hero-ask .ask-box').getBoundingClientRect();
        const title = document.querySelector('h1').getBoundingClientRect();
        const images = [...document.querySelectorAll('main img')].map((image) => image.getAttribute('src')).filter((src) => src !== '/logo.png');
        const map = document.querySelector('.demo-map-canvas').getBoundingClientRect();
        return {
          width: document.documentElement.scrollWidth,
          heroTop: hero.top,
          artTop: art.top,
          artRatio: art.width / art.height,
          askBottom: ask.bottom,
          askCenter: ask.x + ask.width / 2,
          titleCenter: title.x + title.width / 2,
          titleBottom: title.bottom,
          askTop: ask.top,
          background: getComputedStyle(document.body).backgroundColor,
          radius: parseFloat(getComputedStyle(document.querySelector('.ask-box')).borderRadius),
          featureTop: document.querySelector('.home-feature').getBoundingClientRect().top,
          questionSize: parseFloat(getComputedStyle(document.querySelector('.demo-msg--user')).fontSize),
          tutorSize: parseFloat(getComputedStyle(demo).fontSize),
          clippedText: text.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => `${node.className}: ${node.textContent.trim()}`),
          clippedNodes: [...document.querySelectorAll('.demo-node')].some((node) => { const box = node.getBoundingClientRect(); return box.left < map.left - 1 || box.right > map.right + 1; }),
          images,
          editorialRatios: [...document.querySelectorAll('.story-visual img')].map((image) => { const box = image.getBoundingClientRect(); return box.width / box.height; }),
        };
      });
      assert.equal(geometry.width, width);
      assert.ok(geometry.askBottom < 700, 'the question can be submitted from the first viewport');
      assert.ok(Math.abs(geometry.askCenter - width / 2) < 1);
      assert.ok(Math.abs(geometry.titleCenter - width / 2) < 1);
      assert.ok(geometry.titleBottom < geometry.askTop, 'the title sits above the composer');
      assert.ok(geometry.artTop >= geometry.featureTop, 'artwork belongs to the cards below the question');
      assert.ok(Math.abs(geometry.artRatio - 1) < .01, 'the diagram keeps its square composition');
      // OpenAI-style redesign: the page ground is pure white.
      assert.equal(geometry.background, 'rgb(255, 255, 255)');
      assert.ok(geometry.radius >= 18, 'the composer retains the rounded reference silhouette');
      assert.equal(await page.locator('[data-ask-form]').count(), 1, 'the homepage has one question entry at the top');
      assert.ok(geometry.tutorSize >= 16 && geometry.questionSize >= 15, 'preview copy uses actual reading sizes, not container-scaled pixels');
      assert.deepEqual(geometry.clippedText, []);
      assert.equal(geometry.clippedNodes, false, 'both connected ideas fit in the preview');
      assert.equal(new Set(geometry.images).size, geometry.images.length, 'do not reuse a cover in multiple sections');
      // The session story is now a drawn, scroll-driven product view, so one
      // learning photograph remains beside the original diagram and covers.
      assert.equal(geometry.images.length, 5, 'one original diagram, one learning scene and three source-backed research covers');
      assert.ok(geometry.editorialRatios.every((ratio) => ratio >= 1.3 && ratio <= 1.8), 'editorial images stay landscape, not an intrinsic 941px-tall poster');
      assert.equal(await page.locator('.home-hero .hero-art, .home-hero .hero-actions, .home-hero em').count(), 0, 'the first screen stays focused on the question');
      assert.equal(await page.locator('.hero-ask .ask-chip').count(), 5);
      assert.ok(await page.locator('.feature-description--lead').isVisible());
      assert.equal(await page.locator('.demo-rail, .demo-live, .demo-compose, .demo-suggestions').count(), 0, 'remove tiny navigation and controls that imply a live session');
      assert.match(await page.locator('.feature-meta').innerText(), /not a live conversation|并非实时对话/);
      assert.equal(await page.locator('.feature-main').getAttribute('aria-labelledby'), 'feature-title');
      assert.equal(await page.locator('.demo-msg').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 4, 'phones keep the learner’s correction, not just an unanswered tutor question');
      assert.equal(await page.locator('[data-art], .feature-rail').count(), 0, 'no generated gradient fields or competing story rail');
      // The hero is plain: no decorative canvas or artwork behind the question.
      assert.equal(await page.locator('canvas, [data-hero-field]').count(), 0);
      assert.ok(await page.locator('.hero-ask .ask-box').evaluate((box) => {
        const rect = box.getBoundingClientRect();
        return box.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), 'nothing covers the question entry');
      assert.equal(await page.locator('.hero-plate img').getAttribute('loading'), null, 'the main artwork is not lazy-loaded');
      assert.equal(await page.locator('.hero-plate img').getAttribute('fetchpriority'), 'high');
      assert.match(await page.locator('#askInputHero').getAttribute('aria-describedby'), /ask-handoff/);
      assert.equal(await page.locator('.story-layout').count(), 1);
      assert.equal(await page.locator('.home-research-list li').count(), 3);
      assert.equal(await page.locator('.home-research img').count(), 3);
      assert.equal(await page.locator('.home-stories .card-grid, .home-teams .card-grid').count(), 0);
      assert.equal(await page.locator('.learning-layout').count(), 1);
      assert.match(await page.locator('.home-stories figcaption').innerText(), /not a customer case study|并非真实客户案例/);
    });
  }

  for (const [scope, inputID, count] of [['.hero-ask', '#askInputHero', 4]]) {
    test(`${path} ${scope}: starters fill the question entry and hand off the exact question`, async (t) => {
      const page = await sitePage(site, t, path, 390);
      const input = page.locator(inputID);
      const starters = page.locator(`${scope} [data-ask-chip]`);
      assert.equal(await starters.count(), count);
      for (const starter of await starters.all()) {
        await starter.focus();
        await page.keyboard.press('Enter');
        assert.equal(await input.inputValue(), await starter.getAttribute('data-question'));
        assert.ok(await input.evaluate((node) => document.activeElement === node));
      }
      const question = prefix ? '为什么检测阳性还不能确定结果？' : 'Why isn’t a positive test the whole story?';
      await input.fill(question);
      assert.ok(await page.locator(`${scope} .ask-form`).evaluate((node) => node.classList.contains('has-value')));
      await page.route('https://app.topodrive.top/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Handoff fixture</title>' }));
      const request = page.waitForRequest((request) => new URL(request.url()).origin === 'https://app.topodrive.top');
      await input.press('Enter');
      const target = new URL((await request).url());
      assert.equal(target.searchParams.get('q'), question);
      await page.waitForURL((url) => url.origin === target.origin);
    });

    test(`${path} ${scope}: native handoff preserves multiline text and IME composition`, async (t) => {
      const page = await sitePage(site, t, path, 390);
      const input = page.locator(inputID);
      await input.fill(prefix ? '我正在想' : 'I am thinking');
      await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
      assert.equal(new URL(page.url()).pathname, path, 'IME confirmation must not submit');
      await input.press('Shift+Enter');
      assert.ok((await input.inputValue()).endsWith('\n'), 'Shift+Enter inserts a new line');
      const question = prefix ? '第一行：贝叶斯？\n第二行：基础发生率 & 假阳性。' : 'First line: Bayes?\nSecond line: base rate & false positives.';
      await input.fill(question);
      await page.route('https://app.topodrive.top/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Multiline handoff fixture</title>' }));
      const request = page.waitForRequest((request) => new URL(request.url()).origin === 'https://app.topodrive.top');
      await page.locator(`${scope} .ask-send`).click();
      assert.equal(new URL((await request).url()).searchParams.get('q').replaceAll('\r\n', '\n'), question);
      await page.waitForURL((url) => url.origin === 'https://app.topodrive.top');
    });
  }

  test(`${path}: normal-motion sections reveal and the story remains keyboard-navigable`, async (t) => {
    const context = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    t.after(() => context.close());
    await context.route('https://**/*', (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(site.baseURL + path);
    await page.locator('[data-consent-choice="essential"]').click();
    for (const selector of ['.home-news', '.home-stories', '.home-research', '.home-teams']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForFunction((selector) => getComputedStyle(document.querySelector(selector)).opacity === '1', selector);
    }
    await page.locator('.story-step').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`${site.baseURL}${prefix}/product#dialogue`);
    await page.waitForFunction(() => {
      const top = document.querySelector('#dialogue')?.getBoundingClientRect().top;
      return top >= 64 && top < 140;
    });
    assert.deepEqual(errors, []);
  });

  test(`${path}: mobile question shortcut, menu and language switch remain usable`, async (t) => {
    const page = await sitePage(site, t, path, 390);
    await page.locator('.site-search').click();
    assert.ok(await page.locator('#askInputHero').evaluate((node) => document.activeElement === node));
    const menu = page.locator('[data-site-menu-toggle]');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('main').evaluate((node) => node.inert));
    assert.ok(await page.locator('.site-mobile-menu nav a').first().evaluate((node) => document.activeElement === node));
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    assert.ok(await menu.evaluate((node) => document.activeElement === node));
    assert.ok(!(await page.locator('main').evaluate((node) => node.inert)));
    await menu.click();
    await page.locator('.site-mobile-utilities .site-locale').click();
    await page.waitForURL((url) => url.pathname === (prefix ? '/' : '/zh/'));
    assert.equal(await page.locator('.hero-ask').count(), 1);
    assert.match(await page.locator('h1').innerText(), prefix ? /What can I help/ : /有什么可以帮忙/);
  });

  test(`${path}: no-JS has a working native form and reading links, not inert starter buttons`, async (t) => {
    const page = await sitePage(site, t, path, 390, false);
    assert.equal(await page.locator('.ask-form').count(), 1);
    for (const form of await page.locator('.ask-form').all()) {
      assert.equal(await form.getAttribute('action'), 'https://app.topodrive.top');
      assert.equal(await form.getAttribute('method'), 'get');
    }
    assert.equal(await page.locator('#askInputHero').getAttribute('name'), 'q');
    assert.equal(await page.locator('[data-ask-chip]').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 0);
    assert.ok(await page.locator('.hero-ask .ask-chip--link').isVisible());
    assert.equal(await page.locator('.home-research-note').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 3);
    assert.equal(await page.locator('.story-step').count(), 3);
    assert.equal(await page.locator('.site-footer-grid a').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 36);
    const question = prefix ? '不使用脚本，也能带着问题开始。' : 'A question from a browser without JavaScript.';
    await page.locator('#askInputHero').fill(question);
    await page.route('https://app.topodrive.top/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Native form fixture</title>' }));
    const request = page.waitForRequest((request) => new URL(request.url()).origin === 'https://app.topodrive.top');
    await page.locator('.hero-ask .ask-send').click();
    const handoff = await request;
    assert.equal(handoff.method(), 'GET');
    assert.equal(new URL(handoff.url()).searchParams.get('q'), question);
    await page.waitForURL((url) => url.origin === 'https://app.topodrive.top');
  });
}

test('home translations share structure, useful deep links and published research metadata', async () => {
  const pages = await Promise.all(['', 'zh/'].map((prefix) => readFile(new URL(`../site/${prefix}index.html`, import.meta.url), 'utf8')));
  const structure = (source) => [...source.matchAll(/<(?:section|div|figure|aside|ul|li|a)\b[^>]*class="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(structure(pages[0]), structure(pages[1]));
  for (const [i, prefix] of ['', 'zh/'].entries()) {
    const source = pages[i];
    const twinPath = i === 0 ? 'index.md' : 'zh.md';
    const twin = await readFile(new URL(`../site/${twinPath}`, import.meta.url), 'utf8');
    assert.ok(source.includes(`href="https://topodrive.top/${twinPath}"`), 'each locale advertises its actual Markdown twin');
    assert.match(twin, i === 0 ? /# What can I help you understand\?/ : /# 有什么可以帮忙的？/);
    assert.ok(!source.includes('/home-aurora.js') && !source.includes('/home-field.js'), 'retired particle, gradient and canvas code is not loaded');
    assert.ok(!source.includes('href="/site.css'), 'homepage content has one canonical stylesheet');
    const index = await readFile(new URL(`../site/${prefix}research.html`, import.meta.url), 'utf8');
    const homeNotes = [...source.matchAll(/class="home-research-note" href="([^"]+)"[\s\S]*?<time datetime="([^"]+)"[\s\S]*?<h3>([^<]+)<\/h3>/g)];
    const indexNotes = [...index.matchAll(/class="research-note"[^>]*><a href="([^"]+)"[\s\S]*?<time datetime="([^"]+)"[\s\S]*?<h3>([^<]+)<\/h3>/g)];
    assert.equal(homeNotes.length, 3);
    assert.deepEqual(homeNotes.map((match) => match.slice(1)), indexNotes.slice(0, 3).map((match) => match.slice(1)));
    for (const note of homeNotes) assert.ok(twin.includes(note[3]), 'research titles stay synchronized in the Markdown twin');
    const product = await readFile(new URL(`../site/${prefix}product.html`, import.meta.url), 'utf8');
    for (const anchor of ['dialogue', 'knowledge-map', 'recall', 'mistake-book']) {
      assert.ok(source.includes(`href="/${prefix}product#${anchor}"`));
      assert.ok(product.includes(`id="${anchor}"`));
    }
    const imageReferences = [...source.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
    for (const path of new Set(imageReferences)) await readFile(new URL(`../site${path}`, import.meta.url));
  }
});
