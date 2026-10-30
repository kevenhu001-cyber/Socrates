import { apiFetch } from '../util/api.ts';
import { hasUsableActive } from '../config/providers.ts';
import { stateStore } from '../state/store.ts';
import { stripHtmlTags } from '../util/stripHtml.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';

/* Generate a declarative session title based on the user's first input.
   Called fire-and-forget on first save. A short cooldown prevents repeated
   saves from amplifying a 429 while still allowing a later retry.
   Uses the user's initial topic as context. */
let _titleGenQueued = false;
let _titleGenSession: string | null = null;
let _titleGenRetryAfter = 0;
let _titleFallbackSession: string | null = null;
let _titleFallbackValue: string | null = null;

/** A cheap local fallback so every session gets a short title even when the
 *  provider is unavailable. Keeps Chinese under ~8 chars and English under
 *  ~6 words so the Recents row never wraps. */
function cleanTitle(value: unknown): string {
  /* Model chatter is stripped in two stages: the tagged wrappers first, then
     any markup left over — stripHtmlTags repeats its pass, because a single
     one over `<<script>` leaves a live `<script` behind. */
  const text = String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, '')
    .replace(/<\|[a-z_]+\|>/gi, '')
    .replace(/<\/?s>/g, '')
    .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g, '');
  return stripHtmlTags(text)
    .replace(/^\s*(?:Title|标题)\s*[:：-]\s*/i, '')
    .trim()
    .replace(/^[\s\-•·—:"'\u201c\u201d\u2018\u2019「」『』]+|[\s\-•·—:"'\u201c\u201d\u2018\u2019「」『』]+$/g, '');
}

function compactTitle(value: unknown): string {
  const clean=cleanTitle(value);
  if(!clean)return "";
  const isZh=/[\u3400-\u9fff]/.test(clean);
  let sentence=clean.split(isZh ? /[。！？!?;\n]/ : /[.!?\n]/)[0].trim();
  if(!sentence)sentence=clean;
  if(isZh)return Array.from(sentence).slice(0,8).join("").replace(/[\s，。！？；：、]+$/g,"");
  return sentence.split(/\s+/).slice(0,6).join(" ").replace(/[\s.,;:!?]+$/g,"");
}

export function fallbackTitle(topic: unknown): string {
  return compactTitle(topic);
}

export function normalizeSessionTitle(value: unknown): string {
  return compactTitle(value);
}

interface TitleGenerationContext {
  sessionId: string;
  topic: string;
  currentTitle: string;
}

function getTitleGenerationContext(): TitleGenerationContext | null {
  const sessionId = stateStore.read("currentSessionId") as string;
  const topic = (stateStore.read("topic") || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
  if (!sessionId || !topic) return null;
  const currentTitle = (stateStore.read("sessionTitle") as string) || "";
  const ownsFallback = _titleFallbackSession === sessionId && currentTitle === _titleFallbackValue;
  if (currentTitle && !ownsFallback) return null;
  if (_titleGenQueued && _titleGenSession === sessionId) return null;
  /* P_title-429 — background title generation must not turn repeated saves
     into a request storm after a rate-limit response. */
  if (_titleGenSession === sessionId && Date.now() < _titleGenRetryAfter) return null;
  return { sessionId, topic, currentTitle };
}

function seedFallbackTitle(context: TitleGenerationContext): void {
  const fallback = fallbackTitle(context.topic);
  if (context.currentTitle || !fallback) return;
  stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: fallback });
  _titleFallbackSession = context.sessionId;
  _titleFallbackValue = fallback;
}

function titleUsesChinese(topic: string): boolean {
  if (/[\u4e00-\u9fff]/.test(topic)) return true;
  if (/[A-Za-z]/.test(topic)) return false;
  return getCurrentLanguage() === "zh";
}

function createTitlePrompt(topic: string): { prompt: string; sysContent: string } {
  if (titleUsesChinese(topic)) {
    return {
      prompt: "基于用户的第一条消息，生成一个简短的中文陈述式标题（3-8个字），"+
        "概括会话内容。示例：「探索量子计算」、「理解机器学习基础」、「学会更优写作」。\n"+
        "不要使用问句或标签 — 必须是一个陈述。只输出标题本身，不要引号，不要多余文字。\n\n"+
        topic.slice(0, 300),
      sysContent: "不要输出<think>思考块、内部推理或思维链。直接输出最终的标题，纯文字，无前缀。",
    };
  }
  return {
    prompt: "Based on the user's first message below, generate a SHORT "+
      "declarative title (3-8 words) in a statement tone that names what the "+
      "session is about. Examples: \"Exploring quantum computing\", "+
      "\"Understanding machine learning basics\", \"Writing better essays\". "+
      "Do NOT use a question or a label — it must read as a statement. "+
      "Output ONLY the title, no quotes, no extra text.\n\n"+topic.slice(0,300),
    sysContent: "Do NOT output <think>...</think> blocks, internal reasoning, or chain-of-thought. Reply directly with the final title in clean prose. No preamble.",
  };
}

interface TitleGenerationResponse {
  content?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
}

function responseTitle(response: TitleGenerationResponse | null | undefined): unknown {
  if (response && typeof response.content === 'string') return response.content;
  return response?.choices?.[0]?.message?.content || '';
}

function canAdoptGeneratedTitle(sessionId: string): boolean {
  const latestTitle = (stateStore.read('sessionTitle') as string) || '';
  const ownsFallback = _titleFallbackSession === sessionId && latestTitle === _titleFallbackValue;
  return !latestTitle || ownsFallback;
}

function saveGeneratedTitle(title: string, sessionId: string): void {
  stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: title });
  if (_titleFallbackSession === sessionId) {
    _titleFallbackSession = null;
    _titleFallbackValue = null;
  }
  _titleGenRetryAfter = 0;
  const win = window as { saveCurrentSession?: () => void };
  if (typeof win.saveCurrentSession === 'function') win.saveCurrentSession();
}

function handleGeneratedTitle(response: TitleGenerationResponse | null | undefined, sessionId: string): void {
  if (_titleGenSession === sessionId) _titleGenQueued = false;
  if (stateStore.read('currentSessionId') !== sessionId) return;
  const raw = responseTitle(response);
  if (!raw || !canAdoptGeneratedTitle(sessionId)) return;
  const title = normalizeSessionTitle(raw);
  if (title.length <= 2) return;
  /* P_title-save-race — the active-session check prevents an old response
     from saving its title after the user switches sessions. */
  saveGeneratedTitle(title, sessionId);
}

function handleTitleGenerationFailure(error: unknown, sessionId: string): void {
  if (_titleGenSession === sessionId) _titleGenQueued = false;
  /* P_title-quiet — 401 and 429 are already surfaced by the main turn. */
  const status = (error as { status?: number })?.status;
  if (status === 429) {
    if (_titleGenSession === sessionId) _titleGenRetryAfter = Date.now() + 5 * 60 * 1000;
    return;
  }
  if (status === 401) return;
  console.log('[title gen] failed');
}

export function generateSessionTitle(): void {
  const context = getTitleGenerationContext();
  if (!context) return;
  const { sessionId, topic } = context;
  seedFallbackTitle(context);
  if(!hasUsableActive())return;
  _titleGenQueued=true;
  _titleGenSession=sessionId;
  _titleGenRetryAfter=Date.now()+30000;
  /* Title language follows the language the user actually wrote the
     topic in; the UI preference is only a fallback when the topic
     carries no detectable language signal. */
  const { prompt, sysContent } = createTitlePrompt(topic);
  const msgs2 = [
    { role: "system", content: sysContent },
    { role: "user", content: prompt },
  ] as const;
  /* Background-only call: never trigger the global 401 → auth-gate flow.
     A title request that races a real session expiry (or a rate limit)
     must fail silently — the main chat turn already owns the user-visible
     429 toast / sign-in gate, and a duplicate handleAuthExpired from here
     would re-enter the gate + abort the stream a second time. */
  apiFetch<TitleGenerationResponse>("/api/chat", {
    method: "POST",
    _authEndpoint: true,
    body: { messages: msgs2, temperature: 0.3, max_tokens: 30, mode: "chat" },
  }).then((response) => handleGeneratedTitle(response, sessionId))
    .catch((error: unknown) => handleTitleGenerationFailure(error, sessionId));
}
