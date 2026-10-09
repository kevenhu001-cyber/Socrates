/* chat/promptTemplates.js — built-in and user-defined prompt templates. */

var ICON_SUMMARIZE='<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/><rect x="5.5" y="3.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="7.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="11.4" width="6" height="1.2" rx="0.6"/></svg>';
var ICON_TRANSLATE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
var ICON_EXPLAIN_CODE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,4.5 2.5,8 6,11.5"/><polyline points="10,4.5 13.5,8 10,11.5"/><line x1="9.2" y1="3.5" x2="6.8" y2="12.5"/></svg>';
var ICON_DEBUG='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="9.5" rx="3.2" ry="3.8"/><line x1="4.8" y1="9.5" x2="11.2" y2="9.5"/><line x1="6.5" y1="6" x2="5.5" y2="3.8"/><line x1="9.5" y1="6" x2="10.5" y2="3.8"/><line x1="5" y1="12" x2="3" y2="13.2"/><line x1="11" y1="12" x2="13" y2="13.2"/><line x1="3.2" y1="9.5" x2="1.4" y2="9.5"/><line x1="12.8" y1="9.5" x2="14.6" y2="9.5"/></svg>';
var ICON_QUIZ='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M5.7 6.3a2.3 2.3 0 0 1 4.5.7c0 1.1-.9 1.5-1.5 1.8-.4.2-.5.6-.5 1.1"/><circle cx="8.2" cy="11.8" r="0.7" fill="currentColor" stroke="none"/></svg>';
var ICON_SOCRATIC='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7l-3 3v-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><circle cx="5.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="8" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="10.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>';

export var SYSTEM_PROMPT_SUMMARIZE=`You are a precise summarization specialist. Condense the user's passage into a compact, self-contained summary that preserves the supported facts, names, numbers, dates, and conclusions.

Style:
- Match the source language. Do not translate.
- Write like a careful abstract: concise, calm, and faithful to what the source actually states.
- Preserve technical terms, proper nouns, numbers, and units exactly.
- A short bullet list usually works well, but let the passage decide the shape; do not force a fixed structure or a target length.
- Give the summary directly, without preamble, evaluation, or meta-commentary unless the user asks for them.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var SYSTEM_PROMPT_TRANSLATE=`You are a professional translator into English. Translate the user's text naturally while preserving meaning, tone, register, formatting, and technical precision.

Style:
- Adapt idioms to natural English rather than translating them literally.
- Preserve proper nouns, brand names, and technical terms when English usage keeps the original form.
- Keep the register of casual, formal, technical, or creative source text in the translation.
- If the source is already English, return it unchanged unless the user explicitly asks for refinement.
- Return the translation directly. Leave explanations, footnotes, and alternative versions out unless the user asks for them.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var SYSTEM_PROMPT_EXPLAIN_CODE=`You are a patient code mentor. Explain the user's code, its data flow, and its design choices.

Style:
- Start with a concise summary of what the code does, then walk through it in whatever order reads most clearly, usually the flow from inputs to outputs.
- Call out subtle bugs, edge cases, performance risks, security concerns, and surprising behavior that are genuinely present in the snippet.
- Match the user's apparent level: do not pad a simple snippet or over-explain fundamentals for an advanced one.
- Use headings, inline code, and fenced code blocks when they genuinely improve clarity.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var SYSTEM_PROMPT_DEBUG=`You are a senior debugger. The user provides code plus the expected and actual behavior. Diagnose the most likely cause and propose the smallest useful fix.

Style:
- Be direct. Say what the most likely root cause is, point to the relevant line or condition, explain why the behavior follows and which assumption is wrong, show a corrected snippet, and give one quick way to verify.
- Present it in the order and shape that reads most clearly; do not force a fixed template.
- If several independent causes are plausible, address the most likely one first and label the others as secondary. If it is a dependency or environment issue, say so explicitly. Avoid filler.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var SYSTEM_PROMPT_QUIZ=`You are a quiz master. The user provides a topic. Generate a short, genuinely varied quiz on it: one easy recall question, a couple of application or comparison questions, and a couple of analysis, synthesis, or edge-case questions.

Style:
- Give each question a few plausible options, with distractors that reflect real misconceptions, mark the correct answer, and add a one-sentence explanation.
- Present the quiz cleanly and consistently, and let the format follow the content rather than a rigid template.
- Keep it self-contained: do not ask the user to begin, and match the user's language.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var SYSTEM_PROMPT_SOCRATIC=`You are a Socratic tutor. Help the user reason toward a sound answer through focused questions and explanations.

Rules:
- Start by identifying what the user already understands when that information is missing.
- Ask at most one guiding question at a time and target the next specific gap in reasoning.
- Move from a concrete case to the general idea when that improves understanding.
- If the user is stuck or asks directly for the answer, give a proportionate hint or explanation. Do not withhold useful help indefinitely.
- Confirm what is correct, name the specific misconception when something is wrong, and give a clear next step.
- Match the user's language and technical vocabulary. Do not bundle multiple independent exercises into one reply.

Note: the surrounding system prompt's language, formatting, and safety rules still apply; this template only narrows the role.`;

export var BUILTIN_TEMPLATES=[
  {id:"tpl-summarize",title:"Summarize",description:"Condense the pasted text into bullet points.",icon:ICON_SUMMARIZE,category:"writing",shortcut:"/summarize",body:"Paste the text you want summarized:\n\n",systemPrompt:SYSTEM_PROMPT_SUMMARIZE,isBuiltin:true},
  {id:"tpl-translate",title:"Translate to English",description:"Translate the input into natural English.",icon:ICON_TRANSLATE,category:"writing",shortcut:"/translate",body:"Paste the text to translate into English:\n\n",systemPrompt:SYSTEM_PROMPT_TRANSLATE,isBuiltin:true},
  {id:"tpl-explain-code",title:"Explain this code",description:"Walk through the snippet in execution order.",icon:ICON_EXPLAIN_CODE,category:"code",shortcut:"/explain",body:"Paste the code you want explained:\n\n```\n\n```\n",systemPrompt:SYSTEM_PROMPT_EXPLAIN_CODE,isBuiltin:true},
  {id:"tpl-debug",title:"Debug this",description:"Find the bug, propose a fix, explain why it worked.",icon:ICON_DEBUG,category:"code",shortcut:"/debug",body:"Paste the misbehaving code:\n\n```\n\n```\n\nExpected behavior:\nActual behavior:\n",systemPrompt:SYSTEM_PROMPT_DEBUG,isBuiltin:true},
  {id:"tpl-quiz",title:"Quiz me",description:"Generate 5 questions on a topic.",icon:ICON_QUIZ,category:"learning",shortcut:"/quiz",body:"Topic to be quizzed on:\n",systemPrompt:SYSTEM_PROMPT_QUIZ,isBuiltin:true},
  {id:"tpl-socratic",title:"Socratic me",description:"Work toward the answer through focused questions.",icon:ICON_SOCRATIC,category:"learning",shortcut:"/socratic",body:"Problem to work through:\n",systemPrompt:SYSTEM_PROMPT_SOCRATIC,isBuiltin:true}
];

export var PROMPT_TEMPLATES_KEY="socrates-prompt-templates";

export function loadPromptTemplates(){
  /* Throttled background pull — keeps the local cache fresh for the slash
     palette and the modal without making callers wait on the network. */
  try{syncPromptTemplates();}catch(_){}
  var custom;
  try{
    var raw=localStorage.getItem(PROMPT_TEMPLATES_KEY);
    custom=raw?JSON.parse(raw):null;
    if(!Array.isArray(custom))custom=[];
  }catch(_){custom=[]}
  var byShortcut={};
  BUILTIN_TEMPLATES.forEach(function(t){byShortcut[t.shortcut]=t;});
  custom.forEach(function(t){if(t&&t.shortcut)byShortcut[t.shortcut]=t;});
  return Object.values(byShortcut).sort(function(a,b){
    return(a.title||"").localeCompare(b.title||"");
  });
}

export function savePromptTemplates(customs){
  try{
    var persistable=(customs||[]).filter(function(t){return t&&!t.isBuiltin;});
    localStorage.setItem(PROMPT_TEMPLATES_KEY,JSON.stringify(persistable));
  }catch(_){}
}

export function findTemplateByShortcut(s){
  if(!s)return null;
  var list=loadPromptTemplates();
  for(var i=0;i<list.length;i++)if(list[i].shortcut===s)return list[i];
  return null;
}

export function upsertCustomTemplate(t){
  var customs=loadPromptTemplates().filter(function(x){return!x.isBuiltin;});
  var idx=-1;
  for(var i=0;i<customs.length;i++)if(customs[i].id===t.id){idx=i;break}
  if(idx>=0)customs[idx]=t;else customs.push(t);
  savePromptTemplates(customs);
  _syncTemplateToServer(t);
}

export function deleteCustomTemplate(id){
  var customs=loadPromptTemplates().filter(function(x){return!x.isBuiltin&&x.id!==id;});
  savePromptTemplates(customs);
  _deleteTemplateOnServer(id);
}

/* ─── Server sync ─────────────────────────────────────────────────────────
 * The backend (/api/prompts) is the account-level store; localStorage is
 * the offline cache + sync staging area. Server rows carry uuid ids; a
 * local template keeps its "tpl-*" id until its first successful POST
 * adopts the server's uuid. Guests (401) and offline sessions silently
 * keep localStorage-only behaviour — loadPromptTemplates() stays the
 * synchronous source of truth for every caller.
 */
function _isServerId(id){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||"");
}
function _templateToServerRow(t){
  return {
    title:t.title, description:t.description||null, body:t.body||"",
    icon:t.icon||null, category:t.category||"other",
    shortcut:t.shortcut||null, systemPrompt:t.systemPrompt||null
  };
}
function _serverRowToTemplate(row){
  return {
    id:row.id, title:row.title||"", description:row.description||"",
    icon:row.icon||"pg", category:row.category||"other",
    shortcut:row.shortcut||"", body:row.body||"",
    systemPrompt:row.systemPrompt||"", isBuiltin:false
  };
}
function _loadCustomTemplates(){
  return loadPromptTemplates().filter(function(x){return!x.isBuiltin;});
}

var _syncInFlight=null;
var _lastSyncAt=0;
var SYNC_MIN_INTERVAL_MS=30000;

export function syncPromptTemplates(force){
  var apiFetch=(typeof window!=="undefined")&&window.apiFetch;
  if(typeof apiFetch!=="function")return Promise.resolve();
  var now=Date.now();
  if(!force&&now-_lastSyncAt<SYNC_MIN_INTERVAL_MS)return Promise.resolve();
  if(_syncInFlight)return _syncInFlight;
  _lastSyncAt=now;
  _syncInFlight=apiFetch("/api/prompts?scope=mine&limit=200")
    .then(function(res){
      var rows=(res&&Array.isArray(res.templates))?res.templates:[];
      var remoteIds={};
      var merged=rows.map(function(row){
        remoteIds[row.id]=true;
        return _serverRowToTemplate(row);
      });
      var remoteShortcuts={};
      merged.forEach(function(t){if(t.shortcut)remoteShortcuts[t.shortcut]=true;});
      var pending=[];
      _loadCustomTemplates().forEach(function(t){
        if(_isServerId(t.id))return;      /* server copy wins; absent => deleted elsewhere */
        if(t.shortcut&&remoteShortcuts[t.shortcut])return;  /* remote row already owns this /alias */
        pending.push(t);
      });
      /* Push never-synced local templates so they follow the account. */
      return Promise.all(pending.map(function(t){
        return apiFetch("/api/prompts",{method:"POST",body:_templateToServerRow(t)})
          .then(function(created){if(created&&created.id)t.id=created.id;})
          .catch(function(){ /* stays local-only until next sync */ });
      })).then(function(){
        savePromptTemplates(merged.concat(pending));
        try{window.dispatchEvent(new CustomEvent("socrates:prompt-templates-synced"));}catch(_){ }
      });
    })
    .catch(function(){ /* offline / guest — localStorage keeps working */ })
    .finally(function(){_syncInFlight=null;});
  return _syncInFlight;
}

/* Fire-and-forget write-through. Errors are swallowed — the local copy is
   already saved and the next pull sync reconciles. */
function _syncTemplateToServer(t){
  var apiFetch=(typeof window!=="undefined")&&window.apiFetch;
  if(typeof apiFetch!=="function")return;
  var row=_templateToServerRow(t);
  var op=_isServerId(t.id)
    ?apiFetch("/api/prompts/"+encodeURIComponent(t.id),{method:"PATCH",body:row})
    :apiFetch("/api/prompts",{method:"POST",body:row}).then(function(created){
        if(created&&created.id&&created.id!==t.id){
          /* adopt the server uuid so future edits PATCH instead of duplicating */
          var customs=_loadCustomTemplates();
          for(var i=0;i<customs.length;i++)if(customs[i].id===t.id){customs[i].id=created.id;break}
          savePromptTemplates(customs);
          t.id=created.id;
        }
      });
  op.catch(function(){});
}
function _deleteTemplateOnServer(id){
  var apiFetch=(typeof window!=="undefined")&&window.apiFetch;
  if(typeof apiFetch!=="function"||!_isServerId(id))return;
  apiFetch("/api/prompts/"+encodeURIComponent(id),{method:"DELETE"}).catch(function(){});
}
