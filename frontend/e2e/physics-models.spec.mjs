import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';

for (const scene of ['wave-interference', 'electric-field', 'harmonic-oscillator', 'pendulum', 'projectile']) {
  test(`native model computes and responds to parameters: ${scene}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const node = { id: 'model', type: 'physics', scene, title: 'Physical model' };
    await prepareChatWorkbench(page, { lang: 'en', messages: [{ clientId: 'physical-model', role: 'assistant', type: 'assistant', rawText: `A computed physical model:\n\n\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\`` }] });
    const lab=page.locator(`[data-physics-scene="${scene}"]`);
    await expect(lab.locator('.demonstration')).toHaveCount(1);
    await expect(lab.locator(scene === 'wave-interference' || scene === 'electric-field' ? 'canvas' : '.demo-scene svg')).toBeVisible();
    const metrics=lab.locator('.demo-metrics');
    await expect(metrics).not.toBeEmpty();
    if(scene!=='electric-field') {
      const time=lab.getByRole('slider',{name:/^Time/});
      const before=await metrics.innerText();
      await time.fill(scene==='projectile'?'1':'2');
      await expect(metrics).not.toHaveText(before);
      await expect(lab.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
    }
    const first=lab.locator('.demo-control input').first();
    const before=await first.inputValue();
    await first.focus(); await first.press('ArrowRight');
    await expect(first).not.toHaveValue(before);
    const visual=lab.locator(scene==='wave-interference'||scene==='electric-field'?'canvas':'.demo-scene');
    await visual.evaluate(element=>element.scrollIntoView({block:'center'}));
    await visual.screenshot({path:`test-results/physics-${encodeURIComponent(scene)}.png`});
    await expectNoGlobalError(page);
  });
}

test('AI can compose several physical models with prose and native metrics on a phone',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const nodes=[{id:'lesson',type:'panel',title:'Compare oscillations'}, {id:'intro',type:'text',parent:'lesson',text:'Compare the exact damped spring with a nonlinear pendulum.'}, {id:'spring',type:'physics',scene:'harmonic-oscillator',parent:'lesson',parameters:{damping:0}}, {id:'pendulum',type:'physics',scene:'pendulum',parent:'lesson',parameters:{angle:120}}, {id:'value',type:'metric',parent:'lesson',label:'Initial angle',value:120,suffix:'°'}];
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:[{clientId:'models',role:'assistant',type:'assistant',rawText:`\`\`\`socrates-ui\n${nodes.map(node=>JSON.stringify(node)).join('\n')}\n\`\`\``}]});
  await expect(page.locator('.demonstration')).toHaveCount(2);
  await expect(page.getByText('Compare the exact damped spring with a nonlinear pendulum.')).toBeVisible();
  await expect(page.locator('[data-physics-scene="pendulum"]')).toContainText('120');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:'test-results/physics-composition-mobile.png',fullPage:true});
  await expectNoGlobalError(page);
});
