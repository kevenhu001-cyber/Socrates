const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const siteDir = path.join(__dirname, '..', 'site');
const outDir = path.join(__dirname, '..', 'tmp-shots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';
  
  let filePath = path.join(siteDir, reqPath);
  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found: ' + reqPath);
  }
});

async function run() {
  await new Promise((resolve) => server.listen(3456, resolve));
  console.log('Server started on http://localhost:3456');

  const browser = await chromium.launch({ headless: true });

  const viewports = {
    desktop: { width: 1440, height: 900 },
    tablet: { width: 834, height: 1112 },
    mobile: { width: 390, height: 844 }
  };

  const pagesToTest = [
    'index.html',
    'product.html',
    'pricing.html',
    'about.html',
    'developers.html',
    'research.html',
    'policy.html',
    'learn.html',
    'documents.html',
    'account.html',
    'zh/index.html',
    'zh/product.html',
    'zh/pricing.html',
    'zh/about.html',
    'zh/developers.html',
    'zh/research.html',
    'zh/policy.html',
    'zh/learn.html'
  ];

  for (const pageName of pagesToTest) {
    const cleanName = pageName.replace(/\//g, '_').replace('.html', '');
    for (const [vpName, vp] of Object.entries(viewports)) {
      const page = await browser.newPage({ viewport: vp });
      try {
        await page.addInitScript(() => {
          localStorage.setItem('socrates_consent', 'essential');
        });
        await page.goto(`http://localhost:3456/${pageName}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(200);
        const shotPath = path.join(outDir, `${cleanName}-${vpName}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
        console.log(`Captured: ${shotPath}`);
      } catch (err) {
        console.error(`Failed ${pageName} ${vpName}:`, err.message);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();
  server.close();
  console.log('Done!');
}

run().catch(console.error);
