import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderChrome } from '../scripts/sync-site-chrome.mjs';
import { sitePage, startSite, stopSite } from './helpers/site-browser.mjs';

let site;
before(async () => { site = await startSite(); });
after(async () => { await stopSite(site); });

for (const prefix of ['', '/zh']) {
  const path = `${prefix}/product`;
  for (const width of [320, 390, 760, 761, 1080, 1081, 1280, 1920]) {
    test(`${path} at ${width}px: product evidence and CTA are readable and contained`, async (t) => {
      const page = await sitePage(site, t, path, width);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('.product-feature').count(), 4);
      assert.equal(await page.locator('.product-hero .product-button').getAttribute('href'), 'https://app.topodrive.top');
      const layout = await page.evaluate(() => {
        const cta = document.querySelector('.product-hero .product-button').getBoundingClientRect();
        const preview = document.querySelector('.product-preview').getBoundingClientRect();
        const description = document.querySelector('.product-hero-description').getBoundingClientRect();
        const title = document.querySelector('h1').getBoundingClientRect();
        const text = [...document.querySelectorAll('.product-message, .product-feature-description, .product-map-node')];
        return {
          ctaBottom: cta.bottom, previewTop: preview.top, width: document.documentElement.scrollWidth,
          descriptionCenter: description.x + description.width / 2,
          descriptionGap: description.top - title.bottom,
          featureGaps: [...document.querySelectorAll('.product-feature-copy')].map((copy) => copy.querySelector('.product-feature-description').getBoundingClientRect().top - copy.querySelector('h2').getBoundingClientRect().bottom),
          minText: Math.min(...text.map((node) => parseFloat(getComputedStyle(node).fontSize))),
          clipped: text.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.className),
          sidebar: document.querySelector('.product-sidebar').checkVisibility(),
          cards: [...document.querySelectorAll('.product-preview, .product-sample')].map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, right: box.right };
          }),
          headerHeight: document.querySelector('.site-header').getBoundingClientRect().height,
          viewportHeight: innerHeight,
        };
      });
      assert.ok(layout.ctaBottom < layout.viewportHeight, 'main CTA belongs in the first viewport');
      assert.ok(layout.previewTop < layout.viewportHeight - 120, 'product demonstration starts in the first viewport');
      assert.equal(layout.width, width);
      assert.equal(layout.headerHeight, 64);
      assert.ok(Math.abs(layout.descriptionCenter - width / 2) < 1, 'hero description shares the title centerline');
      assert.ok(layout.descriptionGap >= 16 && layout.featureGaps.every((gap) => gap >= 16), 'paragraph resets must not erase editorial spacing');
      assert.ok(layout.minText >= 14, 'interface text must not be a scaled-down thumbnail');
      assert.deepEqual(layout.clipped, []);
      assert.equal(layout.sidebar, width > 760);
      for (const card of layout.cards) assert.ok(card.x >= 0 && card.right <= width, 'demo stays inside the viewport');
      assert.match(await page.locator('#product-preview-caption').innerText(), /non-interactive|非交互/);
      assert.equal(await page.locator('.product-preview button, .product-preview input, .product-preview a').count(), 0, 'illustration must not offer fake controls');
      for (const anchor of ['dialogue', 'recall', 'knowledge-map', 'exam', 'mistake-book']) {
        assert.equal(await page.locator(`[id="${anchor}"]`).count(), 1, `preserve ${anchor} deep link`);
      }
      await page.locator('.product-jump-nav a[href="#knowledge-map"]').click();
      const map = await page.locator('#knowledge-map').boundingBox();
      assert.ok(map.y >= 64 && map.y < 130, 'deep links clear the sticky header');
    });
  }

  test(`${path}: no-JS navigation, product content and footer links work`, async (t) => {
    const page = await sitePage(site, t, path, 390, false);
    assert.equal(await page.locator('.site-nav a').evaluateAll((links) => links.filter((link) => link.checkVisibility()).length), 7);
    assert.equal(await page.locator('.site-footer-grid a').evaluateAll((links) => links.filter((link) => link.checkVisibility()).length), 36);
    assert.equal(await page.locator('.site-footer-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2);
    assert.ok(await page.locator('.product-message--tutor').isVisible());
    assert.equal(await page.locator('.site-header .site-locale').first().getAttribute('href'), prefix ? '/product' : '/zh/product');
    await page.locator('.product-jump-nav a[href="#recall"]').click();
    assert.ok((await page.locator('#recall').boundingBox()).y >= 64);
    assert.equal(await page.locator('.site-header .site-brand-label').innerText(), 'Socrates');
  });

  test(`${path}: mobile menu traps focus, closes on Escape/scrim and survives resizing`, async (t) => {
    const page = await sitePage(site, t, path, 390);
    const toggle = page.locator('[data-site-menu-toggle]');
    const menu = page.locator('.site-mobile-menu');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(await page.locator('main').evaluate((node) => node.inert));
    assert.ok(await menu.locator('nav a').first().evaluate((node) => document.activeElement === node));
    await menu.locator('.site-locale').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('.site-header-inner > .site-brand').evaluate((node) => document.activeElement === node));
    await page.keyboard.press('Shift+Tab');
    assert.ok(await menu.locator('.site-locale').evaluate((node) => document.activeElement === node));
    await page.keyboard.press('Escape');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(await toggle.evaluate((node) => document.activeElement === node));
    assert.ok(!(await page.locator('main').evaluate((node) => node.inert)));
    await toggle.click();
    await page.locator('.site-menu-scrim').click({ position: { x: 3, y: 820 } });
    assert.ok(!(await menu.isVisible()));
    await toggle.click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => document.querySelector('[data-site-menu-toggle]').getAttribute('aria-expanded') === 'false');
    assert.ok(await page.locator('.site-nav a').first().evaluate((node) => document.activeElement === node));
    assert.ok(!(await page.locator('main').evaluate((node) => node.inert)));
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('site-menu-open')), false);
  });
}

for (const path of ['/', '/about', '/research', '/research/memory-recall/', '/pricing', '/guide', '/zh/', '/zh/about', '/zh/research', '/zh/research/memory-recall/', '/zh/pricing', '/zh/guide']) {
  test(`${path}: public chrome uses the same brand, dimensions and destinations`, async (t) => {
    const page = await sitePage(site, t, path, 1280);
    const chrome = await page.evaluate(() => {
      const header = document.querySelector('.site-header');
      const brand = header.querySelector('.site-brand');
      return {
        height: header.getBoundingClientRect().height,
        logo: brand.querySelector('img').getBoundingClientRect().width,
        label: getComputedStyle(brand.querySelector('span')).fontSize,
        family: getComputedStyle(brand.querySelector('span')).fontFamily,
        x: brand.getBoundingClientRect().x,
        nav: [...header.querySelectorAll('.site-nav a')].map((node) => node.getAttribute('href')),
        footerLinks: document.querySelectorAll('.site-footer-grid a').length,
      };
    });
    assert.equal(chrome.height, 64);
    assert.equal(chrome.logo, 24);
    assert.equal(chrome.label, '18px');
    assert.match(chrome.family, /Geist Sans/);
    assert.equal(chrome.x, 32);
    assert.equal(chrome.footerLinks, 36);
    const prefix = path.startsWith('/zh/') ? '/zh' : '';
    assert.deepEqual(chrome.nav, ['product', 'research', 'principles', 'learn', 'developers', 'pricing', 'about'].map((part) => `${prefix}/${part}`));
    assert.deepEqual(await page.locator('.site-footer a[data-site-static]').evaluateAll((links) => links.map((node) => node.getAttribute('href'))), ['/openapi.json', '/llms.txt']);
    assert.equal(await page.locator('.site-header .site-brand-label').innerText(), 'Socrates', 'locale observer must not turn the brand into a language switch');
    if (path.includes('research/')) assert.equal(await page.locator('.site-nav a[aria-current="page"]').getAttribute('href'), `${prefix}/research`);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('.site-footer-col[open]').length === 0);
    assert.equal((await page.locator('.site-header').boundingBox()).height, 64);
    assert.ok(await page.locator('[data-site-menu-toggle]').isVisible());
    assert.ok((await page.locator('.site-footer').boundingBox()).height < 720);
    await page.locator('.site-footer-summary').first().focus();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => document.querySelectorAll('.site-footer-col[open]').length === 5);
    assert.ok(await page.locator('.site-footer-col a').first().evaluate((node) => document.activeElement === node), 'a desktop-hidden summary must not retain focus');
  });
}

test('language switch preserves the current page, query, deep link and brand', async (t) => {
  const page = await sitePage(site, t, '/product?ref=round2#recall', 1280);
  const switcher = page.locator('.site-header-actions > .site-locale');
  assert.equal(await switcher.getAttribute('href'), '/zh/product?ref=round2#recall');
  await switcher.click();
  await page.waitForURL(`${site.baseURL}/zh/product?ref=round2#recall`);
  await page.locator('.site-header[data-chrome-ready]').waitFor();
  assert.equal(await page.locator('.site-header .site-brand-label').innerText(), 'Socrates');
  assert.equal(await page.locator('.site-header-actions > .site-locale').getAttribute('href'), '/product?ref=round2#recall');
  assert.equal(await page.locator('.site-nav a').first().getAttribute('href'), '/zh/product');
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
});

test('shared templates retain all footer destinations and generate equivalent localized product structure', async () => {
  for (const locale of ['en', 'zh']) {
    const { footer } = renderChrome('/research/memory-recall/', locale);
    assert.equal((footer.match(/<details /g) || []).length, 5);
    assert.match(footer, locale === 'en' ? /href="\/zh\/research\/memory-recall\/"/ : /href="\/research\/memory-recall\/"/);
    assert.match(footer, /href="\/openapi.json" data-site-static/);
  }
  const pages = await Promise.all(['../site/product.html', '../site/zh/product.html'].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const structure = (html) => [...html.matchAll(/<(?:section|div|figure|article|nav)\b[^>]*class="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(structure(pages[0]), structure(pages[1]), 'translations must not drift into separate page designs');
  assert.ok(pages.every((html) => !html.includes('fonts.googleapis.com')), 'product render should use local fonts');
});
