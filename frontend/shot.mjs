import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport:{width:1280,height:1600} });
  const failed = [];
  page.on('requestfailed', r => failed.push('FAIL '+r.url()+' :: '+(r.failure()&&r.failure().errorText)));
  page.on('response', r => { try { if (r.resourceType()==='image' && r.status()>=400) failed.push('HTTP'+r.status()+' '+r.url()); } catch(e){} });
  await page.goto('https://topodrive.top/', {waitUntil:'networkidle', timeout:40000});
  await page.waitForTimeout(1500);
  await page.screenshot({path:'/tmp/kilo/site-index.png'});
  console.log('FAILED:\n'+(failed.join('\n')||'(none)'));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
