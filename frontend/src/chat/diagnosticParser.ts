import { stateStore } from '../state/store.ts';

interface ParsedDiagnosticOption {
  letter?: unknown;
  text?: unknown;
  level?: unknown;
}

interface ParsedDiagnosticQuestion {
  q?: unknown;
  knowledgePoint?: unknown;
  subarea?: unknown;
  nodeIdx?: unknown;
  opts?: unknown;
}

interface NormalizedDiagnosticOption {
  letter: string;
  text: string;
  level: string;
}

interface NormalizedDiagnosticQuestion {
  q: string;
  knowledgePoint: string;
  subarea: string;
  nodeIdx: number;
  opts: NormalizedDiagnosticOption[];
}

type ObjectFieldResult =
  | { done: true; next: number }
  | { key: string; valueIndex: number }
  | { next: number };

function setLastCallError(value: string): void {
  stateStore.dispatch({type:'state/set',key:'lastCallError',value:value});
}

/* Parse a single-question JSON object from the model response.
   Returns the normalized question or null. Sets window.stateStore.read("lastCallError")
   on failure for the api-badge to surface. */
function parseErrorMessage(error: unknown): string {
  const record = error && typeof error === 'object' ? error as { message?: unknown } : null;
  return record?.message ? String(record.message) : String(error);
}

export function parseOneDiagResponse(resp: unknown,index: number): NormalizedDiagnosticQuestion | null {
  try{
    let raw=String(resp||"");
    /* Strip think blocks. Reasoning models emit <think>...</think>
       which can be huge; if the response was truncated mid-think
       there's no closing tag — discard everything from <think>
       onward so we don't accidentally swallow the JSON. */
    raw=raw.replace(/<think>[\s\S]*?<\/think>/gi,'');
    raw=raw.replace(/<think>[\s\S]*$/gi,'');
    /* Strip code fences if present */
    raw=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    const start=raw.indexOf("{"),end=raw.lastIndexOf("}");
    if(start<0||end<=start){
      setLastCallError("Diag response had no JSON object");
      return null;
    }
    const jsonStr=raw.slice(start,end+1);
    let parsed: ParsedDiagnosticQuestion | null = null;
    try{
      parsed=JSON.parse(jsonStr) as ParsedDiagnosticQuestion;
    }catch(parseErr){
      /* JSON.parse failed — usually because the model embedded
         unescaped ASCII double quotes inside a CJK string. Fall
         back to the existing balanced-brace per-object extractor
         so we still surface the question instead of giving up. */
      parsed=parseSingleDiagObject(jsonStr);
      if(!parsed)throw parseErr;
    }
    if(!parsed||typeof parsed.q!=="string"||!Array.isArray(parsed.opts)||parsed.opts.length<3){
      setLastCallError("Diag response not a valid question object");
      return null;
    }
    /* Pin nodeIdx to the question slot so each step maps to its
       own KB node. The model may return a nodeIdx but we trust
       the round-robin slot more. */
    parsed.nodeIdx=index%5;
    return normalizeDiagQuestions([parsed])[0]||null;
  }catch(e){
    setLastCallError("Diag JSON parse failed: "+parseErrorMessage(e));
    return null;
  }
}

/* Shared finalizer: takes an array of question objects (from either
   JSON.parse or the balanced extractor), normalizes the shape, and
   returns at most 5 questions. */
const DIAG_LEVELS=["internalized","fuzzy","blank"];
const DIAG_LETTERS=["A","B","C","D"];
const DIAG_DEFAULT_OPTION_TEXT=["I know this well","I have heard of this","I do not know this"];

function normalizeDiagOptions(value: unknown): NormalizedDiagnosticOption[] | null {
  if(!Array.isArray(value)||value.length<3)return null;
  const normalized: NormalizedDiagnosticOption[]=[];
  const values=value as unknown[];
  for(let i=0;i<values.length&&normalized.length<4;i++){
    const source=(values[i]||{}) as ParsedDiagnosticOption;
    const fallback=DIAG_DEFAULT_OPTION_TEXT[normalized.length]||"I do not know this";
    const text=typeof source.text==="string"?source.text.trim():fallback;
    if(!text)continue;
    normalized.push({
      letter:DIAG_LETTERS[normalized.length]||(normalized.length+""),
      text:text,
      level:typeof source.level==="string"&&DIAG_LEVELS.includes(source.level)
        ?source.level:DIAG_LEVELS[normalized.length]||"blank"
    });
  }
  return normalized.length>=3?normalized:null;
}

function normalizeDiagQuestion(value: unknown,index: number): NormalizedDiagnosticQuestion | null {
  if(!value||typeof value!=="object")return null;
  const question=value as ParsedDiagnosticQuestion;
  const text=typeof question.q==="string"?question.q.trim():"";
  if(!text)return null;
  const opts=normalizeDiagOptions(question.opts);
  if(!opts)return null;
  let nodeIdx=parseInt(question.nodeIdx as string,10);
  if(!isFinite(nodeIdx)||nodeIdx<0||nodeIdx>4)nodeIdx=index;
  return{
    q:text,
    knowledgePoint:typeof question.knowledgePoint==="string"&&question.knowledgePoint.trim()?question.knowledgePoint.trim():"",
    subarea:typeof question.subarea==="string"&&question.subarea.trim()?question.subarea.trim():"Sub-area "+(index+1),
    nodeIdx:nodeIdx,
    opts:opts
  };
}

export function normalizeDiagQuestions(parsed: unknown): NormalizedDiagnosticQuestion[] {
  if(!Array.isArray(parsed))return[];
  const out: NormalizedDiagnosticQuestion[]=[];
  for(let i=0;i<parsed.length&&out.length<5;i++){
    const question=normalizeDiagQuestion(parsed[i],out.length);
    if(question)out.push(question);
  }
  return out;
}

/* Last-resort extractor for diagnostic JSON that JSON.parse can't
   handle (typically because the model put ASCII " inside Chinese
   strings). Walks the source character by character with a tiny
   state machine — tracking JSON-string boundaries, escapes, and
   brace / bracket nesting — and pulls out each top-level object
   inside the outer array. For each object, it scans for known
   keys ("q", "subarea", "nodeIdx", "opts") and reads their values
   with the same string-state-aware logic. Not a general JSON
   parser; built specifically for the diag schema. */
export function extractDiagQuestionsBalanced(text: string): ParsedDiagnosticQuestion[] {
  const out: ParsedDiagnosticQuestion[]=[];
  if(!text)return out;
  /* Walk past the opening '['. */
  let i=0;const n=text.length;
  while(i<n&&text[i]!=='[')i++;
  if(i>=n)return out;
  i++;
  while(i<n&&out.length<5){
    /* Skip whitespace + commas. */
    while(i<n&&/\s|,/.test(text[i]))i++;
    if(i>=n||text[i]===']')break;
    if(text[i]!=='{')break;
    /* Find the matching '}' using bracket/string awareness. */
    const end=findMatchingClose(text,i,'{','}');
    if(end<0)break;
    const objText=text.slice(i,end+1);
    const parsed=parseSingleDiagObject(objText);
    if(parsed)out.push(parsed);
    i=end+1;
  }
  return out;
}

/* Find the matching close bracket for the open at position `open`,
   honoring JSON string boundaries and backslash escapes so we
   don't get confused by a '}' inside a quoted string. */
function findMatchingClose(text: string,open: number,openCh: string,closeCh: string): number {
  let depth=0;const n=text.length;
  for(let i=open;i<n;i++){
    const c=text[i];
    if(c==='\\'){i++;continue}
    if(c==='"'){
      i++;
      while(i<n){
        if(text[i]==='\\'){i+=2;continue}
        if(text[i]==='"'){break}
        i++;
      }
      continue;
    }
    if(c===openCh)depth++;
    else if(c===closeCh){depth--;if(depth===0)return i}
  }
  return-1;
}

function nextObjectField(text: string,index: number): ObjectFieldResult {
  let i=index;
  const n=text.length;
  while(i<n&&/\s|,/.test(text[i]))i++;
  if(i>=n-1||text[i]==='}')return{done:true,next:i};
  if(text[i]!=='"')return{next:i+1};
  const keyEnd=readJsonString(text,i);
  if(keyEnd<0)return{next:i+1};
  const key=text.slice(i+1,keyEnd);
  i=keyEnd+1;
  while(i<n&&/\s/.test(text[i]))i++;
  if(text[i]!==':')return{next:i+1};
  i++;
  while(i<n&&/\s/.test(text[i]))i++;
  return i<n?{key:key,valueIndex:i}:{done:true,next:i};
}

function skipScalarValue(text: string,index: number): number {
  let i=index;
  while(i<text.length&&/[0-9eE+\-.]/.test(text[i]))i++;
  return i;
}

function assignDiagString(question: ParsedDiagnosticQuestion,key: string,value: string): void {
  if(key==='q')question.q=value;
  else if(key==='subarea')question.subarea=value;
  else if(key==='nodeIdx'){
    const nodeIdx=parseInt(value,10);
    if(isFinite(nodeIdx))question.nodeIdx=nodeIdx;
  }
}

function readDiagFieldValue(text: string,key: string,index: number,question: ParsedDiagnosticQuestion): number {
  if(text[index]==='['){
    const arrayEnd=findMatchingClose(text,index,'[',']');
    if(arrayEnd<0)return-1;
    const options=extractOptArray(text.slice(index+1,arrayEnd));
    const existingOptions=Array.isArray(question.opts)?question.opts as ParsedDiagnosticOption[]:[];
    if(options.length)question.opts=existingOptions.concat(options);
    return arrayEnd+1;
  }
  if(text[index]==='{'){
    const objectEnd=findMatchingClose(text,index,'{','}');
    return objectEnd<0?-1:objectEnd+1;
  }
  if(text[index]==='"'){
    const valueEnd=readJsonString(text,index);
    if(valueEnd<0)return-1;
    const value=text.slice(index+1,valueEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    assignDiagString(question,key,value);
    return valueEnd+1;
  }
  return skipScalarValue(text,index);
}

/* Parse one flat question object via per-key string-aware scan.
   Returns null on failure. */
function parseSingleDiagObject(objText: string): ParsedDiagnosticQuestion | null {
  const question: ParsedDiagnosticQuestion={opts:[]};
  const n=objText.length;let i=1;/* skip '{' */
  while(i<n-1){
    const field=nextObjectField(objText,i);
    if('done' in field&&field.done)break;
    if(!('key' in field)){i=field.next;continue}
    const key=field.key.replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    const next=readDiagFieldValue(objText,key,field.valueIndex,question);
    if(next<0)break;
    i=next;
  }
  return(question.q||question.subarea)?question:null;
}

/* Read a JSON string starting at the opening quote. Returns the
   position of the closing quote, or -1 if not found / unbalanced. */
function readJsonString(text: string,openQuote: number): number {
  const n=text.length;
  if(text[openQuote]!=='"')return-1;
  let i=openQuote+1;
  while(i<n){
    const c=text[i];
    if(c==='\\'){i+=2;continue}
    if(c==='"')return i;
    i++;
  }
  return-1;
}

/* Pull option objects out of an opts array body (between [ and ]). */
function extractOptArray(arrText: string): ParsedDiagnosticOption[] {
  const out: ParsedDiagnosticOption[]=[];let i=0;const n=arrText.length;
  while(i<n&&out.length<4){
    while(i<n&&/\s|,/.test(arrText[i]))i++;
    if(i>=n)break;
    if(arrText[i]!=='{')break;
    const end=findMatchingClose(arrText,i,'{','}');
    if(end<0)break;
    const obj=parseSingleOptObject(arrText.slice(i,end+1));
    if(obj)out.push(obj);
    i=end+1;
  }
  return out;
}

/* Parse one {"letter":"A","text":"...","level":"..."} object. */
function parseSingleOptObject(objText: string): ParsedDiagnosticOption | null {
  const option: ParsedDiagnosticOption={};const n=objText.length;let i=1;
  while(i<n-1){
    const field=nextObjectField(objText,i);
    if('done' in field&&field.done)break;
    if(!('key' in field)){i=field.next;continue}
    if(objText[field.valueIndex]!=='"'){i=field.valueIndex+1;continue}
    const valueEnd=readJsonString(objText,field.valueIndex);
    if(valueEnd<0)break;
    const value=objText.slice(field.valueIndex+1,valueEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    if(field.key==='letter'||field.key==='text'||field.key==='level')option[field.key]=value;
    i=valueEnd+1;
  }
  return(option.text||option.letter||option.level)?option:null;
}
