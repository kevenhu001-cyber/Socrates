// chat/sessionTitle.ts — Fire-and-forget session title generation.
// Uses the server proxy (/api/chat) for all providers, including Beagle.

import { apiFetch } from '../util/api.js';
import { hasUsableActive } from '../config/providers.js';

function getState(): Record<string, unknown> { return (window as any).state; }

/* Generate a declarative session title based on the user's first input.
   Called fire-and-forget on first save; retries once if the API call
   fails so a transient network glitch doesn't leave the session untitled.
   Uses getState().topic (the user's initial topic) as context. */
let _titleGenQueued = false;
export function generateSessionTitle(): void {
  if (!hasUsableActive() || _titleGenQueued || getState().sessionTitle) return;
  const topic = ((getState().topic as string) || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/gi, "").trim();
  if (!topic) return;
  _titleGenQueued = true;
  /* Detect user language from UI preference and topic content. */
  const isZh = typeof (window as any)._currentLang !== "undefined"
    ? (window as any)._currentLang === "zh"
    : /[\u4e00-\u9fff]/.test(topic);
  let prompt: string, sysContent: string;
  if (isZh) {
    prompt = "基于用户的第一条消息，生成一个简短的中文陈述式标题（3-8个字），" +
      "概括会话内容。示例：「探索量子计算」、「理解机器学习基础」、「学会更优写作」。\n" +
      "不要使用问句或标签 — 必须是一个陈述。只输出标题本身，不要引号，不要多余文字。\n\n" +
      topic.slice(0, 300);
    sysContent = "不要输出<think>思考块、内部推理或思维链。直接输出最终的标题，纯文字，无前缀。";
  } else {
    prompt = "Based on the user's first message below, generate a SHORT " +
      "declarative title (3-8 words) in a statement tone that names what the " +
      "session is about. Examples: \"Exploring quantum computing\", " +
      "\"Understanding machine learning basics\", \"Writing better essays\". " +
      "Do NOT use a question or a label — it must read as a statement. " +
      "Output ONLY the title, no quotes, no extra text.\n\n" + topic.slice(0, 300);
    sysContent = "Do NOT output <think>...</think> blocks, internal reasoning, or chain-of-thought. Reply directly with the final title in clean prose. No preamble.";
  }
  const sysMsg = { role: "system", content: sysContent };
  const userMsg = { role: "user", content: prompt };
  const msgs2 = [sysMsg, userMsg];
  /* Always go through the server proxy — Beagle is registered server-side. */
  apiFetch("/api/chat", { method: "POST", body: { messages: msgs2, temperature: 0.3, max_tokens: 30 } as unknown as BodyInit }).then(function (r: unknown) {
    _titleGenQueued = false;
    const resp = r as { choices?: Array<{ message?: { content?: string } }> } | null;
    if (!resp || !resp.choices || !resp.choices[0] || !resp.choices[0].message) return;
    const raw = (resp.choices[0].message.content || "");
    /* Mirror the strips formatMsg() / stripChatArtifacts() apply to
     * chat output, plus a few extra guards for title-gen quirks:
     *  - closed <think>…</think> and unclosed trailing <think>…$
     *  - chat-template tokens (<|im_start|>, <s>, [INST], etc.)
     *  - any leading punctuation the model added (quotes, dashes,
     *    bullets) that would look ugly in a sidebar title. */
    const title = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<think>[\s\S]*$/gi, "")
      .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g, "")
      .replace(/<\|[a-z_]+\|>/gi, "")
      .replace(/<\/?s>/g, "")
      .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g, "")
      .replace(/^\s*Title\s*[:\-]\s*/i, "")
      .replace(/^\s*标题\s*[:\-]\s*/, "")
      .trim()
      .replace(/^[\s\-•·—:"'\u201c\u201d\u2018\u2019]+|[\s\-•·—:"'\u201c\u201d\u2018\u2019]+$/g, "")
      .replace(/^[\s\-•·—:]+/, "")
      .slice(0, 60);
    if (title && title.length > 2) {
      /* P_title-save-race — only save the title if the session is
         still active. A previous session may have been deleted or
         reset while the title generation was in-flight, and calling
         saveCurrentSession() would either resurrect the deleted
         session or attach a stale title to the wrong session. */
      const s = getState().session as { currentSessionId?: string } | null;
      if (s && s.currentSessionId) (getState() as Record<string, unknown>).sessionTitle = title;
      if (typeof (window as any).saveCurrentSession === "function") (window as any).saveCurrentSession();
    }
  }).catch(function (e: unknown) {
    _titleGenQueued = false;
    console.log("[title gen] failed");
  });
}
