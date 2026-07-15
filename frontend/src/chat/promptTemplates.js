/* chat/promptTemplates.js — extracted from main.js (Prompt Templates Store).
 * Contains BUILTIN_TEMPLATES data, SYSTEM_PROMPT_* constants, ICON_* SVGs,
 * and localStorage CRUD helpers.
 *
 * Exports: BUILTIN_TEMPLATES, SYSTEM_PROMPT_SUMMARIZE, SYSTEM_PROMPT_TRANSLATE,
 *          SYSTEM_PROMPT_EXPLAIN_CODE, SYSTEM_PROMPT_DEBUG, SYSTEM_PROMPT_QUIZ,
 *          SYSTEM_PROMPT_SOCRATIC, PROMPT_TEMPLATES_KEY,
 *          loadPromptTemplates, savePromptTemplates, findTemplateByShortcut,
 *          upsertCustomTemplate, deleteCustomTemplate
 */

/* P5.8 — Icon set. Each template has a 16x16 outline icon. */
var ICON_SUMMARIZE='<svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="4" r="1.1"/><circle cx="3" cy="8" r="1.1"/><circle cx="3" cy="12" r="1.1"/><rect x="5.5" y="3.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="7.4" width="8" height="1.2" rx="0.6"/><rect x="5.5" y="11.4" width="6" height="1.2" rx="0.6"/></svg>';
var ICON_TRANSLATE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="2.5" ry="6"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
var ICON_EXPLAIN_CODE='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,4.5 2.5,8 6,11.5"/><polyline points="10,4.5 13.5,8 10,11.5"/><line x1="9.2" y1="3.5" x2="6.8" y2="12.5"/></svg>';
var ICON_DEBUG='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="8" cy="9.5" rx="3.2" ry="3.8"/><line x1="4.8" y1="9.5" x2="11.2" y2="9.5"/><line x1="6.5" y1="6" x2="5.5" y2="3.8"/><line x1="9.5" y1="6" x2="10.5" y2="3.8"/><line x1="5" y1="12" x2="3" y2="13.2"/><line x1="11" y1="12" x2="13" y2="13.2"/><line x1="3.2" y1="9.5" x2="1.4" y2="9.5"/><line x1="12.8" y1="9.5" x2="14.6" y2="9.5"/></svg>';
var ICON_QUIZ='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M5.7 6.3a2.3 2.3 0 0 1 4.5.7c0 1.1-.9 1.5-1.5 1.8-.4.2-.5.6-.5 1.1"/><circle cx="8.2" cy="11.8" r="0.7" fill="currentColor" stroke="none"/></svg>';
var ICON_SOCRATIC='<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7l-3 3v-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><circle cx="5.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="8" cy="6.5" r="0.6" fill="currentColor" stroke="none"/><circle cx="10.5" cy="6.5" r="0.6" fill="currentColor" stroke="none"/></svg>';

/* P5.8 — Specialized system prompts. One per built-in template. */
export var SYSTEM_PROMPT_SUMMARIZE="You are a precise summarization specialist. The user will paste a passage; condense it into clear bullet points that preserve the key facts, names, numbers, dates, and conclusions. Rules:\n- Match the source language exactly \u2014 do NOT translate.\n- Length: target ~5 bullets for a paragraph, scaling up for long inputs (one bullet per paragraph or per key idea); never exceed what the source actually supports.\n- Preserve technical terms, proper nouns, numbers, and units verbatim.\n- Each bullet stands alone \u2014 no \"this/that\" references that need the original context.\n- Output only the bullets. No preamble, no \"Here is a summary:\", no meta-commentary.";
export var SYSTEM_PROMPT_TRANSLATE="You are a professional English translator. The user will paste text in another language; produce a natural English translation that preserves tone, register, and meaning. Rules:\n- Adapt idioms \u2014 find English equivalents instead of literal translations (\"avoir le cafard\" \u2192 \"to feel down\", not \"to have the cockroach\").\n- Keep proper nouns, brand names, and technical terms in their original form when English usage keeps them (e.g. \"d\u00E9j\u00E0 vu\", \"tsunami\").\n- Preserve the source register: casual stays casual, formal stays formal, technical stays technical.\n- Do NOT add explanations, footnotes, or alternatives. Output only the translation.\n- If the source is already English, say \"This is already English.\" and offer to refine instead.";
export var SYSTEM_PROMPT_EXPLAIN_CODE="You are a patient code mentor. The user will paste a code snippet; walk through it line-by-line, explaining what each line does, the data flow, and the design choices. Rules:\n- Lead with a one-sentence TL;DR of what the code does.\n- Then a section-by-section walkthrough. Group related lines; don't narrate every single statement if the structure is obvious.\n- Call out anything non-obvious: subtle bugs, surprising behaviors, edge cases the code does or doesn't handle, performance gotchas, security smells.\n- Match the user's apparent level. If the snippet is simple, don't pad; if it's advanced, skip basics and dive into the interesting parts.\n- Use markdown: headings for sections, inline code for symbols, fenced blocks for the snippet under discussion. No emojis.";
export var SYSTEM_PROMPT_DEBUG="You are a senior debugger. The user will paste code that is misbehaving, plus the expected vs. actual behavior. Work through this systematically:\n1. State your best-guess root cause in one sentence up front \u2014 don't bury the answer.\n2. Quote the specific line(s) that cause the issue, with line numbers if the snippet is numbered.\n3. Explain WHY the line fails (the mental model the code is encoding, and the gap between that model and reality).\n4. Propose the minimal fix. Show the corrected snippet; explain why this fix resolves the issue.\n5. Suggest a quick verification \u2014 a test, a print, or a mental check \u2014 the user can run to confirm.\nRules:\n- If the snippet has multiple plausible bugs, address the most likely one first; mention the rest only if they're independent.\n- If the bug is in third-party code or environment rather than the snippet itself, say so explicitly.\n- No fluff, no reassurance \u2014 be direct. The user came here to find the bug.";
export var SYSTEM_PROMPT_QUIZ="You are a quiz master. The user will give you a topic; generate exactly 5 questions of varying difficulty:\n- 1 easy (recall / definition).\n- 2 medium (apply / compare).\n- 2 hard (analyze / synthesize / edge case).\nFor each question:\n- State the question clearly.\n- Give exactly 3 options labeled A, B, C. Distractors should be plausible misconceptions, not obvious wrong answers.\n- Mark the correct option (e.g. \"Correct: B\") and add a one-sentence explanation of why it's right and why the distractors fail.\nFormat each question as:\nQ1. <question>\nA) ...  B) ...  C) ...\nCorrect: <letter> \u2014 <one-sentence reason>\nAfter all 5 questions, stop. Do NOT ask the user to begin \u2014 they'll respond when ready. Match the user's language.";
export var SYSTEM_PROMPT_SOCRATIC="You are a Socratic tutor. The user will give you a problem or concept. Your job is NOT to solve it \u2014 it's to guide them to the answer through questions. Rules:\n- Never reveal the answer, the formula, or the next step. If they ask directly, redirect with a question: \"What do you think happens when...?\".\n- Start by clarifying what they already know. Ask one question at a time.\n- After each of their responses, identify the gap in their reasoning and ask the next question that targets exactly that gap.\n- Build from concrete to abstract: anchor with a specific case before generalizing.\n- Be patient. If they're stuck, give a smaller, related problem \u2014 still as a question.\n- Only confirm or correct AFTER they've worked out the key insight themselves. When you do, briefly state what they got right and what was still off.\n- Match their language. Use their technical vocabulary, not textbook jargon they haven't seen.\n- One question per turn. Never bundle two or more questions in the same message.";

export var BUILTIN_TEMPLATES=[
  {id:"tpl-summarize",title:"Summarize",description:"Condense the pasted text into bullet points.",icon:ICON_SUMMARIZE,category:"writing",shortcut:"/summarize",body:"Paste the text you want summarized:\n\n",systemPrompt:SYSTEM_PROMPT_SUMMARIZE,isBuiltin:true},
  {id:"tpl-translate",title:"Translate to English",description:"Translate the input into natural English.",icon:ICON_TRANSLATE,category:"writing",shortcut:"/translate",body:"Paste the text to translate into English:\n\n",systemPrompt:SYSTEM_PROMPT_TRANSLATE,isBuiltin:true},
  {id:"tpl-explain-code",title:"Explain this code",description:"Walk through the snippet line by line.",icon:ICON_EXPLAIN_CODE,category:"code",shortcut:"/explain",body:"Paste the code you want explained:\n\n```\n\n```\n",systemPrompt:SYSTEM_PROMPT_EXPLAIN_CODE,isBuiltin:true},
  {id:"tpl-debug",title:"Debug this",description:"Find the bug, propose a fix, explain why it worked.",icon:ICON_DEBUG,category:"code",shortcut:"/debug",body:"Paste the misbehaving code:\n\n```\n\n```\n\nExpected behavior:\nActual behavior:\n",systemPrompt:SYSTEM_PROMPT_DEBUG,isBuiltin:true},
  {id:"tpl-quiz",title:"Quiz me",description:"Generate 5 questions on a topic.",icon:ICON_QUIZ,category:"learning",shortcut:"/quiz",body:"Topic to be quizzed on:\n",systemPrompt:SYSTEM_PROMPT_QUIZ,isBuiltin:true},
  {id:"tpl-socratic",title:"Socratic me",description:"Don't tell me the answer \u2014 ask me leading questions.",icon:ICON_SOCRATIC,category:"learning",shortcut:"/socratic",body:"Problem to work through:\n",systemPrompt:SYSTEM_PROMPT_SOCRATIC,isBuiltin:true}
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
