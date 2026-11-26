import { test, expect, devices } from '@playwright/test';
import { mockAuthedApp } from './_mock-api.mjs';

// Fresh browser contexts + disabled HTTP cache. Mocked API isolates the
// production Web shell, not backend or external network latency.
const profiles = [
  { name: 'desktop', options: { viewport: { width: 1280, height: 800 } }, cpu: 1 },
  { name: 'mobile-chromium-4x', options: devices['Pixel 5'], cpu: 4 },
];
for (const profile of profiles) {
  test('cold startup: ' + profile.name, async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(120_000);
    const samples = [];
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({ ...profile.options, baseURL });
      try {
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        if (profile.cpu > 1) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        }
        await mockAuthedApp(page);
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const editor = page.locator('#composerInputWrap .tiptap');
        await expect(editor).toBeVisible({ timeout: 25_000 });
        await expect(editor).toBeEditable({ timeout: 25_000 });
        const sample = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0];
          const paints = performance.getEntriesByType('paint');
          const resources = performance.getEntriesByType('resource');
          return {
            composerReadyMs: Math.round(performance.now()),
            domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
            firstContentfulPaintMs: Math.round(paints.find(p => p.name === 'first-contentful-paint')?.startTime ?? 0),
            resourceTransferBytes: resources.reduce((sum, r) => sum + r.transferSize, 0),
            scriptRequests: resources.filter(r => new URL(r.name).pathname.endsWith('.js')).length,
          };
        });
        samples.push(sample);
      } finally {
        await context.close();
      }
    }
    const median = Object.fromEntries(Object.keys(samples[0]).map(key => [
      key, samples.map(sample => sample[key]).sort((a, b) => a - b)[1],
    ]));
    const result = { profile: profile.name, cpuThrottle: profile.cpu, samples, median };
    console.log('Cold-start benchmark: ' + JSON.stringify(result));
    await testInfo.attach('cold-start.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  });
}
