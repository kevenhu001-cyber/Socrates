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
  for (const selector of ['.feature-intro', '.home-news', '.home-research-note', '.home-teams']) {
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

test('the research filter row holds its place from the first paint', async (t) => {
  for (const [path, width] of [['/research', 390], ['/zh/research', 390], ['/research', 1440]]) {
    const context = await site.browser.newContext({ viewport: { width, height: 844 } });
    t.after(() => context.close());
    await context.route('https://**/*', (route) => route.abort());
    // Hold research-index.js back, so a late filter row would push the list.
    await context.route(/research-index\.js/, async (route) => { await new Promise((r) => setTimeout(r, 600)); await route.continue(); });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(site.baseURL + path, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelector('#research-notes') && [...document.styleSheets].some((sheet) => (sheet.href || '').includes('/research.css')) && document.fonts.status === 'loaded');
    const before = await page.locator('#research-notes').evaluate((node) => node.getBoundingClientRect().top + scrollY);
    await page.waitForFunction(() => !document.querySelector('[data-research-filters]').hidden);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#research-notes').evaluate((node) => node.getBoundingClientRect().top + scrollY), before, `${path} list stays put`);
    const cls = await page.evaluate(() => window.__cls);
    assert.ok(cls <= 0.01, `${path} at ${width}px shifted by CLS ${cls.toFixed(4)}`);
  }
  const noJS = await sitePage(site, t, '/research', 390, false);
  assert.ok(await noJS.locator('[data-research-filters]').evaluate((node) => !node.checkVisibility()), 'without scripts the inert filters stay hidden');
});

test('NASA hero remains present as the reader reaches the interactive question chain', async (t) => {
  const page = await animatedPage(t);
  const image = page.locator('.home-hero-image img');
  assert.equal(await image.getAttribute('src'), '/media/socrates-nasa-endeavour-limb-v2.jpg');
  assert.ok(await image.evaluate((node) => node.complete && node.naturalWidth > 0));
  await page.locator('#question-chain').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('#question-chain [data-qc-next]').isVisible());
  assert.equal(await page.locator('canvas.hero-mark-canvas, [data-hero-field], .hero-mark').count(), 0);
});

test('without scripts the NASA hero image and native question form stay usable', async (t) => {
  const page = await sitePage(site, t, '/zh/', 390, false);
  const image = page.locator('.home-hero-image img');
  assert.equal(await image.getAttribute('src'), '/media/socrates-nasa-endeavour-limb-v2.jpg');
  assert.ok(await image.evaluate((node) => node.complete && node.naturalWidth > 0));
  assert.equal(await page.locator('[data-ask-form]').count(), 1);
  assert.equal(await page.locator('#askInputHero').getAttribute('name'), 'q');
  assert.equal(await page.locator('canvas.hero-mark-canvas, [data-hero-field], .hero-mark').count(), 0);
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
  assert.ok(geometry.height <= geometry.vh * 2.85, 'the pinned run stays within 2.8 viewports (shorter than round 7)');
  // At rest the deck reads as a stack: the cards behind sit lower, smaller
  // and grayer than the front one.
  const stack = await page.locator('[data-deck-card]').evaluateAll((cards) => cards.slice(0, 4).map((card) => { const m = new DOMMatrix(getComputedStyle(card).transform); return { y: m.f, s: m.a, veil: Number(getComputedStyle(card, '::after').opacity) }; }));
  for (let i = 1; i < 4; i += 1) {
    assert.ok(stack[i].y > stack[i - 1].y && stack[i].y - stack[i - 1].y >= 8 && stack[i].y - stack[i - 1].y <= 14, 'each card behind steps down by 8-14px');
    assert.ok(stack[i].s < stack[i - 1].s && stack[i].veil > stack[i - 1].veil, 'and is smaller and grayer');
  }
  // Scroll to the middle of the third step (one step per card, then the end).
  await deck.evaluate((node) => scrollTo({ top: node.getBoundingClientRect().top + scrollY + (node.offsetHeight - innerHeight) * 2.5 / 6, behavior: 'instant' }));
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
  // One more step past the fifth card folds the deck into its end row.
  await deck.evaluate((node) => scrollTo({ top: node.getBoundingClientRect().top + scrollY + (node.offsetHeight - innerHeight) * .97, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-deck]').hasAttribute('data-done'));
  await page.waitForTimeout(900);
  assert.equal(await page.locator('[data-deck-index]').innerText(), '5', 'the count stays on 5 / 5');
  assert.equal(await page.locator('[data-deck-card]').evaluateAll((cards) => cards.filter((card) => card.checkVisibility({ visibilityProperty: true })).length), 0, 'the cards have folded away');
  assert.equal(await page.locator('.deck-end-dots i').evaluateAll((dots) => dots.filter((dot) => getComputedStyle(dot).opacity === '1').length), 5, 'five dots: every mode met');
  const endLink = page.locator('.deck-end-link');
  assert.ok(await endLink.isVisible());
  assert.equal(await endLink.getAttribute('href'), '/product');
  await endLink.focus();
  assert.ok(await endLink.evaluate((node) => document.activeElement === node), 'the way into the product is reachable by keyboard');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);
  // Choosing a mode again unfolds the deck on that card.
  await page.locator('[data-deck-prev]').click();
  await page.waitForFunction(() => document.querySelector('[data-deck-index]').textContent === '4');
  await page.waitForFunction(() => !document.querySelector('[data-deck]').hasAttribute('data-done'));
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
  // Unpinned, the end row fills one dot per mode met, in step with n / 5.
  assert.equal(await page.locator('.deck-end-dots i.is-on').count(), 2);
  for (let i = 0; i < 3; i += 1) await page.locator('[data-deck-next]').click();
  assert.equal(await page.locator('.deck-end-dots i.is-on').count(), 5);
  assert.ok(await page.locator('.deck-end-link').isVisible());
  assert.equal(await page.locator('[data-deck]').getAttribute('data-done'), null, 'phones never fold the deck away');
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
  // Round 10: the full stop is a 3 x 3 halftone block like the hero's point,
  // not a solid disc, and it stays in proportion to the letters.
  const look = await dot.evaluate((node) => {
    const style = getComputedStyle(node);
    // Layout size, not the (possibly scaled) painted box.
    return { image: style.backgroundImage, size: style.backgroundSize, radius: style.borderTopLeftRadius, ratio: node.offsetHeight / node.parentElement.offsetHeight, square: node.offsetWidth / node.offsetHeight };
  });
  assert.match(look.image, /radial-gradient/);
  assert.match(look.size, /^33\.33\d*% 33\.33\d*%$/, 'three dots a side');
  assert.equal(look.radius, '0px', 'no disc');
  assert.ok(look.ratio < .3 && Math.abs(look.square - 1) < .01, 'a period-sized square');
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

// Round 9 ---------------------------------------------------------------

test('editing the hero question updates its submit state without changing the NASA artwork', async (t) => {
  const page = await animatedPage(t);
  const input = page.locator('#askInputHero');
  const form = page.locator('[data-ask-form]');
  const image = page.locator('.home-hero-image img');
  await input.focus();
  await input.fill('Why does the horizon glow?');
  assert.ok(await form.evaluate((node) => node.classList.contains('has-value')));
  assert.equal(await input.inputValue(), 'Why does the horizon glow?');
  assert.ok(await image.isVisible());
  await input.fill('');
  assert.equal(await form.evaluate((node) => node.classList.contains('has-value')), false);
  assert.equal(await image.getAttribute('src'), '/media/socrates-nasa-endeavour-limb-v2.jpg');
});


test('the question chain grows its map out of the dot field, node by node, on its points', async (t) => {
  const page = await animatedPage(t);
  const chain = page.locator('#question-chain');
  await page.waitForFunction(() => document.querySelector('.qc-stage').hasAttribute('data-qc-grid'));
  const offGrid = () => page.evaluate(() => {
    const stage = document.querySelector('.qc-stage');
    const style = getComputedStyle(stage);
    const g = parseFloat(style.getPropertyValue('--qc-g'));
    const gx = parseFloat(style.getPropertyValue('--qc-gx'));
    const gy = parseFloat(style.getPropertyValue('--qc-gy'));
    const at = stage.getBoundingClientRect();
    const svg = document.querySelector('.qc-map-svg');
    const m = svg.getScreenCTM();
    let worst = 0;
    svg.querySelectorAll('.qc-node circle').forEach((c) => {
      const x = m.a * c.cx.baseVal.value + m.e - at.left - gx - g / 2;
      const y = m.d * c.cy.baseVal.value + m.f - at.top - gy - g / 2;
      for (const v of [x / g, y / g]) worst = Math.max(worst, Math.abs(v - Math.round(v)) * g);
    });
    return { worst, g };
  });
  const { worst, g } = await offGrid();
  assert.ok(Number.isInteger(g), `a field step is a whole number of pixels (${g})`);
  assert.ok(worst < .01, `every node sits on a point of the field (off by ${worst}px)`);
  const grid = () => page.locator('.qc-map [data-at].is-grid').count();
  assert.equal(await grid(), 8, 'at the first question only its own node is out of the field');
  const next = chain.locator('[data-qc-next]');
  await page.locator('.qc-list').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-qc-count]').textContent.trim() === '2 / 4');
  assert.equal(await grid(), 6, 'the struck answer becomes the crossed-out node');
  await next.click();
  assert.equal(await grid(), 4);
  await next.click();
  assert.equal(await grid(), 0, 'the last step leaves the whole map');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const narrow = await offGrid();
  assert.ok(narrow.worst < .01 && Number.isInteger(narrow.g), 'still on the field on a phone');
});

test('the 404 question gathers into its missing point, then goes home', async (t) => {
  const context = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  t.after(() => context.close());
  await context.route('https://**/*', (route) => route.abort());
  const page = await context.newPage();
  await page.goto(site.baseURL + '/404.html');
  assert.equal(await page.locator('.nf-mark .nf-stroke circle').count(), 68);
  assert.equal(await page.locator('.nf-point').evaluate((node) => getComputedStyle(node).opacity), '0', 'the point is missing');
  // Round 10: the same halftone cells as the home page's compact mark.
  const nf = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.nf-mark :is(.nf-stroke, .nf-point) circle')];
    const home = (n) => [Number(n.getAttribute('cx')), Number(n.getAttribute('cy'))];
    return { off: cells.filter((n) => home(n).some((v) => Math.abs(v - .5 - Math.round(v - .5)) > 1e-6)).length, point: document.querySelectorAll('.nf-point circle').length, largest: Math.max(...cells.map((n) => Number(n.getAttribute('r')))) };
  });
  assert.equal(nf.off, 0, 'every dot sits on a cell');
  assert.equal(nf.point, 9, 'the missing point is a 3 x 3 block');
  assert.ok(nf.largest <= .36 + 1e-6, 'no solid disc');
  await page.locator('.nf-primary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.nf-mark').getAttribute('data-gathering'), '');
  assert.ok(await page.evaluate(() => document.querySelector('.nf-mark').getAnimations({ subtree: true }).length > 50));
  await page.waitForURL(site.baseURL + '/', { timeout: 3000 });

  const reduced = await site.browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  t.after(() => reduced.close());
  await reduced.route('https://**/*', (route) => route.abort());
  const still = await reduced.newPage();
  await still.goto(site.baseURL + '/404.html');
  const started = Date.now();
  await still.locator('.nf-primary').click();
  await still.waitForURL(site.baseURL + '/');
  assert.ok(Date.now() - started < 1500, 'reduced motion goes straight home');
});

test('pages cross-fade under a header that stays put, only where motion is welcome', async (t) => {
  const page = await animatedPage(t, '/pricing');
  const rule = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      if (!(sheet.href || '').includes('/chrome.css')) continue;
      for (const rule of sheet.cssRules) if (rule.media && /prefers-reduced-motion: no-preference/.test(rule.media.mediaText) && /@view-transition/.test(rule.cssText)) return rule.cssText;
    }
    return '';
  });
  assert.match(rule, /navigation: auto/);
  assert.equal(await page.locator('.site-header').evaluate((node) => getComputedStyle(node).viewTransitionName), 'site-header');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.site-header').evaluate((node) => getComputedStyle(node).viewTransitionName), 'none');
});

test('each plan card carries a tier mark, one more point per step, without touching the plan copy', async (t) => {
  for (const path of ['/pricing', '/zh/pricing']) {
    const page = await sitePage(site, t, path, 1440);
    const lit = await page.locator('.plan-tier').evaluateAll((marks) => marks.map((mark) => mark.querySelectorAll('i.is-on').length));
    assert.deepEqual(lit, [1, 2, 3, 4]);
    assert.ok(await page.locator('.plan-tier').evaluateAll((marks) => marks.every((mark) => mark.getAttribute('aria-hidden') === 'true' && mark.textContent === '')));
  }
});
