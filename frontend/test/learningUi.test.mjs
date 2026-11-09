import test from 'node:test';
import assert from 'node:assert/strict';
import {learningUiIssues,normalizeLearningUiNode,openUiLearningMisuse,parseIntelligenceUiRecords,validateIntelligentUi} from '@socrates/core';
import {applyIntelligentUiPatch} from '../../packages/core/src/intelligentUiPatch.js';
const quiz={id:'quiz',type:'learning',kind:'quiz',q:'Which is even?',options:[{letter:'A',text:'2',explanation:'Divisible by 2'},{letter:'B',text:'3',explanation:'Odd'}],correct:'A'};

test('hallucinated learning components are named by the issue itself, not by a word boundary',()=>{
 const unknown=name=>JSON.stringify({code:'unknown-component',component:name,path:'',message:`Unknown component "${name}" — not found in catalog or builtins.`});
 for(const name of ['Quiz','QuizCard','Question','QuestionCard','KnowledgeCard','MCQ'])
  assert.deepEqual(openUiLearningMisuse([unknown(name)]),[name]);
 assert.deepEqual(openUiLearningMisuse([unknown('Flashcard'),unknown('Text')]),[]);
 assert.deepEqual(openUiLearningMisuse(['field "/children" expects array but got string']),[]);
 assert.deepEqual(openUiLearningMisuse(['Unknown component "Quiz" — not found in catalog or builtins.']),['Quiz']);
 assert.deepEqual(openUiLearningMisuse([]),[]);
});

test('one learning contract accepts the ten card kinds without XML or OpenUI',()=>{
 const cards=[quiz,{kind:'practice',problem:'Explain'},{kind:'definition',term:'Velocity',body:'Rate of displacement'},
  {kind:'flashcard',front:'Question',back:'Answer'},{kind:'example',problem:'Compute',solution:'Worked solution'},
  {kind:'theorem',statement:'A statement'},{kind:'proof',body:'A proof'},{kind:'derivation',body:'First\n\nSecond'},
  {kind:'key-point',body:'Condition'},{kind:'step',body:'First step',n:1}];
 for(const [i,card] of cards.entries()){
  const node={id:`card-${i}`,type:'learning',...card};
  assert.deepEqual(learningUiIssues(node),[]);
  assert.equal(validateIntelligentUi({version:1,nodes:[node]}).ok,true);
  assert.equal(parseIntelligenceUiRecords(JSON.stringify(node))[0].type,'learning');
 }
});

test('common aliases normalize identically from tool nodes, history and JSONL without mutating input',()=>{
 const source={id:'quiz',type:'multiple_choice',question:'Pick',choices:{item:['A. First','B. Second','C. Third']},answer:['c','a'],multi:'false'};
 const before=structuredClone(source),node=normalizeLearningUiNode(source);
 assert.equal(node.type,'learning');assert.equal(node.kind,'quiz');assert.equal(node.correct,'AC');assert.equal(node.multi,true);
 assert.deepEqual(node.options.map(x=>x.letter),['A','B','C']);
 assert.deepEqual(learningUiIssues(node),[]);
 assert.deepEqual(normalizeLearningUiNode(node),node);
 assert.deepEqual(source,before);
 assert.deepEqual(parseIntelligenceUiRecords(JSON.stringify(source))[0].options,node.options);
 const document={version:1,nodes:[source]};
 assert.equal(validateIntelligentUi(document).ok,true);
 assert.equal(parseIntelligenceUiRecords(JSON.stringify(document))[0].correct,'AC');
 assert.equal(normalizeLearningUiNode({id:'k',type:'knowledge-card',title:'Term',content:'Body'}).body,'Body');
 assert.equal(normalizeLearningUiNode({id:'q',type:'question',question:'Why?',answer:'Because'}).problem,'Why?');
});

test('ambiguous answer keys, repeated/empty options and missing card sides give located errors',()=>{
 for(const patch of [{correct:'AE'},{correct:0},{correct:'First'},{options:[{letter:'A',text:'One'},{letter:'A',text:'Two'}]},
  {options:[{letter:'A',text:''},{letter:'B',text:'Two'}]},{options:['Only one']},{correct:undefined}]){
  const node={...quiz,...patch};
  const validation=validateIntelligentUi({version:1,nodes:[node]});
  assert.equal(validation.ok,false,JSON.stringify(patch));assert.equal(validation.kind,'learning');assert.ok(validation.issues.length);
  assert.match(validation.error,/nodes.quiz./);
 }
 for(const node of [{kind:'definition',term:'Empty card'},{kind:'flashcard',front:'No back'},{kind:'practice',problem:{}},{kind:'unknown'}])assert.ok(learningUiIssues({id:'bad',type:'learning',...node}).length);
});

test('ungraded questions remain explicit, never acquire a guessed answer and cannot have a hidden rubric',()=>{
 assert.deepEqual(learningUiIssues({...quiz,correct:undefined,graded:false}),[]);
 assert.ok(learningUiIssues({...quiz,graded:false}).some(x=>x.path==='correct'));
 const normalized=normalizeLearningUiNode({...quiz,correct:undefined,graded:'false'});
 assert.equal(normalized.correct,undefined);assert.equal(normalized.graded,false);
});

test('learning patches validate atomically and keep existing valid nodes untouched',()=>{
 const nodes=[quiz,{id:'keep',type:'text',text:'Keep this'}];
 const bad=applyIntelligentUiPatch(nodes,[{op:'patch',nodeId:'quiz',props:{correct:'E'}}]);
 assert.equal(bad.ok,false);assert.equal(nodes[0].correct,'A');
 const good=applyIntelligentUiPatch(nodes,[{op:'patch',nodeId:'quiz',props:{q:'Updated question'}}]);
 assert.equal(good.ok,true);assert.equal(good.nodes[0].q,'Updated question');assert.equal(good.nodes[1].text,'Keep this');
});


test('malformed history cards preserve readable sibling nodes but unsafe documents stay rejected',()=>{
 const document={version:1,nodes:[{id:'bad',type:'learning',kind:'flashcard',front:'Question only'},{id:'text',type:'text',text:'Still readable'}]};
 assert.equal(parseIntelligenceUiRecords(JSON.stringify(document)).length,2);
 const unsafe=structuredClone(document);unsafe.nodes[0].html='<script>alert(1)</script>';
 assert.deepEqual(parseIntelligenceUiRecords(JSON.stringify(unsafe)),[]);
});

test('question nodes with explicit choices recover the quiz contract instead of dropping options',()=>{
 const node=normalizeLearningUiNode({id:'q',type:'question',question:'Choose',options:{A:'First',B:'Second'},answer:'B'});
 assert.equal(node.kind,'quiz');assert.equal(node.correct,'B');assert.deepEqual(learningUiIssues(node),[]);
});

test('native visualization nodes parse and validate as first-class UI records', () => {
 const viz = {
  id: 'v1',
  type: 'visualization',
  template: 'bar',
  title: 'Scores',
  accessibilitySummary: 'Math scores',
  payload: { categories: ['Math'], series: [{ data: [95] }] },
 };
 assert.equal(validateIntelligentUi({ version: 1, nodes: [viz] }).ok, true);
 const records = parseIntelligenceUiRecords(JSON.stringify(viz));
 assert.equal(records.length, 1);
 assert.equal(records[0].type, 'visualization');
 assert.equal(records[0].template, 'bar');
});
