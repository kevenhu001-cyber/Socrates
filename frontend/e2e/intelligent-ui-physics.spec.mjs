import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';
const examples = JSON.parse(readFileSync(new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url), 'utf8'));
const message = (nodes) => ({clientId:'physics-components',role:'assistant',type:'assistant',rawText:`物理组件共享参数和时间。\n\n\`\`\`socrates-ui\n${nodes.map(node=>JSON.stringify(node)).join('\n')}\n\`\`\``});

for (const theme of ['light', 'dark']) for (const mobile of [false, true]) {
 test(`composed physics scene links body, spring, force and plot (${theme}, ${mobile?'phone':'desktop'})`, async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(theme=>localStorage.setItem('socrates-theme',theme),theme);
  await prepareChatWorkbench(page,{lang:'zh',viewport:mobile?{width:390,height:1000}:{width:1280,height:1100},messages:[message([{id:'spring',type:'demonstration',title:'弹簧振子',program:examples.oscillator}])]});
  const demo = page.getByRole('region',{name:'弹簧振子',exact:true});
  await expect(demo.locator('[data-scene-object]')).toHaveCount(4);
  const block = demo.locator('[data-scene-object="block"] rect');
  const force = demo.locator('[data-scene-object="vector"] path').first();
  const start = await block.getAttribute('x');
  const forceStart = await force.getAttribute('d');
  const time = demo.getByRole('slider',{name:'时间',exact:true});
  await time.fill('0.8');
  await expect(block).not.toHaveAttribute('x',start);
  await expect(force).not.toHaveAttribute('d',forceStart);
  await expect(demo.locator('.demo-metrics')).toContainText('2 J');
  const moved = await block.getAttribute('x');
  await demo.getByRole('slider',{name:'质量 m',exact:true}).fill('2');
  await time.fill('0.8');
  await expect(block).not.toHaveAttribute('x',moved);
  await expect(demo.locator('.demo-note')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await demo.evaluate(el=>el.scrollIntoView({block:'start'}));
  await demo.screenshot({path:`test-results/intui-physics-${encodeURIComponent(theme)}-${encodeURIComponent(mobile?'phone':'desktop')}.png`});
  await expectNoGlobalError(page);
 });
}

test('pendulum and circular motion compose physical geometry without registered scene IDs', async ({page}) => {
 await page.emulateMedia({reducedMotion:'reduce'});
 await prepareChatWorkbench(page,{lang:'zh',messages:[message(['pendulum','circularMotion'].map(id=>({id,type:'demonstration',title:id,program:examples[id]})))]});
 const pendulum = page.getByRole('region',{name:'pendulum',exact:true});
 const bob = pendulum.locator('[data-scene-object="body"] circle').last();
 const start = await bob.getAttribute('cx');
 await pendulum.getByRole('slider',{name:'时间',exact:true}).fill('1');
 await expect(bob).not.toHaveAttribute('cx',start);
 const circle = page.getByRole('region',{name:'circularMotion',exact:true});
 const body = circle.locator('[data-scene-object="body"] circle').last();
 const before = await body.getAttribute('cy');
 await circle.getByRole('slider',{name:'时间',exact:true}).fill('1.5');
 await expect(body).not.toHaveAttribute('cy',before);
 await expect(circle.locator('.demo-note')).toHaveCount(0);
 await expectNoGlobalError(page);
});

test('native charts render all 50 points and update their shared chart instance', async ({page}) => {
 const nodes = [{id:'root',type:'panel',state:{amount:1}},
  {id:'amount',parent:'root',type:'slider',bind:'amount',label:'Amount',min:1,max:4,step:1},
  {id:'chart',parent:'root',type:'chart',title:'All points',kind:'line',points:Array.from({length:50},(_,i)=>({label:String(i+1),value:i===49?{state:'amount'}:i}))}];
 await prepareChatWorkbench(page,{messages:[message(nodes)]});
 const card = page.locator('.intui-chart .visualization-card');
 await expect(card).toHaveAttribute('data-visualization-renderer','echarts');
 const stage = card.locator('.visualization-stage');
 await expect.poll(()=>stage.evaluate(el=>window.echarts?.getInstanceByDom(el)?.getOption().series[0].data.length)).toBe(50);
 await card.evaluate(el=>el.dataset.identity='same');
 await page.getByRole('slider',{name:'Amount',exact:true}).fill('3');
 await expect.poll(()=>stage.evaluate(el=>window.echarts?.getInstanceByDom(el)?.getOption().series[0].data[49])).toBe(3);
 await expect(card).toHaveAttribute('data-identity','same');
 await expectNoGlobalError(page);
});

test('one invalid physical object leaves other objects visible and recovers on input change', async ({page}) => {
 const program = {version:1,parameters:[{id:'size',label:'Radius',value:1,min:0,max:2,step:.1}],views:[{kind:'scene',x:[-2,2],y:[-1,1],objects:[{kind:'body',center:[-1,0],radius:'size'},{kind:'body',center:[1,0],radius:.2}]}]};
 await prepareChatWorkbench(page,{messages:[message([{id:'recover',type:'demonstration',title:'Recovery',program}])]});
 const demo = page.getByRole('region',{name:'Recovery',exact:true});
 await expect(demo.locator('[data-scene-object="body"]')).toHaveCount(2);
 await demo.getByRole('slider',{name:'Radius',exact:true}).fill('0');
 await expect(demo.locator('[data-scene-object="body"]')).toHaveCount(1);
 await expect(demo.locator('.demo-note')).toContainText('objects[0]');
 await demo.getByRole('slider',{name:'Radius',exact:true}).fill('1');
 await expect(demo.locator('[data-scene-object="body"]')).toHaveCount(2);
 await expect(demo.locator('.demo-note')).toHaveCount(0);
});

for(const id of ['coupledOscillators','drivenOscillator','chargedParticle','keplerOrbit','rcCharging','thermalCooling']) {
 test(`AI can compose an editable physical model: ${id}`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await prepareChatWorkbench(page,{lang:'zh',viewport:id==='chargedParticle'?{width:390,height:1000}:{width:1280,height:1100},messages:[message([{id,type:'demonstration',title:id,program:examples[id]}])]});
  const demo=page.getByRole('region',{name:id,exact:true});
  await expect(demo.locator('.demo-scene svg')).toBeVisible();
  await expect(demo.locator('[data-scene-object]')).toHaveCount(examples[id].views[0].objects.length);
  const metrics=demo.locator('.demo-metrics'),before=await metrics.innerText();
  await demo.getByRole('slider',{name:'时间',exact:true}).fill('2');
  await expect(metrics).not.toHaveText(before);
  const first=demo.locator('.demo-control input').first();
  const prior=await first.inputValue();await first.focus();await first.press('ArrowRight');
  await expect(first).not.toHaveValue(prior);
  await expect(demo.locator('.demo-note')).toHaveCount(0);
  if(id==='coupledOscillators'||id==='rcCharging'||id==='chargedParticle') {
   await demo.getByRole('slider',{name:'时间',exact:true}).fill('2');
   await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
   const scene=demo.locator('.demo-scene');
   await scene.evaluate(element=>element.scrollIntoView({block:'center'}));
   await scene.screenshot({path:`test-results/intui-example-${encodeURIComponent(id)}.png`});
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await expectNoGlobalError(page);
 });
}

test('path geometry and expression presets share parameters and reject a bad preset atomically',async({page})=>{
 const program={version:1,parameters:[{id:'width',label:'Width',value:1,min:.5,max:3,step:.1},{id:'other',label:'Other',value:1,min:.5,max:3,step:.1}],views:[{kind:'scene',x:[-1,4],y:[-1,2],objects:[{kind:'path',points:[[0,0],['width',0],['width',1]],closed:true,label:'Boundary',color:'blue'}]}],presets:[{label:'Double width',values:{width:'min(3,2*width)'}},{label:'Invalid transaction',values:{other:2,width:'1/0'}}]};
 await prepareChatWorkbench(page,{messages:[message([{id:'path',type:'demonstration',title:'Composable boundary',program}])]});
 const demo=page.getByRole('region',{name:'Composable boundary',exact:true});
 const path=demo.locator('[data-scene-object="path"] path');const before=await path.getAttribute('d');
 await demo.getByRole('button',{name:'Double width',exact:true}).click();
 await expect(demo.getByRole('slider',{name:'Width',exact:true})).toHaveValue('2');
 await expect(path).not.toHaveAttribute('d',before);
 await demo.getByRole('button',{name:'Invalid transaction',exact:true}).click();
 await expect(demo.locator('.demo-note')).toBeVisible();
 await expect(demo.getByRole('slider',{name:'Width',exact:true})).toHaveValue('2');
 await expect(demo.getByRole('slider',{name:'Other',exact:true})).toHaveValue('1');
 await demo.getByRole('button',{name:'Double width',exact:true}).click();
 await expect(demo.getByRole('slider',{name:'Width',exact:true})).toHaveValue('3');
 await expect(demo.locator('.demo-note')).toHaveCount(0);
});
