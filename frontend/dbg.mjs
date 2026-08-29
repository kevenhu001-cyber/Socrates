import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox']});
const m = await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await m.addInitScript(()=>{localStorage.setItem('socrates-lang-app','zh');localStorage.setItem('socrates-theme','dark');});
await m.goto('http://localhost:5173/',{waitUntil:'networkidle',timeout:20000});
await m.evaluate(()=>{
  const gate=document.getElementById('authGate');gate?.classList.add('hidden');if(gate)gate.style.display='none';
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState='app';
  document.documentElement.dataset.showGrid='false';
});
await m.waitForTimeout(700);
await m.evaluate(()=>{document.getElementById('sidebar')?.classList.add('collapsed');});
await m.waitForTimeout(300);
const info = await m.evaluate(()=>{
  const pts=[[195,400],[195,780],[195,36]];
  return pts.map(([x,y])=>{
    const el=document.elementFromPoint(x,y);
    const chain=[];let e=el;
    while(e&&chain.length<6){chain.push(e.id||e.className&&String(e.className).slice(0,40)||e.tagName);e=e.parentElement;}
    return chain;
  });
});
console.log(JSON.stringify(info));
await m.screenshot({path:'tmp-shots/dbg.png'});
await b.close();
