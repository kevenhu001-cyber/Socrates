import { test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
test('diag', async ({ page }) => {
  test.setTimeout(120000);
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.state.phase='chat';
    window.state.topic='Diag';
    window.state.currentSessionId='33333333-3333-4333-8333-333333333333';
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
    for(let i=0;i<20;i++)window.addMessage(i%2?'assistant':'user','Msg '+(i+1)+': long enough text to wrap lines so it scrolls.');
    window.state._userScrolledAway=false;
  });
  for (const vp of [[1280,800,'desktop'],[390,844,'mobile']]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const l=document.getElementById('msgList'); l.scrollTop=l.scrollHeight; });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const bar=document.getElementById('chatInputBar'),list=document.getElementById('msgList'),view=document.getElementById('chatView');
      const msgs=list.querySelectorAll('.msg'),last=msgs[msgs.length-1];
      return {barTop:bar.getBoundingClientRect().top,barH:bar.getBoundingClientRect().height,wrapTop:document.getElementById('chatInputWrap').getBoundingClientRect().top,pad:getComputedStyle(list).paddingBottom,varH:view.style.getPropertyValue('--chat-input-bar-height'),lastBottom:last?last.getBoundingClientRect().bottom:null,st:list.scrollTop,sh:list.scrollHeight,ch:list.clientHeight,n:msgs.length};
    });
    console.log('[diag:'+vp[2]+']', JSON.stringify(m));
    await page.screenshot({ path: 'test-results/diag-'+vp[2]+'.png' });
  }
});
