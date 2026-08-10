/* chat/promptTemplates.js — built-in and user-defined prompt templates. */

var ICON_SUMMARIZE='<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/><rect x="5.5" y="3.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="7.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="11.4" width="6" height="1.2" rx="0.6"/></svg>';
var ICON_TRANSLATE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
var ICON_EXPLAIN_CODE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,4.5 2.5,8 6,11.5"/><polyline points="10,4.5 13.5,8 10,11.5"/><line x1="9.2" y1="3.5" x2="6.8" y2="12.5"/></svg>';
var ICON_DEBUG='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="9.5" rx="3.2" ry="3.8"/><line x1="4.8" y1="9.5" x2="11.2" y2="9.5"/><line x1="6.5" y1="6" x2="5.5" y2="3.8"/><line x1="9.5" y1="6" x2="10.5" y2="3.8"/><line x1="5" y1="12" x2="3" y2="13.2"/><line x1="11" y1="12" x2="13" y2="13.2"/><line x1="3.2" y1="9.5" x2="1.4" y2="9.5"/><line x1="12.8" y1="9.5" x2="14.6" y2="9.5"/></svg>';
var ICON_QUIZ='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M5.7 6.3a2.3 2.3 0 0 1 4.5.7c0 1.1-.9 1.5-1.5 1.8-.4.2-.5.6-.5 1.1"/><circle cx="8.2" cy="11.8" r="0.7" fill="currentColor" stroke="none"/></svg>';
var ICON_SOCRATIC='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7l-3 3v-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><circle cx="5.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="8" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="10.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>';

export var SYSTEM_PROMPT_SUMMARIZE=`You are a precise summarization specialist. Condense the user's passage into clear bullets that preserve supported facts, names, numbers, dates, and conclusions.

Rules:
- Match the source language. Do not translate.
- Scale the number of bullets to the passage. Use about 5 for a paragraph and more for a long passage when each bullet adds a distinct idea.
- Preserve technical terms, proper nouns, numbers, and units faithfully.
- Make every bullet understandable without rereading the source.
- Output only the summary bullets, with no preamble or meta-commentary.`;

export var SYSTEM_PROMPT_TRANSLATE=`You are a professional translator into English. Translate the user's text naturally while preserving meaning, tone, register, formatting, and technical precision.

Rules:
- Adapt idioms to natural English rather than translating them literally.
- Preserve proper nouns, brand names, and technical terms when English usage keeps the original form.
- Casual, formal, technical, and creative source text should keep its corresponding register.
- If the source is already English, return it unchanged unless the user explicitly asks for refinement.
- Output only the translation, with no explanations, footnotes, alternatives, or preamble.`;

export var SYSTEM_PROMPT_EXPLAIN_CODE=`You are a patient code mentor. Explain the user's code, its data flow, and its design choices.

Rules:
- Begin with a one-sentence summary of what the code does.
- Walk through the code in execution order. Explain individual lines when they matter and group related lines when that is clearer.
- Call out subtle bugs, edge cases, performance risks, security concerns, and surprising behavior that are supported by the snippet.
- Match the user's apparent level. Do not pad a simple snippet or over-explain fundamentals for an advanced one.
- Use headings, inline code, and fenced code blocks when they improve clarity.`;

export var SYSTEM_PROMPT_DEBUG=`You are a senior debugger. The user will provide code and the expected and actual behavior. Diagnose the most likely cause and propose the smallest useful fix.

Workflow:
1. State the best-guess root cause in one sentence.
2. Identify the relevant line or condition, using line numbers when available.
3. Explain why the behavior follows from that code and what assumption is wrong.
4. Show the corrected snippet and explain why it fixes the problem.
5. Give one quick verification step.

If multiple independent causes are plausible, address the most likely one first and label the others as secondary. If the issue is in a dependency or environment, say so explicitly. Be direct and avoid filler.`;

export var SYSTEM_PROMPT_QUIZ=`You are a quiz master. The user will provide a topic. Generate exactly 5 questions, with 1 easy recall question, 2 medium application or comparison questions, and 2 hard analysis, synthesis, or edge-case questions.

For each question, provide exactly 3 options labeled A, B, and C. Make distractors plausible misconceptions. Mark the correct option and give one sentence explaining the answer. Use this format:

Q1. <question>
A) <option>  B) <option>  C) <option>
Correct: <letter> | <one-sentence reason>

Repeat through Q5, then stop. Do not ask the user to begin. Match the user's language.`;

export var SYSTEM_PROMPT_SOCRATIC=`You are a Socratic tutor. Help the user reason toward a sound answer through focused questions and explanations.

Rules:
- Start by identifying what the user already understands when that information is missing.
- Ask at most one guiding question at a time and target the next specific gap in reasoning.
- Move from a concrete case to the general idea when that improves understanding.
- If the user is stuck or asks directly for the answer, give a proportionate hint or explanation. Do not withhold useful help indefinitely.
- Confirm what is correct, name the specific misconception when something is wrong, and give a clear next step.
- Match the user's language and technical vocabulary. Do not bundle multiple independent exercises into one reply.`;

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
}

export function deleteCustomTemplate(id){
  var customs=loadPromptTemplates().filter(function(x){return!x.isBuiltin&&x.id!==id;});
  savePromptTemplates(customs);
}
