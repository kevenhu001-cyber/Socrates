import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';
const examples=JSON.parse(readFileSync(new URL('../../docs/examples/algorithmic-demonstrations.json',import.meta.url),'utf8'));

for(const theme of ['light','dark'])for(const mobile of [false,true]){
 test(`algorithmic grating matches linked plot, field and compact controls (${theme}, ${mobile?'phone':'desktop'})`,async({page})=>{
  await page.addInitScript(theme=>localStorage.setItem('socrates-theme',theme),theme);
  const node={id:'grating',type:'demonstration',title:'光栅明暗纹与光强分布',program:examples.grating};
  await prepareChatWorkbench(page,{lang:'zh',viewport:mobile?{width:390,height:844}:{width:1280,height:1100},messages:[{clientId:'grating',role:'assistant',type:'assistant',rawText:`光栅的光强分布是单缝衍射包络与多缝干涉的乘积。\n\n\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\`\n\n改变缝数和间距，观察主峰与包络怎样变化。`}]});
  const demo=page.getByRole('region',{name:node.title,exact:true});
  await expect(demo.locator('canvas')).toBeVisible();
  await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(2);
  await expect(demo.getByRole('slider')).toHaveCount(3);
  const before=await demo.locator('.demo-plot path[fill="none"]').first().getAttribute('d');
  await demo.getByRole('slider',{name:'缝数 N',exact:true}).fill('10');
  await expect(demo.locator('.demo-plot path[fill="none"]').first()).not.toHaveAttribute('d',before);
  const rows=demo.locator('.demo-control');
  const labelBox=await rows.first().locator('label').boundingBox(),sliderBox=await rows.first().locator('input').boundingBox(),outputBox=await rows.first().locator('output').boundingBox();
  expect(sliderBox.x).toBeGreaterThan(labelBox.x);expect(outputBox.x).toBeGreaterThan(sliderBox.x);
  expect(Math.abs(sliderBox.y-outputBox.y)).toBeLessThan(18);
  const pixels=await demo.locator('canvas').evaluate(canvas=>{const c=canvas.getContext('2d');const row=c.getImageData(0,Math.floor(canvas.height/2),canvas.width,1).data;return [...row].filter((_,i)=>i%4!==3);});
  expect(Math.max(...pixels)).toBeGreaterThan(200);expect(Math.min(...pixels)).toBeLessThan(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
  await demo.evaluate(element=>element.scrollIntoView({block:'center'}));
  await demo.screenshot({path:`test-results/demo-grating-${encodeURIComponent(theme)}-${encodeURIComponent(mobile?'phone':'desktop')}.png`});
  await expectNoGlobalError(page);
 });
}

test('Airy demonstration has algorithmic light and three separately styled curves',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('socrates-theme','light'));
 const node={id:'airy',type:'demonstration',title:'双点光源的分辨',program:examples.airy};
 await prepareChatWorkbench(page,{lang:'zh',viewport:{width:390,height:1000},messages:[{clientId:'airy',role:'assistant',type:'assistant',rawText:`拖动滑块改变角间距，观察衍射光强怎样叠加。\n\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\``}]});
 const demo=page.getByRole('region',{name:node.title,exact:true});
 await expect(demo.locator('canvas')).toBeVisible();
 await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(3);
 await expect(demo.locator('.demo-metrics')).toContainText('73.5');
 await demo.getByRole('button',{name:'0.6 · 更近',exact:true}).click();
 await expect(demo.getByRole('slider',{name:'角间距',exact:true})).toHaveValue('0.6');
 await demo.getByRole('button',{name:'1.0 · 瑞利',exact:true}).click();
 await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
 await demo.evaluate(element=>element.scrollIntoView({block:'center'}));
 await demo.screenshot({path:'test-results/demo-airy-phone.png'});
 await expectNoGlobalError(page);
});

test('unregistered Lorenz ODE produces a computed attractor and linked state values',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const node={id:'chaos',type:'demonstration',title:'自定义洛伦兹系统',program:examples.lorenz};
 await prepareChatWorkbench(page,{lang:'zh',viewport:{width:1280,height:1000},messages:[{clientId:'lorenz',role:'assistant',type:'assistant',rawText:`\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\``}]});
 const demo=page.getByRole('region',{name:node.title,exact:true});
 const time=demo.getByRole('slider',{name:'时间',exact:true});await time.fill('20');
 const path=demo.locator('.demo-plot path[fill="none"]').first();
 expect((await path.getAttribute('d')).length).toBeGreaterThan(5000);
 const before=await path.getAttribute('d');
 await demo.getByRole('slider',{name:'ρ',exact:true}).fill('15');await time.fill('20');
 await expect(path).not.toHaveAttribute('d',before);
 await demo.getByRole('slider',{name:'ρ',exact:true}).fill('28');await time.fill('20');
 await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
 await demo.locator('.demo-plot').evaluate(element=>element.scrollIntoView({block:'center'}));
 await demo.screenshot({path:'test-results/demo-lorenz.png'});
 await expectNoGlobalError(page);
});

test('native tool events render a program, preserve controls through a patch and restore history',async({page})=>{
 await prepareChatWorkbench(page,{lang:'zh'});
 await page.evaluate(async(program)=>{
  const ctl=await window.addStreamingMessage({userPrompt:'演示光栅衍射'});
  window.__demoCtl=ctl;let seq=0;
  window.__demoEvent=payload=>ctl.recordTurnEvent({version:1,turnId:'native-demonstration',seq:++seq,at:Date.now(),...payload});
  const node={id:'grating',type:'demonstration',title:'原生工具演示',program};
  window.__demoEvent({type:'ui.begin',surfaceId:'demo-tool',toolCallId:'demo-tool',textOffset:0});
  window.__demoEvent({type:'ui.commit',surfaceId:'demo-tool',nodes:[node]});
  ctl.recordToolUse({id:'demo-tool',name:'render_intelligent_ui',input:{version:1,nodes:[node]}});
  ctl.recordToolResult({id:'demo-tool',name:'render_intelligent_ui',ok:true,status:'completed',output:'Rendered algorithmic demonstration'});
  ctl.append('这些亮纹由同一组参数实时计算。');
 },examples.grating);
 const demo=page.locator('.demonstration');
 await expect(demo.locator('canvas')).toBeVisible();
 await demo.getByRole('slider',{name:'缝数 N',exact:true}).fill('10');
 await page.evaluate(()=>{
  window.__demoEvent({type:'ui.edit',surfaceId:'demo-tool',baseRevision:0,operations:[{op:'patch',nodeId:'grating',props:{title:'更新后的演示'}}]});
 });
 await expect(demo).toContainText('更新后的演示');
 await expect(demo.getByRole('slider',{name:'缝数 N',exact:true})).toHaveValue('10');
 await demo.getByRole('slider',{name:'波长',exact:true}).fill('600');
 const driven={...examples.grating,parameters:examples.grating.parameters.map(p=>p.id==='N'?{...p,value:8}:p)};
 await page.evaluate(program=>window.__demoEvent({type:'ui.edit',surfaceId:'demo-tool',baseRevision:1,operations:[{op:'patch',nodeId:'grating',props:{program}}]}),driven);
 await expect(demo.getByRole('slider',{name:'缝数 N',exact:true})).toHaveValue('8');
 await expect(demo.getByRole('slider',{name:'波长',exact:true})).toHaveValue('600');
 await page.evaluate(program=>{
  window.__demoEvent({type:'ui.edit',surfaceId:'demo-tool',baseRevision:2,operations:[{op:'patch',nodeId:'grating',props:{program:{...program,resetKey:'restore-declared-values'}}}]});
  window.__demoCtl.finish();
 },driven);
 await expect(demo.getByRole('slider',{name:'波长',exact:true})).toHaveValue('550');
 const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(window.stateStore.read('messages'))));
 await prepareChatWorkbench(page,{lang:'zh',messages:saved});
 await expect(page.locator('.demonstration')).toHaveCount(1);
 await expect(page.locator('.demonstration canvas')).toBeVisible();
 await expect(page.getByRole('slider',{name:'缝数 N',exact:true})).toHaveValue('8');
 await expectNoGlobalError(page);
});


test('complex raster fields reduce sampling and keep controls available across repeated renders',async({page})=>{
 const program={version:1,parameters:[{id:'a',min:0,max:2,value:1}],definitions:{intensity:'sum(k,1,128,sin(x*k+a)^2)/128',unused:'sum(k,1,128,sum(j,1,128,k*j))'},views:[{kind:'field',x:[-2,2],y:[-1,1],expression:'intensity'}]};
 const node={id:'costly',type:'demonstration',title:'复杂场图',program};
 await prepareChatWorkbench(page,{lang:'zh',messages:[{clientId:'costly',role:'assistant',type:'assistant',rawText:'```socrates-ui\n'+JSON.stringify(node)+'\n```'}]});
 const demo=page.locator('.demonstration');
 await expect(demo.locator('canvas')).toBeVisible();
 for(const value of ['0.5','1.5','1']){
  await demo.getByRole('slider',{name:'a',exact:true}).fill(value);
  await expect(demo.locator('.demo-error')).toHaveCount(0);
 }
 const bright=await demo.locator('canvas').evaluate(canvas=>canvas.getContext('2d').getImageData(160,80,1,1).data[0]);
 expect(bright).toBeGreaterThan(0);
 await expectNoGlobalError(page);
});


test('a bare versioned document from the screenshot renders as an interactive demonstration',async({page})=>{
 const doc={version:1,nodes:[{id:'bare-demo',type:'demonstration',title:'单缝夫琅禾费衍射',program:{version:1,parameters:[{id:'ratio',label:'缝宽 / 波长',value:4,min:.6,max:20,step:.2}],definitions:{I:'sinc(pi*x)^2'},views:[{kind:'controls'},{kind:'plot',x:[-5,5],y:[0,1.05],curves:[{expression:'I',color:'blue'}]}]}}]};
 await prepareChatWorkbench(page,{lang:'zh',viewport:{width:390,height:844},messages:[{clientId:'bare',role:'assistant',type:'assistant',rawText:'下面这个可调演示里，你可以拖动滑块：\n\n'+JSON.stringify(doc,null,2)+'\n\n调整参数观察变化。'}]});
 const demo=page.getByRole('region',{name:'单缝夫琅禾费衍射',exact:true});
 await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(1);
 await demo.getByRole('slider').fill('6');
 await expect(demo.getByRole('slider')).toHaveValue('6');
 await expect(page.locator('#msgList')).not.toContainText('"version"');
 await page.screenshot({path:'test-results/recovered-bare-demonstration-phone.png'});
 await expectNoGlobalError(page);
});
