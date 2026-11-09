/** One DOM-free JSON contract for learning cards, used before storage and display. */
export const LEARNING_KINDS = ['quiz','practice','definition','flashcard','example','theorem','proof','derivation','key-point','step'];
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const aliases={knowledgecard:'definition',quizcard:'quiz',questioncard:'practice',definitioncard:'definition',flashcardcard:'flashcard',flash_card:'flashcard','flash-card':'flashcard',multiplechoice:'quiz',keypoint:'key-point',question:'practice',qa:'practice','q&a':'practice',knowledge:'definition','knowledge-card':'definition',knowledge_card:'definition',multiple_choice:'quiz','multiple-choice':'quiz',mcq:'quiz',key_point:'key-point'};
const canonical=value=>typeof value==='string'?(aliases[value.trim().toLowerCase()]??value.trim().toLowerCase()):value;
const first=(object,keys)=>keys.map(key=>object[key]).find(value=>value!==undefined&&value!==null);
const collection=value=>record(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'item')?value.item:value;
const bool=value=>value==='true'?true:value==='false'?false:value;

function answerKey(value) {
 if(Array.isArray(value))return value.every(item=>typeof item==='string')?answerKey(value.join(',')):value;
 if(typeof value!=='string')return value;
 const compact=value.trim().toUpperCase().replace(/\bAND\b/g,',').replace(/[\s,，、;；/&|]+/g,'');
 return /^[A-H]+$/.test(compact)?[...new Set(compact)].sort().join(''):value;
}

/** Repair encoding/field aliases only. Never infer a correct answer or drop invalid options. */
export function normalizeLearningUiNode(input) {
 if(!record(input))return input;
 const type=canonical(input.type);
 if(type!=='learning'&&!LEARNING_KINDS.includes(type))return input;
 const node={...input,type:'learning',kind:canonical(type==='learning'?first(input,['kind','component','variant']):type)};
 const content=record(input.content)?input.content:record(input.data)?input.data:{};
 const source={...content,...input};
 const requested=typeof (input.kind??input.type)==='string'?(input.kind??input.type).trim().toLowerCase():'';
 if(['question','questioncard','qa','q&a'].includes(requested)&&first(source,['options','choices'])!==undefined)node.kind='quiz';
 const assign=(key,keys)=>{const value=first(source,[key,...keys]);if(value!==undefined)node[key]=typeof value==='string'?value.trim():value;};
 assign('title',['label']);
 if(node.kind==='quiz'){
  assign('q',['question','stem','prompt']);
  let options=collection(first(source,['options','choices']));
  if(record(options))options=Object.entries(options).map(([letter,value])=>record(value)?{...value,letter:value.letter??letter}:{letter,text:value});
  if(Array.isArray(options))node.options=options.map((option,index)=>{
   const generated=String.fromCharCode(65+index);
   if(typeof option==='string'){
    const match=option.match(/^([A-Ha-h])[.、:：)）]\s*(.+)$/s);
    return {letter:match?match[1].toUpperCase():generated,text:match?match[2].trim():option.trim()};
   }
   if(!record(option))return option;
   const letter=first(option,['letter','id','key'])??generated;
   return {...option,letter:typeof letter==='string'?letter.trim().toUpperCase():letter,text:first(option,['text','label','content','value']),...(option.explanation===undefined&&option.reason!==undefined?{explanation:option.reason}:{})};
  });
  const correct=first(source,['correct','answer','answerKey','correctAnswer']);
  if(correct!==undefined)node.correct=answerKey(correct);
  if(source.graded!==undefined)node.graded=bool(source.graded);
  if(source.multi!==undefined)node.multi=bool(source.multi);
  if(typeof node.correct==='string'&&/^[A-H]{2,8}$/.test(node.correct))node.multi=true;
  assign('explanation',['explain','rationale']);
 }else if(node.kind==='practice'||node.kind==='example'){
  assign('problem',['question','q','prompt']);assign('solution',['answer','response']);assign('correct',['answerKey']);
  assign('hint',[]);
  const hints=collection(source.hints);if(hints!==undefined)node.hints=hints;
 }else if(node.kind==='flashcard'){
  assign('front',['question','q','prompt']);assign('back',['answer','response']);
 }else{
  assign('term',['concept','title']);
  assign('body',['content','text','explanation','answer']);
  if(node.kind==='theorem')assign('statement',['body','content','text']);
  if(node.kind==='step')node.n=typeof source.n==='string'&&/^\d+$/.test(source.n)?Number(source.n):source.n??1;
 }
 return node;
}

/** Return all located omissions so a model can fix one card in a single retry. */
export function learningUiIssues(input) {
 const node=normalizeLearningUiNode(input);
 const issues=[];
 const issue=(path,message)=>issues.push({path,message});
 if(!record(node)||node.type!=='learning'||!LEARNING_KINDS.includes(node.kind))return [{path:'kind',message:'Use '+LEARNING_KINDS.join(', ')}];
 const string=(key,required=false,max=8000)=>{
  const value=node[key];
  if(value===undefined&&!required)return;
  if(typeof value!=='string'||value.length>max||required&&!value.trim())issue(key,`Use ${required?'nonempty ':''}text of at most ${max} characters`);
 };
 string('title',false,200);
 if(node.kind==='quiz'){
  string('q',true);string('explanation');
  if(!Array.isArray(node.options)||node.options.length<2||node.options.length>8)issue('options','Use 2–8 options with unique A–H letters and nonempty text');
  const letters=new Set();
  if(Array.isArray(node.options))node.options.forEach((option,index)=>{
   const path=`options[${index}]`;
   if(!record(option)){issue(path,'Use {letter,text,explanation?}');return;}
   if(typeof option.letter!=='string'||!/^[A-H]$/.test(option.letter)||letters.has(option.letter))issue(path+'.letter','Use a unique letter A–H');
   letters.add(option.letter);
   if(typeof option.text!=='string'||!option.text.trim()||option.text.length>2000)issue(path+'.text','Use nonempty text of at most 2000 characters');
   if(option.explanation!==undefined&&(typeof option.explanation!=='string'||option.explanation.length>4000))issue(path+'.explanation','Use text of at most 4000 characters');
  });
  if(node.multi!==undefined&&typeof node.multi!=='boolean')issue('multi','Use a boolean');
  if(node.graded!==undefined&&typeof node.graded!=='boolean')issue('graded','Use a boolean');
  if(node.graded===false){if(node.correct!==undefined&&node.correct!==null&&node.correct!=='')issue('correct','Omit the answer key for an ungraded question');}
  else if(typeof node.correct!=='string'||!/^[A-H]+$/.test(node.correct)||[...node.correct].some(letter=>!letters.has(letter)))issue('correct','Use only existing option letters, e.g. A or AC; never an index or answer text. Use graded:false explicitly when no answer is known');
 }else if(node.kind==='flashcard'){string('front',true);string('back',true);}
 else if(node.kind==='practice'||node.kind==='example'){
  string('problem',true);string('solution',node.kind==='example');string('correct');string('hint');
  if(node.hints!==undefined&&(!Array.isArray(node.hints)||node.hints.length>5||node.hints.some(hint=>typeof hint!=='string'||!hint.trim()||hint.length>4000)))issue('hints','Use at most five nonempty hint strings');
 }else if(node.kind==='theorem')string('statement',true);
 else {string('body',true);if(node.kind==='definition')string('term',false,400);if(node.kind==='step'&&(!Number.isInteger(node.n)||node.n<1||node.n>100))issue('n','Use an integer from 1 to 100');}
 return issues;
}

/**
 * OpenUI component names that only exist because the model wanted a learning
 * card. They are not in the OpenUI catalog, so every call fails — but the
 * failure must be repaired with the learning contract, not chart advice.
 * Names are compared without separators, so `QuestionCard` and
 * `question-card` both match.
 */
export const LEARNING_UI_MISUSE_COMPONENTS = ['quiz','quizcard','question','questioncard','knowledgecard','mcq','multiplechoice','multiplechoicequestion','questionanswer'];

/** The learning component names an OpenUI inspection complained about. */
export function openUiLearningMisuse(issues) {
 const found=new Set();
 for(const issue of Array.isArray(issues)?issues:[]){
  if(typeof issue!=='string')continue;
  let name=null;
  try{const parsed=JSON.parse(issue);if(parsed&&typeof parsed.component==='string')name=parsed.component;}catch{/* not a JSON issue */}
  if(!name){const match=issue.match(/component\s+"([A-Za-z0-9_-]{1,40})"/i);if(match)name=match[1];}
  if(!name)continue;
  if(LEARNING_UI_MISUSE_COMPONENTS.includes(name.toLowerCase().replace(/[^a-z0-9]/g,'')))found.add(name);
 }
 return [...found];
}

export const LEARNING_UI_GUIDANCE = `Learning cards use render_intelligent_ui with JSON nodes, never OpenUI learning-card functions (Quiz, QuizCard, Question, QuestionCard, KnowledgeCard, MCQ) or nested XML. Every card is {id,type:"learning",kind,...}; text fields are Markdown/LaTeX strings, not objects or XML attributes. Escape backslashes once for JSON. Keep essential explanation in prose and use cards only when they serve the learner.
Required fields by kind:
- quiz: q and 2-8 options [{letter:"A",text:"...",explanation:"..."},...]. Unique A-H letters. correct:"A" or correct:"AC" for multiple answers (multi:true). Include a specific explanation per option, hidden until submission. Never use numeric indexes, the answer text, or a letter absent from the options. If no correct answer is established, set graded:false and omit correct; the answer is recorded without grading. Never infer or invent an answer just to fill a required field.
- practice: problem; optional title, hint, hints (at most five strings), solution and correct. Use only for explicitly requested written/free-response exercises. A worked answer goes in solution, not inside the question text.
- definition: body, optional term/title. Use for a named concept or essential conceptual distinction, not routine summaries.
- flashcard: front and back, both nonempty. Keep the answer only on the back.
- example: problem and solution, optional title/hints.
- theorem: statement, optional title. Use only for an actual theorem.
- proof and derivation: body, optional title.
- key-point: body. Use sparingly for an essential condition/distinction.
- step: body, optional integer n (1-100).
Do not nest a learning node inside another card's text; use sibling JSON nodes or parent them to a panel/stack. Keep option explanations and correct answers out of q and option text. Do not turn ordinary conversation into a test. Prefer a quiz over free-response exercises unless the user explicitly requests a written answer. Ordinarily use at most one definition/theorem/key-point card in a reply.
Example: {version:1,nodes:[{id:"check",type:"learning",kind:"quiz",q:"Which number is even?",options:[{letter:"A",text:"2",explanation:"2 is divisible by 2."},{letter:"B",text:"3",explanation:"3 is not divisible by 2."}],correct:"A"}]}
Knowledge example: {id:"concept",type:"learning",kind:"definition",term:"Derivative",body:"The limiting rate of change."}
Question example: {id:"practice",type:"learning",kind:"practice",problem:"Explain your reasoning.",hint:"Start from the definition."}
If validation rejects a card, fix all named paths in that same JSON contract in one retry. Keep the rest of the answer; never switch to a different rendering language or guess a grading key.`;
