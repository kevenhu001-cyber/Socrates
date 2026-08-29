// Probe additional desktop landing states: focused composer, language chip.
import { chromium } from '@playwright/test';
import { mockAuthedApp } from '../e2e/_mock-api.mjs';
import { gotoAndSettle } from '../e2e/_lib.mjs';
import { waitForAppShell } from '../e2e/_mock-api.mjs';

const BASE = 'http://127.0.0.1:4173';

const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await mockAuthedApp(page);
await gotoAndSettle(page, BASE + '/');
await waitForAppShell(page);
await page.waitForTimeout(400);

await page.locator('#topicComposerRoot .rich-composer-editor').click();
await page.waitForTimeout(400);
await page.screenshot({ path: 'tmp-shots/cur-desktop-focused.png' });

await page.locator('.topic-input-wrap .composer-lang-trigger').click();
await page.waitForTimeout(250);
await page.screenshot({ path: 'tmp-shots/cur-desktop-lang.png' });

await page.close();
await browser.close();
console.log('done');
