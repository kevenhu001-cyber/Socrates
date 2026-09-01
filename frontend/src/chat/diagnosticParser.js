import { stateStore } from '../state.js';

function setLastCallError(value) {
  stateStore.dispatch({type:'state/set',key:'lastCallError',value:value});
}

/* Parse a single-question JSON object from the model response.
   Returns the normalized question or null. Sets getState().lastCallError
   on failure for the api-badge to surface. */
export function parseOneDiagResponse(resp,index){
  try{
    var raw=String(resp||"");
    /* Strip think blocks. Reasoning models emit <think>...</think>
       which can be huge; if the response was truncated mid-think
       there's no closing tag — discard everything from <think>
       onward so we don't accidentally swallow the JSON. */
    raw=raw.replace(/<think>[\s\S]*?<\/think>/gi,'');
    raw=raw.replace(/<think>[\s\S]*$/gi,'');
    /* Strip code fences if present */
    raw=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    var start=raw.indexOf("{"),end=raw.lastIndexOf("}");
    if(start<0||end<=start){
      setLastCallError("Diag response had no JSON object");
      return null;
    }
    var jsonStr=raw.slice(start,end+1);
    var parsed=null;
    try{
      parsed=JSON.parse(jsonStr);
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
    parsed.nodeIdx=index;
    return normalizeDiagQuestions([parsed])[0]||null;
  }catch(e){
    setLastCallError("Diag JSON parse failed: "+(e&&e.message?e.message:String(e)));
    return null;
  }
}

/* Shared finalizer: takes an array of question objects (from either
   JSON.parse or the balanced extractor), normalizes the shape, and
   returns at most 5 questions. */
export function normalizeDiagQuestions(parsed){
  if(!Array.isArray(parsed))return[];
  var out=[];
  for(var i=0;i<parsed.length&&out.length<5;i++){
    var q=parsed[i];
    if(!q||typeof q!=="object")continue;
    var text=(typeof q.q==="string")?q.q.trim():"";
    if(!text)continue;
    var opts=Array.isArray(q.opts)?q.opts:[];
    if(opts.length<3)continue;
    var levels=["internalized","fuzzy","blank"];
    var letters=["A","B","C","D"];
    var fixedOpts=[];
    for(var oi=0;oi<opts.length&&fixedOpts.length<4;oi++){
      var src=opts[oi]||{};
      var ot=(typeof src.text==="string")?src.text.trim():((levels[fixedOpts.length]==="internalized"?"I know this well":levels[fixedOpts.length]==="fuzzy"?"I have heard of this":"I do not know this"));
      if(!ot)continue;
      fixedOpts.push({
        letter:letters[fixedOpts.length]||(fixedOpts.length+""),
        text:ot,
        level:levels[fixedOpts.length]||"fuzzy"
      });
    }
    if(fixedOpts.length<3)continue;
    var nodeIdx=parseInt(q.nodeIdx,10);
    if(!isFinite(nodeIdx)||nodeIdx<0||nodeIdx>4)nodeIdx=out.length;
    out.push({
      q:text,
      knowledgePoint:(typeof q.knowledgePoint==="string"&&q.knowledgePoint.trim())?q.knowledgePoint.trim():"",
      subarea:(typeof q.subarea==="string"&&q.subarea.trim())?q.subarea.trim():("Sub-area "+(out.length+1)),
      nodeIdx:nodeIdx,
      opts:fixedOpts.slice(0,3)
    });
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
export function extractDiagQuestionsBalanced(text){
  var out=[];
  if(!text)return out;
  /* Walk past the opening '['. */
  var i=0;var n=text.length;
  while(i<n&&text[i]!=='[')i++;
  if(i>=n)return out;
  i++;
  while(i<n&&out.length<5){
    /* Skip whitespace + commas. */
    while(i<n&&/\s|,/.test(text[i]))i++;
    if(i>=n||text[i]===']')break;
    if(text[i]!=='{')break;
    /* Find the matching '}' using bracket/string awareness. */
    var end=findMatchingClose(text,i,'{','}');
    if(end<0)break;
    var objText=text.slice(i,end+1);
    var parsed=parseSingleDiagObject(objText);
    if(parsed)out.push(parsed);
    i=end+1;
  }
  return out;
}

/* Find the matching close bracket for the open at position `open`,
   honoring JSON string boundaries and backslash escapes so we
   don't get confused by a '}' inside a quoted string. */
function findMatchingClose(text,open,openCh,closeCh){
  var depth=0;var n=text.length;
  for(var i=open;i<n;i++){
    var c=text[i];
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

/* Parse one flat question object via per-key string-aware scan.
   Returns null on failure. */
function parseSingleDiagObject(objText){
  var o={opts:[]};
  var n=objText.length;var i=1;/* skip '{' */
  while(i<n-1){
    /* Find next key: a "...":" pattern. */
    while(i<n&&/\s|,/.test(objText[i]))i++;
    if(i>=n-1||objText[i]==='}')break;
    if(objText[i]!=='"'){i++;continue}
    /* Read key. */
    var keyEnd=readJsonString(objText,i);
    if(keyEnd<0){i++;continue}
    var key=objText.slice(i+1,keyEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    i=keyEnd+1;
    /* Skip ":". */
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!==':'){i++;continue}
    i++;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(i>=n)break;
    if(objText[i]==='['){
      /* opts array — read each {letter, text, level} object. */
      var arrEnd=findMatchingClose(objText,i,'[',']');
      if(arrEnd<0)break;
      var arrText=objText.slice(i+1,arrEnd);
      var opts=extractOptArray(arrText);
      if(opts&&opts.length)o.opts=o.opts.concat(opts);
      i=arrEnd+1;
    }else if(objText[i]==='{'){
      var objEnd=findMatchingClose(objText,i,'{','}');
      if(objEnd<0)break;
      i=objEnd+1;
    }else if(objText[i]==='"'){
      var valEnd=readJsonString(objText,i);
      if(valEnd<0)break;
      var val=objText.slice(i+1,valEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
      if(key==='q')o.q=val;
      else if(key==='subarea')o.subarea=val;
      else if(key==='nodeIdx'){var ni=parseInt(val,10);if(isFinite(ni))o.nodeIdx=ni}
      i=valEnd+1;
    }else{
      /* number / true / false / null — skip a run of token chars. */
      while(i<n&&/[0-9eE+\-.]/.test(objText[i]))i++;
    }
  }
  return(o.q||o.subarea)?o:null;
}

/* Read a JSON string starting at the opening quote. Returns the
   position of the closing quote, or -1 if not found / unbalanced. */
function readJsonString(text,openQuote){
  var n=text.length;
  if(text[openQuote]!=='"')return-1;
  var i=openQuote+1;
  while(i<n){
    var c=text[i];
    if(c==='\\'){i+=2;continue}
    if(c==='"')return i;
    i++;
  }
  return-1;
}

/* Pull option objects out of an opts array body (between [ and ]). */
function extractOptArray(arrText){
  var out=[];var i=0;var n=arrText.length;
  while(i<n&&out.length<4){
    while(i<n&&/\s|,/.test(arrText[i]))i++;
    if(i>=n)break;
    if(arrText[i]!=='{')break;
    var end=findMatchingClose(arrText,i,'{','}');
    if(end<0)break;
    var obj=parseSingleOptObject(arrText.slice(i,end+1));
    if(obj)out.push(obj);
    i=end+1;
  }
  return out;
}

/* Parse one {"letter":"A","text":"...","level":"..."} object. */
function parseSingleOptObject(objText){
  var o={};var n=objText.length;var i=1;
  while(i<n-1){
    while(i<n&&/\s|,/.test(objText[i]))i++;
    if(i>=n-1||objText[i]==='}')break;
    if(objText[i]!=='"'){i++;continue}
    var keyEnd=readJsonString(objText,i);
    if(keyEnd<0){i++;continue}
    var key=objText.slice(i+1,keyEnd);
    i=keyEnd+1;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!==':'){i++;continue}
    i++;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!=='"'){i++;continue}
    var valEnd=readJsonString(objText,i);
    if(valEnd<0)break;
    var val=objText.slice(i+1,valEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    if(key==='letter'||key==='text'||key==='level')o[key]=val;
    i=valEnd+1;
  }
  return(o.text||o.letter||o.level)?o:null;
}
