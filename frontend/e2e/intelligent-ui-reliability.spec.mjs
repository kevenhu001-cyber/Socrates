import {expect,test} from '@playwright/test';
import {prepareChatWorkbench,expectNoGlobalError} from './_chat-workbench.mjs';
import {nodes} from './fixtures/intelligent-ui-controls.mjs';

for(const theme of ['light','dark'])for(const mobile of [false,true])test(`accepted controls actually render and interact (${theme}, ${mobile?'phone':'desktop'})`,async({page})=>{
 await page.addInitScript(theme=>localStorage.setItem('socrates-theme',theme),theme);
 const invalid={id:'invalid',type:'slider',label:'Broken'};
 const source=JSON.stringify({version:1,nodes:[...nodes,invalid]});
 await prepareChatWorkbench(page,{lang:'en',viewport:mobile?{width:390,height:1000}:{width:1280,height:1000},messages:[{clientId:'controls',role:'assistant',type:'assistant',rawText:'Before.\n```socrates-ui\n'+source+'\n```\nAfter.'}]});
 const slider=page.getByRole('slider',{name:'Speed'});
 await expect(slider).toBeVisible();await slider.fill('7');await slider.dispatchEvent('change');
 await expect(page.locator('[data-intui-id="value"]')).toContainText('7');
 await page.getByRole('button',{name:'Mode B',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mode B',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('Enabled content',{exact:true})).toHaveCount(0);
 await page.getByRole('switch',{name:'Enabled',exact:true}).click();
 await expect(page.getByText('Enabled content',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Second',exact:true}).click();
 await expect(page.getByRole('tabpanel')).toHaveText('Second content');
 await page.getByRole('button',{name:'Reset',exact:true}).click();await expect(slider).toHaveValue('0');
 await expect(page.locator('[data-intui-id="empty"]')).toContainText('No data');
 await expect(page.locator('[data-intui-id="chart"] .visualization-card')).toBeVisible();
 await expect(page.locator('[data-intui-failure="invalid"]')).toBeVisible();
 await page.locator('[data-intui-failure="invalid"] summary').click();await expect(page.locator('[data-intui-failure="invalid"]')).toContainText('bind');
 await expect(page.getByText('After.',{exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/intui-reliability-${encodeURIComponent(theme)}-${encodeURIComponent(mobile?'phone':'desktop')}.png`});
 await expectNoGlobalError(page);
});

test('completed malformed documents show a failure rather than disappearing',async({page})=>{
 await prepareChatWorkbench(page,{lang:'en',messages:[{clientId:'invalid-document',role:'assistant',type:'assistant',rawText:'Before.\n```socrates-ui\n{"version":1,"nodes":[{"id":"orphan","type":"text","parent":"missing","text":"Lost"}]}\n```\nAfter.'}]});
 await expect(page.locator('[data-intui-failure="document"]')).toBeVisible();
 await expect(page.getByText('After.',{exact:true})).toBeVisible();
 await expectNoGlobalError(page);
});
