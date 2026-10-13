/**
 * turnSummary — one-line "what the assistant just did" for a finished turn.
 *
 * The live pipeline uses completedActivitySummary: execution facts never
 * require another provider request before the turn can finish. The optional
 * model summarizer remains available for callers outside that critical path.
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

/** Describe only observed work, without inventing a reasoning transcript. */
export function completedActivitySummary(input: {
  question: string;
  toolCalls: ReadonlyArray<{ isError?: boolean }>;
  hasReasoning: boolean;
}): string | null {
  const chinese = /\p{Script=Han}/u.test(input.question);
  const total = input.toolCalls.length;
  if (!total) return input.hasReasoning ? (chinese ? '已完成分析' : 'Analysis complete') : null;
  const failed = input.toolCalls.filter((call) => call.isError).length;
  if (chinese) return `执行了 ${total} 项工具操作${failed ? `，${failed} 项失败` : ''}`;
  return `Ran ${total} tool ${total === 1 ? 'action' : 'actions'}${failed ? `; ${failed} failed` : ''}`;
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
