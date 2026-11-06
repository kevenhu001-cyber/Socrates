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
test('invalid model-authored algorithms produce actionable validation failures',()=>{
 const program={...examples.grating,definitions:{bad:'document.cookie'}};
 const result=validateIntelligentUi({version:1,nodes:[{id:'bad',type:'demonstration',program}]});
 assert.equal(result.ok,false);assert.match(result.error,/syntax/);
 const unknown=validateIntelligentUi({version:1,nodes:[{id:'bad',type:'demonstration',program:{...examples.grating,definitions:{bad:'unknownValue'}}}]});
 assert.equal(unknown.ok,false);assert.match(unknown.error,/Unknown variable/);
});
