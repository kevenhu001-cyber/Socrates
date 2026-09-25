import { chromium } from '@playwright/test';

const mode = process.argv.includes('--public') ? 'public' : 'origin';
const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const targetUrl = urlArg ? urlArg.slice('--url='.length) : 'https://app.topodrive.top/';
const targetHost = new URL(targetUrl).hostname;
const countArg = process.argv.find((arg) => arg.startsWith('--runs='));
const runs = countArg ? Number(countArg.split('=')[1]) : 3;
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error('--runs must be between 1 and 20');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: mode === 'origin'
    ? ['--no-sandbox', '--no-proxy-server', '--host-resolver-rules=MAP app.topodrive.top 127.0.0.1']
    : ['--no-sandbox', ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [])],
});

const samples = [];
try {
  for (let index = 0; index < runs; index += 1) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__loadVitals = { lcp: 0, longTasks: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__loadVitals.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__loadVitals.longTasks += entry.duration;
      }).observe({ type: 'longtask', buffered: true });
    });
    const responses = [];
    page.on('response', async (response) => {
      const url = new URL(response.url());
      if (url.hostname !== targetHost) return;
      const headers = await response.allHeaders();
      responses.push({ path: url.pathname, status: response.status(), cache: headers['cf-cache-status'] || null });
    });
    for (const cache of ['cold', 'warm']) {
      if (cache === 'cold') await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
      else await page.reload({ waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(1000);
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const paint = performance.getEntriesByType('paint').find((entry) => entry.name === 'first-contentful-paint');
        const critical = resources.filter((entry) => entry.startTime < navigation.domContentLoadedEventEnd &&
          /\.(js|css)(\?|$)/.test(entry.name));
        return {
          ttfbMs: navigation.responseStart,
          fcpMs: paint?.startTime ?? null,
          lcpMs: window.__loadVitals.lcp || null,
          dclMs: navigation.domContentLoadedEventEnd,
          loadMs: navigation.loadEventEnd,
          longTaskMs: window.__loadVitals.longTasks,
          criticalTransferBytes: critical.reduce((total, entry) => total + entry.transferSize, navigation.transferSize),
          fontRequests: resources.filter((entry) => /\.woff2?(\?|$)/.test(entry.name)).length,
          authRequests: resources.filter((entry) => entry.name.includes('/api/v2/auth/me')).length,
        };
      });
      samples.push({ run: index + 1, cache, ...metrics, cacheStatuses: responses.splice(0) });
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const metricNames = ['ttfbMs', 'fcpMs', 'lcpMs', 'dclMs', 'loadMs', 'longTaskMs', 'criticalTransferBytes', 'fontRequests', 'authRequests'];
const median = (numbers) => {
  const sorted = numbers.filter(Number.isFinite).sort((left, right) => left - right);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};
const summary = Object.fromEntries(['cold', 'warm'].map((cache) => [cache,
  Object.fromEntries(metricNames.map((name) => [name, median(samples.filter((sample) => sample.cache === cache).map((sample) => sample[name]))])),
]));
console.log(JSON.stringify({ mode, targetUrl, runs, summary, samples }, null, 2));
