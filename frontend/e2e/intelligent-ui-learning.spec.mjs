import {expect,test} from '@playwright/test';
import {prepareChatWorkbench,expectNoGlobalError} from './_chat-workbench.mjs';
const quiz={id:'quiz',type:'learning',kind:'quiz',q:'Which expression equals $2^2$? “Choose one”.',options:[{letter:'A',text:'$4$',explanation:'Two squared is four.'},{letter:'B',text:'$5$',explanation:'One too many; “five” is incorrect.'}],correct:'A'};
const message=nodes=>({clientId:'native-learning',role:'assistant',type:'assistant',rawText:`Read the question.\n\n\`\`\`socrates-ui\n${nodes.map(node=>JSON.stringify(node)).join('\n')}\n\`\`\`\n\nThe surrounding explanation remains readable.`});

for(const theme of ['light','dark'])for(const mobile of [false,true]){
 test(`native learning cards grade with hidden explanations and typeset math (${theme}, ${mobile?'phone':'desktop'})`,async({page})=>{
  await page.addInitScript(theme=>localStorage.setItem('socrates-theme',theme),theme);
  const definition={id:'definition',type:'knowledge-card',title:'导数',content:'瞬时变化率为 $f\u2032(x)$。'};
  await prepareChatWorkbench(page,{lang:'en',viewport:mobile?{width:390,height:1000}:{width:1280,height:1000},messages:[message([definition,quiz])]});
  await expect(page.locator('[data-learning-kind="definition"]')).toContainText('导数');
  const card=page.locator('[data-learning-kind="quiz"]');
  await expect(card.locator('[data-letter]')).toHaveCount(2);
  await expect(card.locator('[data-part="quiz-q"] .katex')).toBeVisible();
  await expect(card.getByText('Two squared is four.',{exact:true})).toHaveCount(0);
  await card.locator('[data-letter="B"]').click();await card.getByTestId('quiz-submit').click();
  await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict','incorrect');
  await expect(card.getByTestId('quiz-option-explanation-B')).toContainText('five');
  await card.getByTestId('quiz-retry').click();await card.locator('[data-letter="A"]').click();await card.getByTestId('quiz-submit').click();
  await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict','correct');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();});
  await card.evaluate(element=>element.scrollIntoView({block:'center'}));
  await card.screenshot({path:`test-results/learning-${encodeURIComponent(theme)}-${encodeURIComponent(mobile?'phone':'desktop')}.png`});
  await expectNoGlobalError(page);
 });
}

test('question aliases with options become a multi-choice quiz, and ungraded questions stay recorded',async({page})=>{
 const multi={id:'multi',type:'question',question:'Pick the odd numbers',choices:{A:'1',B:'2',C:'3'},answer:['A','C']};
 const survey={...quiz,id:'survey',q:'Your preference?',graded:false,correct:undefined};
 await prepareChatWorkbench(page,{lang:'en',messages:[message([multi,survey])]});
 const card=page.locator('[data-intui-id="multi"]');
 await expect(card.getByRole('checkbox')).toHaveCount(3);
 await card.locator('[data-letter="A"]').click();await card.locator('[data-letter="C"]').click();await card.getByTestId('quiz-submit').click();
 await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict','correct');
 const ungraded=page.locator('[data-intui-id="survey"]');
 await ungraded.locator('[data-letter="B"]').click();await ungraded.getByTestId('quiz-submit').click();
 await expect(ungraded.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict','recorded');
 await expectNoGlobalError(page);
});

test('a malformed historical card stays isolated and never exposes hidden answers',async({page})=>{
 const document={version:1,nodes:[{id:'invalid',type:'learning',kind:'flashcard',front:'Question with no answer yet'},{id:'bad-key',type:'learning',kind:'quiz',q:'Incomplete quiz',options:quiz.options,correct:'E',explanation:'SECRET ANSWER'},{id:'healthy',type:'definition',term:'Still readable',body:'This valid card survives.'}]};
 await prepareChatWorkbench(page,{messages:[{...message([]),rawText:'```socrates-ui\n'+JSON.stringify(document)+'\n```'}]});
 await expect(page.locator('[data-learning-fallback]')).toHaveCount(2);
 await expect(page.getByText('This valid card survives.',{exact:true})).toBeVisible();
 await expect(page.getByText('SECRET ANSWER',{exact:true})).toHaveCount(0);
 /* A broken quiz keeps its choices readable; the key and the explanations stay hidden. */
 const broken=page.locator('[data-learning-fallback="bad-key"]');
 await expect(broken.locator('[data-learning-option]')).toHaveCount(2);
 await expect(broken.locator('[data-learning-option="A"]')).toContainText('4');
 await expect(broken.locator('[data-learning-option="B"]')).toContainText('5');
 await expect(broken).not.toContainText('Two squared is four.');
 await expect(page.locator('.error-boundary-fallback')).toHaveCount(0);
 await expectNoGlobalError(page);
});

test('flashcard and written question use existing learning controls',async({page})=>{
 const flash={id:'flash',type:'learning',kind:'flashcard',front:'What is inertia?',back:'Resistance to a change of velocity.'};
 const practice={id:'practice',type:'learning',kind:'practice',problem:'Explain conservation of energy.',hint:'Consider a closed system.'};
 await prepareChatWorkbench(page,{lang:'en',messages:[message([flash,practice])]});
 const card=page.locator('[data-intui-id="flash"]');
 await expect(card.getByText(flash.back,{exact:true})).toHaveCount(0);
 await card.getByTestId('flashcard-flip').click();
 await expect(card.getByText(flash.back,{exact:true})).toBeVisible();
 await expect(page.getByTestId('practice-input')).toBeVisible();
 await page.getByTestId('practice-input').fill('Energy is transferred between forms.');
 await expect(page.getByTestId('practice-input')).toHaveValue('Energy is transferred between forms.');
 await expectNoGlobalError(page);
});

test('native tool commits and patches enable grading after streaming completes',async({page})=>{
 await prepareChatWorkbench(page,{lang:'en'});
 await page.evaluate(async(node)=>{
  const ctl=await window.addStreamingMessage({userPrompt:'Give me a question'});window.__learningCtl=ctl;let seq=0;
  window.__learningEvent=payload=>ctl.recordTurnEvent({version:1,turnId:'learning-turn',seq:++seq,at:Date.now(),...payload});
  window.__learningEvent({type:'ui.begin',surfaceId:'learning-tool',toolCallId:'learning-tool',textOffset:0});
  window.__learningEvent({type:'ui.add',surfaceId:'learning-tool',node});
  ctl.recordToolUse({id:'learning-tool',name:'render_intelligent_ui',input:{version:1,nodes:[node]}});
  ctl.append('Select an answer.');
 },quiz);
 const card=page.locator('[data-learning-kind="quiz"]');
 await expect(card.locator('[data-letter="A"]')).toHaveAttribute('aria-disabled','true');
 await page.evaluate(()=>window.__learningEvent({type:'ui.patch',surfaceId:'learning-tool',nodeId:'quiz',props:{q:'Updated question: which expression equals $2^2$?'}}));
 await expect(card).toContainText('Updated question');
 await page.evaluate(node=>{
  window.__learningEvent({type:'ui.commit',surfaceId:'learning-tool',nodes:[{...node,q:'Updated question: which expression equals $2^2$?'}]});
  window.__learningCtl.recordToolResult({id:'learning-tool',name:'render_intelligent_ui',ok:true,status:'completed',output:'Question rendered'});
  window.__learningCtl.finish();
 },quiz);
 await card.locator('[data-letter="A"]').click();
 await card.getByTestId('quiz-submit').click();
 await expect(card.getByTestId('quiz-feedback')).toHaveAttribute('data-verdict','correct');
 const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(window.stateStore.read('messages'))));
 await prepareChatWorkbench(page,{lang:'en',messages:saved});
 await expect(page.locator('[data-learning-kind="quiz"]')).toHaveCount(1);
 await expect(page.locator('[data-learning-kind="quiz"] [data-letter]')).toHaveCount(2);
 await expectNoGlobalError(page);
});
