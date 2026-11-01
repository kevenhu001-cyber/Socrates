import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startSite, stopSite, sitePage } from './helpers/site-browser.mjs';

let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

async function animatedPage(t, path = '/') {
  const context = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  t.after(() => context.close());
  await context.route('https://**/*', (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(site.baseURL + path);
  await page.locator('[data-consent-choice="essential"]').click();
  await page.evaluate(() => document.fonts.ready);
  t.after(() => assert.deepEqual(errors, []));
  return page;
}

test('scroll reveals and image hover animate, then stop when reduced motion is enabled', async (t) => {
  const page = await animatedPage(t);
  const card = page.locator('.home-research-note').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.home-research-note').getAnimations().some((animation) => animation.playState === 'running'));
  await page.waitForFunction(() => document.querySelector('.home-research-note').getAnimations().length === 0);
  assert.equal(await card.evaluate((node) => getComputedStyle(node).opacity), '1');
  await card.hover();
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.home-research-note img')).transform).a > 1.03);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.home-research-note img')).transform === 'none');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  assert.equal(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length), 0);
  assert.equal(await card.evaluate((node) => getComputedStyle(node).opacity), '1');
});

test('the empty input hint cycles but freezes while the learner types', async (t) => {
  const page = await animatedPage(t);
  const hint = page.locator('[data-ask-prompts]');
  const first = await hint.innerText();
  await page.waitForFunction((first) => document.querySelector('[data-ask-prompts]').textContent !== first, first, { timeout: 7000 });
  const input = page.locator('#askInputHero');
  await input.fill('My unfinished question.');
  const paused = await hint.innerText();
  await page.waitForTimeout(5100);
  assert.equal(await hint.innerText(), paused);
  assert.equal(await input.inputValue(), 'My unfinished question.');
  assert.ok(!(await hint.isVisible()), 'the rotating hint never covers the learner’s text');
});

test('reduced motion shows all content without entrances, including the localized input hint', async (t) => {
  const page = await sitePage(site, t, '/zh/', 390);
  const hint = page.locator('[data-ask-prompts]');
  const initial = await hint.innerText();
  for (const selector of ['.feature-intro', '.home-stories', '.home-research-note', '.home-teams']) {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    assert.equal(await page.locator(selector).first().evaluate((node) => getComputedStyle(node).opacity), '1');
  }
  assert.equal(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length), 0);
  await page.waitForTimeout(5100);
  assert.equal(await hint.innerText(), initial);
});

test('article reading progress follows scrolling and public content survives missing observers', async (t) => {
  const page = await animatedPage(t, '/research/memory-recall/');
  const header = page.locator('.site-header');
  assert.equal(await header.getAttribute('data-reading-progress'), '');
  await page.evaluate(() => scrollTo(0, 1200));
  await page.waitForFunction(() => Number(document.querySelector('.site-header').style.getPropertyValue('--reading-progress')) > 0);
  const first = await header.evaluate((node) => Number(node.style.getPropertyValue('--reading-progress')));
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => Number(document.querySelector('.site-header').style.getPropertyValue('--reading-progress')) === 1);
  assert.equal(await header.evaluate((node) => Number(node.style.getPropertyValue('--reading-progress'))), 1);

  await page.addInitScript(() => { delete window.IntersectionObserver; });
  await page.goto(site.baseURL + '/');
  await page.locator('.home-teams').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.home-teams').evaluate((node) => getComputedStyle(node).opacity), '1');
  assert.equal(await page.locator('[data-ask-form]').count(), 1);
  assert.equal(await page.locator('.site-footer-grid a').count(), 36);
});

test('the question chain advances one question at a time without moving the page', async (t) => {
  const page = await animatedPage(t);
  const chain = page.locator('#question-chain');
  const before = await page.locator('.home-feature').evaluate((node) => node.getBoundingClientRect().top + scrollY);
  await page.locator('.qc-list').scrollIntoViewIfNeeded();
  // One unprompted step plays once the chain is well in view.
  await page.waitForFunction(() => document.querySelector('[data-qc-count]').textContent.trim() === '2 / 4');
  assert.ok(await chain.locator('[data-qc-wrong]').evaluate((node) => node.classList.contains('is-struck')), 'the first answer is struck once a question shows it wrong');
  assert.ok(await chain.locator('[data-qc-revised]').evaluate((node) => !node.hidden));
  assert.ok(!(await chain.locator('[data-qc-step="2"] .qc-question').isVisible()), 'later questions wait');
  const next = chain.locator('[data-qc-next]');
  await next.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert.equal((await chain.locator('[data-qc-count]').innerText()).trim(), '4 / 4');
  assert.match(await chain.locator('[data-qc-live]').innerText(), /one sentence/);
  assert.ok(await chain.locator('[data-qc-map]').evaluate((node) => node.classList.contains('is-on')));
  assert.equal((await next.innerText()).trim(), 'Start over');
  const after = await page.locator('.home-feature').evaluate((node) => node.getBoundingClientRect().top + scrollY);
  assert.equal(after, before, 'every step is laid out from the start');
  await next.click();
  assert.equal((await chain.locator('[data-qc-count]').innerText()).trim(), '1 / 4');
  assert.ok(!(await chain.locator('[data-qc-wrong]').evaluate((node) => node.classList.contains('is-struck'))));
});

test('reduced motion opens the question chain on its finished state', async (t) => {
  const page = await sitePage(site, t, '/zh/', 390);
  const chain = page.locator('#question-chain');
  assert.equal((await chain.locator('[data-qc-count]').innerText()).trim(), '4 / 4');
  assert.ok(await chain.locator('[data-qc-step="3"] .qc-question').isVisible());
  assert.ok(await chain.locator('[data-qc-map]').isVisible());
  assert.equal((await chain.locator('[data-qc-next]').innerText()).trim(), '重新开始');
});

test('the recall card turns, takes a self-rating and moves the next review without moving the page', async (t) => {
  const page = await animatedPage(t);
  const card = page.locator('[data-recall]');
  await card.scrollIntoViewIfNeeded();
  // Let the section's own entrance finish before measuring.
  await page.waitForFunction(() => document.querySelector('.home-feature').getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'));
  const before = await page.locator('.home-modes').evaluate((node) => node.offsetTop);
  const height = await card.evaluate((node) => node.getBoundingClientRect().height);
  assert.equal(await page.locator('.rc-back').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('[data-rc-rate]').getAttribute('aria-hidden'), 'true');
  const flip = page.locator('[data-rc-flip]');
  await flip.focus();
  await page.keyboard.press('Enter');
  assert.equal(await flip.getAttribute('aria-expanded'), 'true');
  assert.ok(await page.locator('[data-rc-card]').evaluate((node) => node.classList.contains('is-flipped')));
  assert.ok(await page.locator('[data-rc-grade="good"]').evaluate((node) => document.activeElement === node), 'focus moves to the rating');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.rc-back')).visibility === 'visible');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-rc-grade="fuzzy"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-rc-spacing]').evaluate((node) => node.style.getPropertyValue('--rc-at')), '1');
  assert.match(await page.locator('[data-rc-note-out]').innerText(), /fuzzy/i);
  assert.equal((await flip.innerText()).trim(), 'Try it again');
  assert.ok(await flip.evaluate((node) => document.activeElement === node));
  assert.ok(Math.abs(await card.evaluate((node) => node.getBoundingClientRect().height) - height) < .5, 'turning the card never changes its height');
  assert.equal(await page.locator('.home-modes').evaluate((node) => node.offsetTop), before, 'nothing below the card moves');
  await flip.click();
  assert.ok(!(await page.locator('[data-rc-card]').evaluate((node) => node.classList.contains('is-flipped'))));
  assert.equal(await page.locator('[data-rc-spacing]').evaluate((node) => node.style.getPropertyValue('--rc-at')), '0');
});

test('knowledge-map points explain their connection on hover and keyboard focus', async (t) => {
  const page = await animatedPage(t);
  const why = page.locator('[data-graph-why-text]');
  const idle = await why.innerText();
  await page.locator('.m-graph-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.home-graph').getAnimations({ subtree: true }).every((animation) => animation.playState !== 'running'));
  await page.locator('[data-node="base"]').hover();
  assert.match(await why.innerText(), /base rate/i);
  assert.ok(await page.locator('.kg-edge[data-a="base"][data-b="fp"]').evaluate((node) => node.classList.contains('is-lit')));
  await page.mouse.move(0, 0);
  assert.equal(await why.innerText(), idle);
  await page.locator('[data-node="fp"]').focus();
  assert.match(await why.innerText(), /False positives/);
  assert.equal(await page.locator('[data-node="fp"]').getAttribute('aria-label'), 'False positives');
  assert.equal(await page.locator('[data-graph-why]').getAttribute('aria-live'), 'polite');
});

test('product steps share one thread that reaches each step as it is read', async (t) => {
  const page = await animatedPage(t, '/product');
  const list = page.locator('.m-steps');
  assert.equal(await page.locator('.m-step.is-reached').count(), 0, 'nothing is reached before the steps are in view');
  await list.scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, innerHeight / 3));
  await page.waitForFunction(() => document.querySelectorAll('.m-step.is-reached').length === 3);
  assert.equal(await page.locator('.m-thread').evaluate((node) => node.style.getPropertyValue('--thread')), '1');
  const geometry = await page.evaluate(() => {
    const thread = document.querySelector('.m-thread').getBoundingClientRect();
    const first = document.querySelector('.m-step').getBoundingClientRect();
    return { width: thread.width, height: thread.height, left: thread.left - first.left };
  });
  assert.equal(geometry.height, 1, 'a hairline on desktop');
  assert.ok(geometry.width > 600 && geometry.left > 30 && geometry.left < 70, 'the thread runs from the first numbered point');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(page.url());
  assert.equal(await page.locator('.m-step.is-reached').count(), 3, 'reduced motion shows the whole thread at once');
});

test('plan cards draw a hairline on hover and leave plan copy untouched', async (t) => {
  const page = await animatedPage(t, '/pricing');
  const plan = page.locator('.plan').first();
  const text = await plan.innerText();
  assert.equal(await page.locator('.plan .m-trace rect').count(), await page.locator('.plan').count());
  const offset = () => plan.locator('.m-trace rect').evaluate((node) => parseFloat(getComputedStyle(node).strokeDashoffset));
  assert.equal(await offset(), 1);
  await plan.hover();
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.plan .m-trace rect')).strokeDashoffset) === 0);
  assert.equal(await plan.innerText(), text);
});

test('the 404 thread breaks off before an open question', async (t) => {
  // The 404 page carries no consent banner, so it opens without the helper.
  const context = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  t.after(() => context.close());
  await context.route('https://**/*', (route) => route.abort());
  const page = await context.newPage();
  await page.goto(site.baseURL + '/404.html');
  assert.match(await page.locator('.nf-thread figcaption').innerText(), /doesn’t have an answer yet/);
  assert.equal(await page.locator('.nf-thread svg').getAttribute('aria-hidden'), 'true');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
});

// Chinese pages render in self-hosted Noto Sans SC subsets (font-display: swap).
// Without the generated <link rel="preload" data-cjk-preload> tags the subsets
// arrived ~500 ms after first paint and the header links, hero copy and cookie
// banner re-wrapped: zh product at 390 measured CLS 0.11–0.16.
test('Chinese pages do not shift when their CJK font subsets arrive', async (t) => {
  for (const [path, width] of [['/zh/product', 390], ['/zh/', 390], ['/zh/research', 1440], ['/zh/pricing', 1440]]) {
    const context = await site.browser.newContext({ viewport: { width, height: 900 } });
    t.after(() => context.close());
    await context.route('https://**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(site.baseURL + path);
    assert.ok(await page.locator('link[rel="preload"][data-cjk-preload]').count() > 0, `${path} preloads its first-screen CJK subsets`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const cls = await page.evaluate(() => window.__cls);
    assert.ok(cls <= 0.01, `${path} at ${width}px shifted by CLS ${cls.toFixed(4)}`);
  }
});

// Round 7 · A. The network question mark.
test('the hero question mark gathers once, unwinds onto the chain and rests when out of view', async (t) => {
  const context = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  t.after(() => context.close());
  await context.route('https://**/*', (route) => route.abort());
  await context.addInitScript(() => {
    window.__shift = 0;
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    window.__draws = 0;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.__draws += 1; return clear.apply(this, args); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(site.baseURL + '/');
  await page.locator('[data-consent-choice="essential"]').click();
  const canvas = page.locator('.home-hero canvas.hero-mark-canvas');
  assert.equal(await canvas.count(), 1);
  assert.equal(await canvas.getAttribute('aria-hidden'), 'true');
  assert.equal(await canvas.evaluate((node) => getComputedStyle(node).pointerEvents), 'none');
  assert.ok(await page.locator('.hero-mark').evaluate((node) => node.classList.contains('is-live')));
  assert.equal(await page.locator('.hero-mark-svg').evaluate((node) => getComputedStyle(node).opacity), '0', 'the canvas, not the static mark, plays the entrance');
  // Drawn at device pixels, sized to the hero and reaching the chain's first dot.
  const size = await canvas.evaluate((node) => ({ w: node.width, cssW: node.getBoundingClientRect().width }));
  assert.equal(size.w, Math.round(size.cssW * Math.min(2, await page.evaluate(() => devicePixelRatio))));
  await page.waitForTimeout(1500);
  const ink = (x, y) => canvas.evaluate((node, [x, y]) => {
    const box = node.getBoundingClientRect();
    const scale = node.width / box.width;
    const data = node.getContext('2d').getImageData(Math.round((x - box.left) * scale) - 2, Math.round((y - box.top) * scale) - 2, 5, 5).data;
    let max = 0;
    for (let i = 3; i < data.length; i += 4) max = Math.max(max, data[i]);
    return max;
  }, [x, y]);
  const point = await page.evaluate(() => {
    const mark = document.querySelector('.hero-mark').getBoundingClientRect();
    const dot = document.querySelector('.hero-mark .hm-dot');
    const s = mark.height / 560;
    return { x: mark.left + Number(dot.getAttribute('cx')) * s, y: mark.top + Number(dot.getAttribute('cy')) * s };
  });
  assert.ok(await ink(point.x, point.y) > 200, 'the black point is in place after the ~1.2s entrance');
  // Breathing keeps redrawing while the hero is in view.
  const breathing = await page.evaluate(async () => { const a = window.__draws; await new Promise((r) => setTimeout(r, 400)); return window.__draws - a; });
  assert.ok(breathing > 3, 'the nodes breathe');
  // Scrolling away unwinds the mark; the point lands on the chain's first dot.
  const target = await page.evaluate(() => {
    const dot = document.querySelector('.home-chain .qc-dot').getBoundingClientRect();
    return dot.top + scrollY;
  });
  await page.evaluate((y) => scrollTo({ top: y - innerHeight * .4, behavior: 'instant' }), target);
  await page.waitForTimeout(400);
  const landed = await page.evaluate(() => { const dot = document.querySelector('.home-chain .qc-dot').getBoundingClientRect(); return { x: dot.left + dot.width / 2, y: dot.top + dot.height / 2 }; });
  assert.ok(await ink(landed.x, landed.y) > 200, 'the point has dropped onto the question chain');
  // Off screen, nothing redraws.
  await page.evaluate(() => scrollTo({ top: document.querySelector('.home-feature').getBoundingClientRect().top + scrollY + 400, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const idle = await page.evaluate(async () => { const a = window.__draws; await new Promise((r) => setTimeout(r, 500)); return window.__draws - a; });
  assert.equal(idle, 0, 'the canvas rests when the hero is out of view');
  assert.ok(await page.evaluate(() => window.__shift) < .01, 'the mark never shifts the layout');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('canvas.hero-mark-canvas'));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.hero-mark-svg')).opacity === '1');
  assert.deepEqual(errors, []);
});

test('without scripts the finished question mark is shown and the hero stays usable', async (t) => {
  const page = await sitePage(site, t, '/zh/', 1440, false);
  assert.ok(await page.locator('.hero-mark-svg').isVisible());
  assert.equal(await page.locator('canvas').count(), 0);
  assert.equal(await page.locator('.hero-mark .hm-dot').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440);
});

// Round 7 · B. The mode deck.
test('the mode deck pins, turns with scroll, keys and buttons, and keeps one card reachable', async (t) => {
  const page = await animatedPage(t);
  const deck = page.locator('[data-deck]');
  const tabs = page.locator('[data-deck-nav] [role="tab"]');
  assert.equal(await page.locator('[data-deck-nav]').getAttribute('role'), 'tablist');
  assert.equal(await tabs.count(), 5);
  assert.equal(await page.locator('[data-deck-card][role="tabpanel"]').count(), 5);
  assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('[data-deck-card][data-k="0"]').getAttribute('id'), 'mode-dialogue');
  assert.equal(await page.locator('[data-deck-card]').evaluateAll((cards) => cards.filter((card) => card.inert).length), 4, 'only the front card is reachable');
  const geometry = await deck.evaluate((node) => ({ height: node.offsetHeight, vh: innerHeight, sticky: getComputedStyle(node.querySelector('.deck-stage')).position }));
  assert.equal(geometry.sticky, 'sticky');
  assert.ok(geometry.height <= geometry.vh * 3.05, 'the pinned run stays within about three viewports');
  // Scroll halfway through the track: the third mode comes to the front.
  await deck.evaluate((node) => scrollTo({ top: node.getBoundingClientRect().top + scrollY + (node.offsetHeight - innerHeight) * .5, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-deck-index]').textContent === '3');
  assert.equal(await page.locator('[data-deck-card][data-k="0"]').getAttribute('id'), 'mode-map');
  assert.equal(await page.locator('[data-deck-card][data-k="-1"]').count(), 2, 'turned cards have left the deck');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  // Keyboard: arrows move selection and focus, and the page follows.
  await tabs.nth(2).focus();
  await page.keyboard.press('ArrowRight');
  assert.ok(await tabs.nth(3).evaluate((node) => document.activeElement === node));
  assert.equal(await tabs.nth(3).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(3).getAttribute('tabindex'), '0');
  await page.waitForFunction(() => document.querySelector('[data-deck-index]').textContent === '4');
  await page.waitForTimeout(900);
  assert.equal(await page.locator('[data-deck-index]').innerText(), '4', 'the scroll position agrees with the chosen mode');
  await page.keyboard.press('End');
  assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
  assert.ok(await page.locator('[data-deck-next]').isDisabled());
  await page.waitForTimeout(900);
  await page.locator('[data-deck-prev]').click();
  await page.waitForFunction(() => document.querySelector('[data-deck-index]').textContent === '4');
  assert.match(await page.locator('[data-deck-live]').innerText(), /Exam mode/);
  assert.ok(await page.locator('#mode-exam a.m-link').isVisible());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('[data-deck-nav]').hasAttribute('role'));
  assert.equal(await page.locator('[data-deck-card][data-k]').count(), 0);
  assert.equal(await page.locator('[data-deck-card]').evaluateAll((cards) => cards.filter((card) => card.inert).length), 0);
  assert.equal(await deck.evaluate((node) => getComputedStyle(node.querySelector('.deck-stage')).position), 'static');
});

test('phones turn the deck without pinning; reduced motion and no-JS list every card', async (t) => {
  const context = await site.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', hasTouch: true });
  t.after(() => context.close());
  await context.route('https://**/*', (route) => route.abort());
  const page = await context.newPage();
  await page.goto(site.baseURL + '/zh/');
  await page.locator('[data-consent-choice="essential"]').click();
  const deck = page.locator('[data-deck]');
  assert.equal(await deck.evaluate((node) => getComputedStyle(node.querySelector('.deck-stage')).position), 'static');
  assert.ok(await deck.evaluate((node) => node.offsetHeight < innerHeight * 1.6), 'no sticky run on phones');
  await page.locator('[data-deck-next]').click();
  assert.equal(await page.locator('[data-deck-index]').innerText(), '2');
  assert.equal(await page.locator('[data-deck-card][data-k="0"]').getAttribute('id'), 'mode-recall');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);

  const reduced = await sitePage(site, t, '/', 390);
  const cards = reduced.locator('[data-deck-card]');
  assert.equal(await cards.count(), 5);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    assert.ok(await card.isVisible());
    assert.equal(await card.evaluate((node) => getComputedStyle(node).opacity), '1');
  }
  assert.ok(await reduced.locator('[data-deck-controls]').evaluate((node) => node.hidden));
  const tops = await cards.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
  assert.ok(tops.every((top, i) => i === 0 || top > tops[i - 1]), 'the cards form a vertical list');

  const noJS = await sitePage(site, t, '/', 1440, false);
  assert.equal(await noJS.locator('[data-deck-pill]').first().getAttribute('href'), '#mode-dialogue');
  assert.equal(await noJS.locator('[data-deck-card]').evaluateAll((nodes) => nodes.filter((node) => node.checkVisibility()).length), 5);
});

// Round 7 · E. The footer wordmark.
test('the footer wordmark’s point drops and lights up at the end of the page', async (t) => {
  const page = await animatedPage(t, '/product');
  const mark = page.locator('.site-footer [data-wordmark]');
  assert.equal(await mark.getAttribute('aria-hidden'), 'true');
  assert.equal(await mark.locator('img').getAttribute('alt'), '');
  const dot = mark.locator('.site-wordmark-dot');
  assert.notEqual(await dot.evaluate((node) => getComputedStyle(node).transform), 'none', 'the point waits above the line');
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-wordmark]').classList.contains('is-lit'));
  await page.waitForFunction(() => {
    const node = document.querySelector('.site-wordmark-dot');
    return getComputedStyle(node).transform === 'matrix(1, 0, 0, 1, 0, 0)' || getComputedStyle(node).transform === 'none';
  });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-wordmark-dot'), '::after').opacity === '1');
  const fit = await mark.evaluate((node) => ({ w: node.getBoundingClientRect().width, inner: document.querySelector('.site-footer-bottom').getBoundingClientRect().width }));
  assert.ok(Math.abs(fit.w - fit.inner) < 1, 'the wordmark spans the content width');
  for (const [path, width] of [['/zh/', 390], ['/', 2560]]) {
    const still = await sitePage(site, t, path, width);
    await still.evaluate(() => scrollTo(0, document.body.scrollHeight));
    assert.equal(await still.locator('.site-wordmark-dot').evaluate((node) => getComputedStyle(node).transform), 'none', 'reduced motion shows the lit point in place');
    assert.equal(await still.evaluate(() => document.documentElement.scrollWidth), width);
  }
});
