import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntelligentUi } from '../src/services/intelligentUi.js';
import { normalizeIntelligentUiArgs } from '../src/services/intelligentUiNormalize.js';
import { intelligentUiFeedback } from '../src/services/intelligentUiFeedback.js';
import { INTELLIGENT_UI_EXAMPLES } from '../src/services/intelligentUiExamples.js';
const doc = node => ({version:1,nodes:[node]});
for (const [name,node] of Object.entries(INTELLIGENT_UI_EXAMPLES)) test(`repair example validates: ${name}`, () => {
  const result=validateIntelligentUi(doc(node)); assert.equal(result.ok,true,result.ok?'':result.error);
});
for (const [type,props,path] of [
  ['slider',{min:0,max:100},'bind'], ['slider',{bind:'x',step:0},'step'],
  ['slider',{bind:'x',min:10,max:1},'max'], ['toggle',{bind:'__proto__'},'bind'],
  ['choice',{bind:'x',options:[]},'options'], ['choice',{bind:'x',options:[{value:'a'},{value:'a'}]},'options.1.value'],
  ['button',{action:{type:'set',key:'x',value:0}},'label'],
  ['table',{columns:[],rows:[]},'columns'], ['table',{columns:['a'],rows:[[1]]},'rows'],
  ['chart',{points:[{value:'oops'}]},'points.0.value'], ['tabs',{tabs:[{id:'a'},{id:'a'}]},'tabs.1'],
]) test(`rejects non-renderable ${type}: ${path}`,()=>{
  const result=validateIntelligentUi(doc({id:'bad',type,...props})); assert.equal(result.ok,false);
  assert.equal(result.failure.stage,'control'); assert.ok(result.failure.issues.some(issue=>issue.path===`nodes.bad.${path}`));
  const feedback=intelligentUiFeedback(result.error,result.failure); assert.match(feedback.correction,/Minimal example/);
  if(type==='slider') {assert.match(feedback.correction,/"type":"slider"/);assert.doesNotMatch(feedback.correction,/"type":"demonstration"/);}
});
test('safe numeric recovery is shared and idempotent',()=>{
 const args=doc({id:'speed',type:'slider',bind:'speed',min:'0',max:'100',step:'0.5'});
 const normalized=normalizeIntelligentUiArgs(args); assert.equal(normalized.nodes[0].step,0.5);
 assert.deepEqual(normalizeIntelligentUiArgs(normalized),normalized); assert.equal(validateIntelligentUi(normalized).ok,true);
 assert.equal(validateIntelligentUi(doc({id:'missing',type:'slider'})).ok,false);
});
test('explicit empty tables and local tabs remain legal',()=>{
 assert.equal(validateIntelligentUi(doc({id:'empty',type:'table',columns:['a'],rows:[]})).ok,true);
 assert.equal(validateIntelligentUi(doc({id:'tabs',type:'tabs',tabs:[{id:'a',label:'A'}]})).ok,true);
});
test('unrendered children and nonexistent tabs fail with field paths',()=>{
 for(const nodes of [
 [{id:'parent',type:'slider',bind:'x'},{id:'child',type:'text',parent:'parent',text:'Lost'}],
 [{id:'parent',type:'tabs',tabs:[{id:'a'}]},{id:'child',type:'text',parent:'parent',tab:'b',text:'Lost'}]
 ]){const result=validateIntelligentUi({version:1,nodes});assert.equal(result.ok,false);assert.ok(result.failure.issues[0].path.startsWith('nodes.child.'));}
});

test('unsafe action URLs remain rejected before execution',()=>{assert.equal(validateIntelligentUi(doc({id:'bad',type:'button',label:'Go',action:{type:'open_url',url:'javascript:alert(1)'}})).ok,false);});

import { nodes as browserNodes } from '../../frontend/e2e/fixtures/intelligent-ui-controls.mjs';
test('the browser interaction fixture is accepted by the real server validator',()=>{const result=validateIntelligentUi({version:1,nodes:browserNodes});assert.equal(result.ok,true,result.ok?'':result.error);});

import {canRetryIdenticalToolCall} from '../src/routes/chat/pipeline/toolResultPolicy.js';
test('identical retry requires transient failure and a pure tool',()=>{
 assert.equal(canRetryIdenticalToolCall({status:'failed',retryable:true,errorCode:'timeout'},true),true);
 assert.equal(canRetryIdenticalToolCall({status:'failed',retryable:true,errorCode:'timeout'},false),false);
 for(const errorCode of ['invalid_tool_arguments','arguments_truncated','arguments_schema_failed','plan_spec_invalid']) assert.equal(canRetryIdenticalToolCall({status:'failed',retryable:true,errorCode},true),false);
 assert.equal(canRetryIdenticalToolCall({status:'failed',retryable:false,errorCode:'timeout'},true),false);
});

test('control list wrappers recover locally without fabricating data',()=>{
 const args=normalizeIntelligentUiArgs(doc({id:'chart',type:'chart',points:{item:{label:'A',value:'2'}}}));
 assert.deepEqual(args.nodes[0].points,[{label:'A',value:2}]);assert.equal(validateIntelligentUi(args).ok,true);
 assert.equal(validateIntelligentUi(doc({id:'chart',type:'chart',points:[{value:{op:'execute',args:[]}}]})).ok,false);
 assert.equal(validateIntelligentUi(doc({id:'table',type:'table',columns:['Total revenue'],rows:[{'Total revenue':2}]})).ok,true);
});

test('native chart repair never teaches OpenUI source syntax',()=>{
 const result=validateIntelligentUi(doc({id:'chart',type:'visualization',template:'bar',title:'Data',accessibilitySummary:'Data',payload:{}}));
 assert.equal(result.ok,false);
 const feedback=intelligentUiFeedback(result.error,result.failure);
 assert.match(feedback.correction,/"type":"visualization"/);assert.doesNotMatch(feedback.correction,/v = Visualization/);
});
