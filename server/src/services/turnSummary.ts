/**
 * turnSummary — one-line "what the assistant just did" for a finished turn.
 *
 * The reader sees this line under the answer (the ⏱ row in the reference
 * UI) and it is the first entry inside the Summary sheet. Until now the
 * panel reused a mechanical first-sentence slice of the answer, which
 * describes the ANSWER but not the WORK — with a tool-using turn it said
 * nothing about what ran.
 *
 * P_summary-model — this asks the model itself for a short retrospective
 * line, because only it knows what it decided to do. Two rules keep it
 * cheap and safe:
 *   1. It runs AFTER `emitter.finish()`, off the response path, so it can
 *      never delay a first token. A failure degrades to null and the UI
 *      falls back to the previous mechanical preview.
 *   2. It is a cheap non-streaming call with a hard timeout, and its output
 *      is treated as untrusted text: stripped of control characters and
 *      capped, never injected into the conversation.
 *
 * Providers vary wildly in how well they follow a "one line, no markdown"
 * instruction, so the parser tolerates a bulleted or multi-sentence reply
 * and takes the first usable sentence rather than trusting the format.
 */

export interface TurnSummaryInput {
  /** The user's question, already truncated by the caller. */
  question: string;
  /** The assistant's final answer, truncated by the caller. */
  answer: string;
  /** Tool calls executed this turn, in execution order. */
  toolCalls: ReadonlyArray<{ name: string; isError?: boolean }>;
  /** Model reasoning/thinking highlights if reasoning occurred. */
  reasoning?: string;
}

export interface TurnSummaryDeps {
  /** Non-streaming chat completion. Returns the assistant's raw text.
   *  Receives the abort signal so the timeout below can actually cancel the
   *  request — a summary that cannot be cancelled can hold the turn's closing
   *  frame open for the provider's whole retry budget. */
  complete: (prompt: string, signal?: AbortSignal) => Promise<string>;
  /** Hard ceiling for the whole call. */
  timeoutMs?: number;
  maxChars?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_CHARS = 180;

export const TURN_SUMMARY_SYSTEM_PROMPT = [
  'You write a single-line status summary of work you just finished.',
  'Rules:',
  '- One line, plain text. No markdown, no bullets, no quotes, no trailing period.',
  '- 10 words maximum. Write in the language the user used.',
  '- Say what was DONE or FOUND, not what was asked. Never address the user.',
  '- If tools ran, name the outcome of using them (e.g. "查找了 3 个来源并汇总").',
  '- If problem-solving or reasoning took place, name what was analyzed, solved, or calculated (e.g. "拆解运动条件并完成推导").',
].join('\n');

function buildPrompt(input: TurnSummaryInput): string {
  const parts: string[] = [];
  if (input.question) parts.push(`用户提问：${input.question}`);
  if (input.reasoning) parts.push(`思考与推导要点：${input.reasoning.slice(0, 800)}`);
  if (input.toolCalls.length) {
    const names = input.toolCalls.map((c) => (c.isError ? `${c.name}(失败)` : c.name));
    parts.push(`本轮执行的工具：${names.join('、')}`);
  }
  if (input.answer) parts.push(`你的回答：${input.answer}`);
  parts.push('用一行不超过 10 个词概括你这一轮做了什么。');
  return parts.join('\n\n');
}

/** Reduce whatever the model returned to one safe, plain-text line. */
export function normalizeSummary(raw: string, maxChars = DEFAULT_MAX_CHARS): string | null {
  if (!raw) return null;
  /* Take the first non-empty line — models sometimes prefix "Summary:" or
     wrap the answer in a bullet even when told not to. */
  const firstLine = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;
  const cleaned = firstLine
    /* Strip the decorative wrappers models reach for unbidden. */
    .replace(/^[-*•]\s*/, '')
    .replace(/^(?:summary|摘要|概括|说明)\s*[:：]\s*/i, '')
    .replace(/^["'“”「」『』`]+/, '')
    .replace(/["'“”「」『』`]+$/, '')
    .replace(/[。.]+$/, '')
    /* Control characters would break the one-line layout. */
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length <= maxChars ? cleaned : `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

/**
 * Produce the summary line, or null when it cannot be produced.
 * Never throws — a missing summary is a cosmetic degradation, not an error.
 */
export async function generateTurnSummary(
  input: TurnSummaryInput,
  deps: TurnSummaryDeps,
): Promise<string | null> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChars = deps.maxChars ?? DEFAULT_MAX_CHARS;
  /* Nothing worth summarising: a blank turn, or an answer so short the
     mechanical first-sentence preview is already the summary. */
  if (!input.answer.trim() && !input.toolCalls.length) return null;
  if (input.answer.trim().length < 40 && !input.toolCalls.length) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const raw = await deps.complete(buildPrompt(input), controller.signal);
    return normalizeSummary(raw, maxChars);
  } catch (err) {
    /* Summary is best-effort decoration on top of a finished answer. */
    console.warn('[summary] generation failed:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a concise, stable upfront task summary from the user's prompt
 * before thinking or tool execution begins.
 */
export function generateInitialTaskSummary(userPrompt: string): string {
  if (!userPrompt || typeof userPrompt !== 'string') return '';
  const text = userPrompt.trim()
    .replace(/^<[^>]+>/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  if (!text) return '';

  // 1. Math / Physics / STEM problem conditions
  if (/解析函数.*路径无关/i.test(text)) {
    return '解析函数路径无关性的说明。';
  }
  if (/(?:运动|小球|自由落体|加速度|速度|位移|受力|滑块|斜面|牛顿|动量|能量守恒).*(?:求|计算|分析|已知)/i.test(text) ||
      /(?:已知|求).*(?:运动|小球|自由落体|加速度|速度|位移|受力|滑块|斜面)/i.test(text)) {
    return '拆解运动条件和数据分析。';
  }
  if (/(?:微分方程|偏微分|ODE|PDE)/i.test(text)) {
    return '微分方程求解与推导。';
  }
  if (/(?:定积分|不定积分|重积分|二重积分|三重积分|格林公式|高斯公式|斯托克斯)/i.test(text)) {
    return '积分计算与定理性质推导。';
  }
  if (/(?:求导|导数|偏导数|极值|拐点|泰勒公式)/i.test(text)) {
    return '函数导数推导与极值分析。';
  }
  if (/(?:证明|推导).*(?:定理|公式|结论|猜想)/i.test(text) || /(?:定理|公式).*(?:证明|推导)/i.test(text)) {
    return '数学定理与公式推导分析。';
  }
  if (/(?:线性代数|矩阵|特征值|特征向量|行列式|逆矩阵)/i.test(text)) {
    return '矩阵特征与线性代数求解。';
  }

  // 2. Programming / Code
  if (/(?:写一个|编写|实现|开发).*(?:爬虫|spider|crawler)/i.test(text)) {
    return '爬虫方案设计与代码实现。';
  }
  if (/(?:快速排序|二分查找|冒泡排序|红黑树|动态规划|贪心|DFS|BFS|算法).*(?:实现|写|复杂度|分析)?/i.test(text)) {
    const algMatch = text.match(/(快速排序|二分查找|冒泡排序|红黑树|动态规划|贪心算法|DFS|BFS)/i);
    return `${algMatch ? algMatch[1] : '核心算法'}实现与逻辑分析。`;
  }
  if (/(?:写一个|编写|实现|开发).*(?:代码|函数|组件|脚本|程序|API|接口)/i.test(text)) {
    return '需求功能梳理与代码实现。';
  }
  if (/(?:优化|调优|性能).*(?:查询|SQL|数据库|MySQL|前端|代码)/i.test(text)) {
    return '性能瓶颈定位与优化方案。';
  }
  if (/(?:bug|报错|error|exception|排查|解决).*(?:问题|原因)?/i.test(text)) {
    return '异常错误定位与修复分析。';
  }

  // 3. Question / Concept / Comparison patterns
  if (/(?:区别|不同|对比|比较).*(?:是什么|有哪些|何在)?/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|帮我|想知道)?\s*/, '')
      .replace(/[?？。!！\s]+$/, '')
      .replace(/^(?:分析|对比|比较|说说)\s*/, '');
    return `${cleanQ.slice(0, 18)}对比与差异分析。`;
  }
  if (/(?:为什么|为何|原因).*(?:是|成因)?/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|帮我|想知道)?\s*/, '')
      .replace(/[?？。!！\s]+$/, '')
      .replace(/^(?:为什么|为何)\s*/, '');
    return `${cleanQ.slice(0, 16)}成因与机理剖析。`;
  }
  if (/(?:如何评价|怎么看待|怎样评价|如何看待)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|想知道)?\s*(?:如何评价|怎么看待|怎样评价|如何看待)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 14)}深度剖析与评价。`;
  }
  if (/(?:什么是|何为|解释一下|介绍一下|概述)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|请|帮我|介绍一下|解释一下|说说|概述)?\s*/, '')
      .replace(/^(?:什么是|何为)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 16)}核心概念与原理解析。`;
  }
  if (/(?:怎么做|如何|怎样).*(?:做|搞|弄|办|解决|处理)/i.test(text)) {
    const cleanQ = text.replace(/^(?:请问|请教|请|帮我)?\s*/, '')
      .replace(/^(?:怎么|如何|怎样)\s*/, '')
      .replace(/[?？。!！\s]+$/, '');
    return `${cleanQ.slice(0, 16)}实现方案与操作建议。`;
  }

  // 4. General fallback: extract core topic and format
  let topic = text
    .replace(/^(?:请问|请教一下|想请教|请帮我|帮我|你可以帮我|我想了解|我想知道|请说明|请解释|请阐述|请教|请分析|请|能否|可以告诉我|告诉我|说说)\s*/i, '')
    .replace(/(?:呢|吗|吧|呀|啊|哦|嘛|求解答|求教|谢谢|感谢|具体怎么做|详细说说)[？?。!！\s]*$/i, '')
    .replace(/[？?。!！\s]+$/, '')
    .trim();

  if (topic.length > 20) {
    topic = topic.slice(0, 20).trimEnd() + '…';
  }
  if (topic.length >= 2) {
    return `${topic}相关解析与说明。`;
  }

  return '问题分析与解答准备。';
}