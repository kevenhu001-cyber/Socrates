import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:390,height:844},isMobile:true});
await p.goto('http://127.0.0.1:5174/',{waitUntil:'networkidle',timeout:15000});
await p.evaluate(()=>{
  document.getElementById('authGate')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState='app';
  document.getElementById('sidebar')?.classList.add('collapsed');
  document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach(e=>e.remove());
});
await p.waitForTimeout(600);
await p.evaluate(()=>{
  document.querySelectorAll('div').forEach(e=>{
    const t=e.textContent?.trim();
    if(t==="Couldn't reach the server. Check your connection and retry.") e.style.display='none';
  });
});
await p.screenshot({path:'C:/Users/Jiacheng/AppData/Local/Temp/opencode/clean-mobile-final.png',fullPage:true});
console.log('mob final ok');
await b.close();
