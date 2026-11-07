import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTELLIGENT_UI_TOOL, validateIntelligentUi } from '../src/services/intelligentUi.js';
import { createDemonstrationRuntime } from '../../packages/core/src/demonstration.js';
import { DEMONSTRATION_GUIDANCE } from '../src/services/demonstrationGuide.js';
const examples=JSON.parse(readFileSync(new URL('../../docs/examples/algorithmic-demonstrations.json',import.meta.url),'utf8'));
test('the native tool teaches an open mathematical program and accepts new algorithms',()=>{
 const schema=INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties;
 assert.ok(schema.type.enum.includes('demonstration'));
 assert.match(schema.program.description,/sum\(i,first,last,expression\)/);
 assert.match(schema.program.description,/derivatives/);
 for(const program of Object.values(examples))assert.equal(validateIntelligentUi({version:1,nodes:[{id:'new-model',type:'demonstration',program}]}).ok,true);
 const sample=JSON.parse(DEMONSTRATION_GUIDANCE.split('\n').at(-1));
 assert.equal(createDemonstrationRuntime(sample).evaluate('intensity'),1);
});
test('the program parameter is a real schema, so arrays keep their shape',()=>{
 const program=INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties.program;
 /* A free-form object gave providers no anchors and let repeated siblings
    collapse into {"item": [...]}. Named, typed properties prevent that. */
 assert.deepEqual(program.required,['version','views']);
 assert.deepEqual(program.properties.version.enum,[1]);
 assert.equal(program.properties.parameters.type,'array');
 assert.equal(program.properties.parameters.items.type,'object');
 assert.equal(program.properties.views.type,'array');
 assert.deepEqual(program.properties.views.items.properties.kind.enum,['controls','plot','field','trajectory','metrics']);
 assert.equal(program.properties.views.items.properties.curves.type,'array');
 assert.equal(program.properties.views.items.properties.values.type,'array');
 assert.equal(program.properties.dynamics.properties.initial.type,'object');
 assert.equal(program.properties.presets.items.properties.values.type,'object');
 /* The guidance must state the serialization rule before the first attempt. */
 assert.match(program.description,/version is the number 1/);
 assert.match(program.description,/Never encode a list as \{"item": \[\.\.\.\]\}/);
 assert.doesNotMatch(program.description,/- \{"kind":/);
});
test('a plot missing every required field reports all three in one rejection',()=>{
 const program={version:1,views:[{kind:'plot'}]};
 const result=validateIntelligentUi({version:1,nodes:[{id:'demo',type:'demonstration',program}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/views\[0\]\.x/);
 assert.match(result.error,/views\[0\]\.y/);
 assert.match(result.error,/views\[0\]\.curves/);
 assert.ok(Array.isArray(result.failure.issues));
 assert.equal(result.failure.issues.length,3);
});
test('a trajectory missing every required field reports all five in one rejection',()=>{
 const program={version:1,views:[{kind:'trajectory'}]};
 const result=validateIntelligentUi({version:1,nodes:[{id:'demo',type:'demonstration',program}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/views\[0\]\.x/);
 assert.match(result.error,/views\[0\]\.y/);
 assert.match(result.error,/views\[0\]: trajectory requires program\.dynamics/);
 assert.match(result.error,/views\[0\]\.horizontal/);
 assert.match(result.error,/views\[0\]\.vertical/);
 assert.ok(Array.isArray(result.failure.issues));
 assert.equal(result.failure.issues.length,5);
});
test('shape failures report global view limits once',()=>{
 const program={version:1,views:[
  {kind:'controls'},{kind:'controls'},
  {kind:'field',x:[0,1],y:[0,1],expression:'x'},
  {kind:'field',x:[0,1],y:[0,1],expression:'x'},
  {kind:'field',x:[0,1],y:[0,1],expression:'x'},
  {kind:'plot',x:[0,1],y:[0,1],curves:Array.from({length:13},()=>({expression:'x'}))},
 ]};
 const result=validateIntelligentUi({version:1,nodes:[{id:'demo',type:'demonstration',program}]});
 assert.equal(result.ok,false);
 assert.match(result.error,/at most one controls view/);
 assert.match(result.error,/at most two field views/);
 assert.match(result.error,/at most twelve curves/);
});
test('invalid model-authored algorithms produce actionable validation failures',()=>{
 const program={...examples.grating,definitions:{bad:'document.cookie'}};
 const result=validateIntelligentUi({version:1,nodes:[{id:'bad',type:'demonstration',program}]});
 assert.equal(result.ok,false);assert.match(result.error,/syntax/);
 const unknown=validateIntelligentUi({version:1,nodes:[{id:'bad',type:'demonstration',program:{...examples.grating,definitions:{bad:'unknownValue'}}}]});
 assert.equal(unknown.ok,false);assert.match(unknown.error,/Unknown variable/);
});
