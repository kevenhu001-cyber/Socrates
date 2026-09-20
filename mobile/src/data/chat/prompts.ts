import { getItem, setItem } from '../../platform/secureStorage';
import { toneVoiceSuffix, type TonePreset } from './tonePresets';
export type MobileExtensionKey = 'write' | 'explore' | 'analyze';
export type MobileOutputMode = 'chat' | 'canvas';

export interface MobileExtensionSpec {
  key: MobileExtensionKey;
  label: string;
  systemPrompt: string;
  outputMode: MobileOutputMode;
}

export const HIGH_EFFORT_OUTPUT_GUIDANCE = `This is high reasoning-effort mode. For substantive questions, prioritize depth, completeness, and intellectual clarity over brevity. Give a very detailed, self-contained answer. Establish relevant context, define important terms, make assumptions explicit, develop the reasoning carefully, work through concrete examples and important edge cases, compare credible alternatives when useful, and state the conclusion and practical implications clearly. Do not omit meaningful intermediate reasoning merely to keep the answer short. Match depth to the task: a simple factual request may remain brief, but a complex, technical, analytical, or high-stakes request should receive a thorough treatment. 高思考强度下，回答应更充分、更深入，但语言、排版与安全规范仍以服务端全局策略为准。`;

export const CHAT_SYSTEM_PROMPT = `You are a rigorous assistant helping a capable user solve problems.

${HIGH_EFFORT_OUTPUT_GUIDANCE}

Identify decisive assumptions and constraints, connect causes to effects, test important edge cases, and consider credible alternatives. Explain the reasoning, evidence, and qualifications needed to make the result understandable and verifiable. Challenge a false premise politely rather than building on it.`;

export const CHAT_CONCISE_PROMPT = `You are a concise, reliable assistant. Answer as briefly as the question permits. Cut filler, redundant framing, and meta-commentary, but do not remove assumptions, qualifications, or verification details that make a complex or high-stakes answer correct and auditable. Choose the clearest format for the task. The server policy is authoritative for language, safety, tools, and formatting.`;

export const WRITE_EDIT_SYSTEM_PROMPT =
  'You are an expert writing and editing assistant. Help the user compose, rewrite, or polish any text — essays, emails, posts, reports, documentation, scripts, or creative writing.\n\n' +
  'Workflow:\n' +
  '- If the request is clear, produce the writing directly.\n' +
  '- If a key detail is missing (audience, tone, length, format, or language), ask at most 2 focused questions first; otherwise proceed with sensible defaults.\n' +
  '- When editing text the user supplied, preserve their voice and intent. Return the revised version, and add a short bullet summary of substantive changes only when the edits are non-obvious or the user asked.\n\n' +
  'Tools:\n' +
  '- When native web_search is supplied, you may call it to verify facts, gather current information, or find references when the writing depends on real-world accuracy. Cite sources briefly only when a search actually succeeds.\n\n' +
  'Output rules:\n' +
  '- Always match the user\'s language.\n' +
  '- Use Markdown for structure (headings, lists, short paragraphs) when the piece is long.\n' +
  '- Return the requested writing with minimal framing — no \'Here is your text:\' preambles.';

export const EXPLORE_SYSTEM_PROMPT =
  'You are running the Explore workflow — a staged research system that turns an open question into a polished deliverable.\n\n' +
  'Stage 1 — Scope. In one short paragraph, restate the question precisely, list the 3-6 sub-questions that must be answered to cover it, and name the deliverable you will produce.\n\n' +
  'Stage 2 — Search. When native web_search is supplied, use targeted queries for each sub-question, vary keywords, and include the current year for anything time-sensitive. Do not use one broad query for everything. Prefer primary sources and seek independent corroboration for each load-bearing claim. If the tool is unavailable, state that live verification was not performed.\n\n' +
  'Stage 3 — Integrate. Reconcile the evidence: note where sources disagree, separate verified fact from inference, and discard anything that cannot be attributed to a source.\n\n' +
  'Stage 4 — Deliver. Produce a structured report with a title, short executive summary, one section per sub-question, a \'What remains uncertain\' section, and a sources list. If the user asked for a downloadable document and code_interpreter is supplied, use it to render the report and expose the artifact. Otherwise deliver the report directly in the chat and do not claim that a file was created.\n\n' +
  'Rules: never invent citations. If the topic genuinely needs more than about 10 searches, say so and propose splitting it. Keep intermediate commentary minimal — the report is the product.';

export const DATA_ANALYSIS_SYSTEM_PROMPT =
  'You are in data-analysis mode. Treat attached files and pasted data as the working dataset.\n\n' +
  'Workflow:\n' +
  '1. Inspect schema, units, missing values, duplicates, and sampling limitations before drawing conclusions.\n' +
  '2. State the analysis question and choose the smallest valid method.\n' +
  '3. When the native tools are supplied, use code_interpreter for non-trivial calculation, file analysis, or export, and use render_visualization for a reader-facing chart after the numbers are validated. Otherwise explain the limitation and continue without claiming that a tool ran.\n' +
  '4. Report the result, assumptions, checks, and material caveats. Include reproducible calculations and expose generated files as artifacts.\n\n' +
  'Never claim a computation ran unless a tool result confirms it. Do not infer columns or units that are not present.';

export const MOBILE_EXTENSIONS: Record<MobileExtensionKey, MobileExtensionSpec> = {
  write: { key: 'write', label: 'Write & edit', systemPrompt: WRITE_EDIT_SYSTEM_PROMPT, outputMode: 'canvas' },
  explore: { key: 'explore', label: 'Explore', systemPrompt: EXPLORE_SYSTEM_PROMPT, outputMode: 'chat' },
  analyze: { key: 'analyze', label: 'Analyze data', systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT, outputMode: 'chat' },
};

/* ── Prompt templates (slash commands) ────────────────────────────────
 * Port of frontend/src/chat/promptTemplates.js. The web home/chat
 * composers open a slash-command palette when the draft starts with `/`;
 * picking a row replaces the `/query` chunk with the template body and
 * activates the template's systemPrompt for the session. Custom
 * (user-defined) templates persist under the same localStorage key as the
 * web (`socrates-prompt-templates`), so Expo Web shares the store and
 * native keeps its own copy via SecureStore. `icon` is an Ionicons name
 * for built-ins; custom templates may carry any short glyph the user
 * types (emoji or 1-2 characters), rendered as text. */
export interface MobilePromptTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  shortcut: string;
  body: string;
  systemPrompt: string;
  /** Web `category` — shown as a hint in the skills manager. */
  category?: string;
  isBuiltin?: boolean;
}

const TPL_PROMPT_SUMMARIZE = `You are a precise summarization specialist. Condense the user's passage into clear bullets that preserve supported facts, names, numbers, dates, and conclusions.

Rules:
- Match the source language. Do not translate.
- Scale the number of bullets to the passage. Use about 5 for a paragraph and more for a long passage when each bullet adds a distinct idea.
- Preserve technical terms, proper nouns, numbers, and units faithfully.
- Make every bullet understandable without rereading the source.
- Output only the summary bullets, with no preamble or meta-commentary.`;

const TPL_PROMPT_TRANSLATE = `You are a professional translator into English. Translate the user's text naturally while preserving meaning, tone, register, formatting, and technical precision.

Rules:
- Adapt idioms to natural English rather than translating them literally.
- Preserve proper nouns, brand names, and technical terms when English usage keeps the original form.
- Casual, formal, technical, and creative source text should keep its corresponding register.
- If the source is already English, return it unchanged unless the user explicitly asks for refinement.
- Output only the translation, with no explanations, footnotes, alternatives, or preamble.`;

const TPL_PROMPT_EXPLAIN_CODE = `You are a patient code mentor. Explain the user's code, its data flow, and its design choices.

Rules:
- Begin with a one-sentence summary of what the code does.
- Walk through the code in execution order. Explain individual lines when they matter and group related lines when that is clearer.
- Call out subtle bugs, edge cases, performance risks, security concerns, and surprising behavior that are supported by the snippet.
- Match the user's apparent level. Do not pad a simple snippet or over-explain fundamentals for an advanced one.
- Use headings, inline code, and fenced code blocks when they improve clarity.`;

const TPL_PROMPT_DEBUG = `You are a senior debugger. The user will provide code and the expected and actual behavior. Diagnose the most likely cause and propose the smallest useful fix.

Workflow:
1. State the best-guess root cause in one sentence.
2. Identify the relevant line or condition, using line numbers when available.
3. Explain why the behavior follows from that code and what assumption is wrong.
4. Show the corrected snippet and explain why it fixes the problem.
5. Give one quick verification step.

If multiple independent causes are plausible, address the most likely one first and label the others as secondary. If the issue is in a dependency or environment, say so explicitly. Be direct and avoid filler.`;

const TPL_PROMPT_QUIZ = `You are a quiz master. The user will provide a topic. Generate exactly 5 questions, with 1 easy recall question, 2 medium application or comparison questions, and 2 hard analysis, synthesis, or edge-case questions.

For each question, provide exactly 3 options labeled A, B, and C. Make distractors plausible misconceptions. Mark the correct option and give one sentence explaining the answer. Use this format:

Q1. <question>
A) <option>  B) <option>  C) <option>
Correct: <letter> | <one-sentence reason>

Repeat through Q5, then stop. Do not ask the user to begin. Match the user's language.`;

const TPL_PROMPT_SOCRATIC = `You are a Socratic tutor. Help the user reason toward a sound answer through focused questions and explanations.

Rules:
- Start by identifying what the user already understands when that information is missing.
- Ask at most one guiding question at a time and target the next specific gap in reasoning.
- Move from a concrete case to the general idea when that improves understanding.
- If the user is stuck or asks directly for the answer, give a proportionate hint or explanation. Do not withhold useful help indefinitely.
- Confirm what is correct, name the specific misconception when something is wrong, and give a clear next step.
- Match the user's language and technical vocabulary. Do not bundle multiple independent exercises into one reply.`;

export const MOBILE_PROMPT_TEMPLATES: MobilePromptTemplate[] = [
  { id: 'tpl-summarize', title: 'Summarize', description: 'Condense the pasted text into bullet points.', icon: 'list', category: 'writing', shortcut: '/summarize', body: 'Paste the text you want summarized:\n\n', systemPrompt: TPL_PROMPT_SUMMARIZE, isBuiltin: true },
  { id: 'tpl-translate', title: 'Translate to English', description: 'Translate the input into natural English.', icon: 'globe-outline', category: 'writing', shortcut: '/translate', body: 'Paste the text to translate into English:\n\n', systemPrompt: TPL_PROMPT_TRANSLATE, isBuiltin: true },
  { id: 'tpl-explain-code', title: 'Explain this code', description: 'Walk through the snippet in execution order.', icon: 'code-slash', category: 'code', shortcut: '/explain', body: 'Paste the code you want explained:\n\n```\n\n```\n', systemPrompt: TPL_PROMPT_EXPLAIN_CODE, isBuiltin: true },
  { id: 'tpl-debug', title: 'Debug this', description: 'Find the bug, propose a fix, explain why it worked.', icon: 'bug-outline', category: 'code', shortcut: '/debug', body: 'Paste the misbehaving code:\n\n```\n\n```\n\nExpected behavior:\nActual behavior:\n', systemPrompt: TPL_PROMPT_DEBUG, isBuiltin: true },
  { id: 'tpl-quiz', title: 'Quiz me', description: 'Generate 5 questions on a topic.', icon: 'help-circle-outline', category: 'learning', shortcut: '/quiz', body: 'Topic to be quizzed on:\n', systemPrompt: TPL_PROMPT_QUIZ, isBuiltin: true },
  { id: 'tpl-socratic', title: 'Socratic me', description: 'Work toward the answer through focused questions.', icon: 'chatbox-ellipses-outline', category: 'learning', shortcut: '/socratic', body: 'Problem to work through:\n', systemPrompt: TPL_PROMPT_SOCRATIC, isBuiltin: true },
];

/* Port of templateSlash.js `_currentSlashQuery`: null unless the draft
 * starts with `/`; otherwise the `/query` chunk plus the tail the user
 * may have typed after the first whitespace (kept on insert). */
export function parseSlashQuery(value: string): { query: string; tail: string } | null {
  if (!value || value.charAt(0) !== '/') return null;
  let i = 1;
  while (i < value.length && !/\s/.test(value.charAt(i))) i += 1;
  return { query: value.slice(1, i).toLowerCase(), tail: value.slice(i) };
}

/* ── Custom template store ─────────────────────────────────────────────
 * Mirrors the web `loadPromptTemplates`/`savePromptTemplates`/`upsert`/
 * `delete` helpers over the same storage key. Kept as a synchronous cache
 * (like `data/preferences.ts`) so the slash palette and skills manager
 * read merged templates without awaiting; `hydratePromptTemplates` runs
 * once at app start and every mutation re-hydrates + notifies. */
const PROMPT_TEMPLATES_KEY = 'socrates-prompt-templates';
const templateListeners = new Set<() => void>();
let customCache: MobilePromptTemplate[] = [];
let mergedCache: MobilePromptTemplate[] = [...MOBILE_PROMPT_TEMPLATES];

function mergeTemplates(customs: MobilePromptTemplate[]): MobilePromptTemplate[] {
  /* Web `loadPromptTemplates`: key by shortcut — a custom row overrides a
   * built-in on collision — then sort by title. */
  const byShortcut = new Map<string, MobilePromptTemplate>();
  MOBILE_PROMPT_TEMPLATES.forEach((template) => byShortcut.set(template.shortcut, template));
  customs.forEach((template) => {
    if (template && template.shortcut) byShortcut.set(template.shortcut, { ...template, isBuiltin: false });
  });
  return [...byShortcut.values()].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

function notifyTemplates() {
  templateListeners.forEach((listener) => listener());
}

/** All templates — built-ins merged with customs, sorted by title. */
export function getPromptTemplates(): MobilePromptTemplate[] {
  return mergedCache;
}

/** Only the user-created rows (for the skills manager). */
export function getCustomTemplates(): MobilePromptTemplate[] {
  return customCache;
}

export function subscribePromptTemplates(listener: () => void) {
  templateListeners.add(listener);
  return () => templateListeners.delete(listener);
}

/** Hydrate the custom-template cache from storage. Call once at startup. */
export async function hydratePromptTemplates(): Promise<void> {
  let customs: MobilePromptTemplate[] = [];
  try {
    const raw = await getItem(PROMPT_TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      customs = parsed.filter(
        (item): item is MobilePromptTemplate =>
          Boolean(item) && typeof item === 'object' && typeof (item as MobilePromptTemplate).shortcut === 'string',
      );
    }
  } catch {
    customs = [];
  }
  customCache = customs;
  mergedCache = mergeTemplates(customCache);
  notifyTemplates();
}

async function persistCustoms(next: MobilePromptTemplate[]): Promise<void> {
  customCache = next.filter((template) => template && !template.isBuiltin);
  mergedCache = mergeTemplates(customCache);
  notifyTemplates();
  try {
    await setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(customCache));
  } catch {
    /* best effort — the in-memory value still applies for this session */
  }
}

export function findTemplateByShortcut(shortcut: string): MobilePromptTemplate | null {
  if (!shortcut) return null;
  return mergedCache.find((template) => template.shortcut === shortcut) ?? null;
}

export async function upsertCustomTemplate(template: MobilePromptTemplate): Promise<void> {
  const next = { ...template, isBuiltin: false };
  const customs = [...customCache];
  const index = customs.findIndex((existing) => existing.id === template.id);
  if (index >= 0) customs[index] = next;
  else customs.push(next);
  await persistCustoms(customs);
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  await persistCustoms(customCache.filter((template) => template.id !== id));
}

/* Web `onPromptTemplateEditorSave` validation, kept pure so the screen and
 * tests share it: title required, shortcut `/^\/[a-z0-9-]+$/`, unique
 * across built-ins and other customs. */
export function validateCustomTemplate(
  template: Pick<MobilePromptTemplate, 'title' | 'shortcut'> & { id?: string },
): 'ok' | 'title-required' | 'shortcut-invalid' | 'shortcut-taken' {
  if (!template.title.trim()) return 'title-required';
  if (!/^\/[a-z0-9-]+$/.test(template.shortcut.trim())) return 'shortcut-invalid';
  const existing = findTemplateByShortcut(template.shortcut.trim());
  if (existing && existing.id !== template.id) return 'shortcut-taken';
  return 'ok';
}

/* Port of `_filterSlashList`: substring match on shortcut/title/
 * description over the merged template list. Mobile has no connected-apps
 * list, so templates only. */
export function filterPromptTemplates(query: string): MobilePromptTemplate[] {
  const list = [...mergedCache].sort((a, b) => a.title.localeCompare(b.title));
  if (!query) return list;
  return list.filter((tpl) =>
    tpl.shortcut.toLowerCase().includes(query)
    || tpl.title.toLowerCase().includes(query)
    || tpl.description.toLowerCase().includes(query));
}

/* Port of templateSlash.js `stripTemplateBodyPrefix`: while a template is
 * active its `body` sits in the composer as a placeholder, but the model
 * (and the stored user turn) should only see what the user actually typed.
 * Matches the largest surviving body prefix, so a partially-deleted
 * placeholder still strips cleanly. */
export function stripTemplateBodyPrefix(text: string, template: MobilePromptTemplate | null): string {
  if (!template || !template.body) return text;
  const body = template.body.replace(/\s+$/, '');
  if (!body) return text;
  let i = 0;
  while (i < body.length && i < text.length && text.charAt(i) === body.charAt(i)) i += 1;
  if (i === 0) return text;
  return text.slice(i).replace(/^\s+/, '');
}

export function detectLanguage(text: string): 'zh' | 'ja' | 'ko' | 'ru' | 'ar' | 'en' {
  if (!text) return 'en';
  let run = 0;
  let best = 0;
  for (const char of text) {
    if (/[一-鿿㐀-䶿]/.test(char)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (best >= 2) return 'zh';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  return 'en';
}

/* Mobile port of frontend/src/chat/lang.ts. The server still owns global
 * safety/style; this is only the client-local response-language directive. */
export function languageDirectiveFor(text: string): string {
  const value = String(text || '').trim();
  if (value.length >= 2) {
    if (/^(https?:\/\/|www\.|[\/\\][\w\-./\\]+\.\w{1,5}$)/i.test(value)) return '';
    if (/^(function\s|class\s|def\s|import\s|const\s|let\s|var\s|#include|<\?xml|<!DOCTYPE)/i.test(value)) return '';
  }
  switch (detectLanguage(value)) {
    case 'zh':
      return '\n\n## 语言指令（最高优先级）— 严格使用中文，禁止中英混用\n\n你必须使用中文回答用户。回复中的标题、段落、列表项和标签都应使用中文。编程代码、数学符号、已成型技术专名（API、HTTP、JSON、SQL、CPU、GPU、URL、HTML）以及用户直接提供的英文原文可以保留。技术术语首次出现时优先使用中文并可在括号中附注英文原词。';
    case 'ja':
      return '\n\n## 言語指令（最優先）— 日本語のみ、混在禁止\n\n回答は日本語で記述してください。コード、数式、確立した技術用語、ユーザー指定の引用文は原文のまま保持できます。';
    case 'ko':
      return '\n\n## 언어 지시 (최우선) — 한국어 전용, 혼용 금지\n\n모든 응답은 한국어로 작성하십시오. 코드, 수학 기호, 확립된 기술 용어, 사용자가 제공한 인용문은 원문으로 유지할 수 있습니다.';
    case 'ru':
      return '\n\n## ЯЗЫКОВАЯ ИНСТРУКЦИЯ — только русский\n\nОтвечайте по-русски. Код, математические символы, устоявшиеся технические термины и пользовательские цитаты могут оставаться в оригинале.';
    case 'ar':
      return '\n\n## تعليمات اللغة — العربية فقط\n\nأجب بالعربية. يمكن إبقاء الشفرة البرمجية والرموز الرياضية والمصطلحات التقنية الراسخة واقتباسات المستخدم كما هي.';
    default:
      return '';
  }
}

export function buildAssistantModeInstruction(
  userText: string,
  effort: 'low' | 'medium' | 'high',
  tone: TonePreset = 'default',
): string {
  const thinkingSuffix = effort === 'high'
    ? '\n\nKeep the user-facing reply focused on the answer. Do not emit <think> blocks or reasoning_content in the user-facing message.'
    : '';
  return `[Assistant mode instructions]\n${languageDirectiveFor(userText)}${effort === 'high' ? CHAT_SYSTEM_PROMPT : CHAT_CONCISE_PROMPT}${toneVoiceSuffix(tone)}${thinkingSuffix}`;
}
