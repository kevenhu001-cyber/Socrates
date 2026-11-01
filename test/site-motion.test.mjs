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
