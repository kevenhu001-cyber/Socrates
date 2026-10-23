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
