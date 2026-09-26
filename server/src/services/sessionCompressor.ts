/**
 * sessionCompressor — M3 automatic context compression.
 *
 * When a session save carries more context than the budget, the built-in
 * (Beagle) model summarizes the older turns into one system summary
 * message; the older turns are then discarded and only the summary plus
 * the most recent turns are persisted. Oversize inline attachment payloads
 * in the summarized range are dropped (metadata kept, truncated flagged).
 *
 * Design rules:
 *  - Built-in model only (operator-funded, never the user's own key) —
 *    same policy as the suggestions surface.
 *  - Any summarizer failure degrades to keeping the recent tail (the
 *    route-level sanitizer already guarantees the save lands, so this
 *    module must never throw a 400).
 *  - SESSION_COMPRESS_DISABLE=1 forces the dumb tail-only path (tests
 *    and operators that want zero LLM spend on saves).
 */

import {callChatCompletion} from './llm.js';
import {getActiveApiKey} from './apiKey.js';
import {estimateMessageTokens} from './usageTracker.js';

export interface CompressibleMessage {
  role?: unknown;
  rawText?: unknown;
  content?: unknown;
  clientId?: unknown;
  [key: string]: unknown;
}

export interface CompressionResult {
  didCompress: boolean;
  /** Messages to persist (summary + recent tail, or just the tail). */
  messages: CompressibleMessage[];
  keptTurns: number;
  droppedTurns: number;
  summaryTokens: number;
  summarizer: 'beagle' | 'tail-only' | 'none';
}

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function textOf(m: CompressibleMessage): string {
  if (typeof m.rawText === 'string' && m.rawText) return m.rawText;
  if (typeof m.content === 'string' && m.content) return m.content;
  return '';
}

function asHistoryLine(m: CompressibleMessage): string | null {
  const text = textOf(m).trim();
  if (!text) return null;
  const role = typeof m.role === 'string' && m.role ? m.role : 'user';
  if (role !== 'user' && role !== 'assistant') return null;
  return `${role === 'user' ? 'User' : 'Assistant'}: ${text.slice(0, 4000)}`;
}

function stripHeavyPayloads(m: CompressibleMessage): CompressibleMessage {
  if (!m || typeof m !== 'object' || !Array.isArray((m as Record<string, unknown>).attachments)) {
    return m;
  }
  const copy: Record<string, unknown> = { ...(m as Record<string, unknown>) };
  copy.attachments = ((m as Record<string, unknown>).attachments as Array<Record<string, unknown>>).map((a) => {
    if (!a || typeof a !== 'object') return a;
    if (a.dataUrl == null) return a;
    return { ...a, dataUrl: null, truncated: true };
  });
  return copy as CompressibleMessage;
}

const SUMMARY_SYSTEM_PROMPT =
  'You are a conversation-context compressor. Summarize the older part of a tutoring/chat conversation ' +
  'into a compact brief the assistant can use to continue seamlessly. ' +
  'Reply in the same language the conversation uses. ' +
  'Cover: (1) the topic and user goal, (2) key facts established, decisions made, and user preferences revealed, ' +
  '(3) what was already taught/explained and the user\'s mastery signals, (4) open questions or unfinished work. ' +
  'Be dense but complete. No preamble, no markdown headings — plain paragraphs and short bullets only.';

export async function compressSessionMessages(
  input: CompressibleMessage[],
  opts: { keepTurns?: number; triggerTokens?: number } = {},
): Promise<CompressionResult> {
  const messages = Array.isArray(input) ? input.slice() : [];
  const keepTurns = opts.keepTurns ?? numEnv('SESSION_COMPRESS_KEEP_TURNS', 24);
  const triggerTokens = opts.triggerTokens ?? numEnv('SESSION_COMPRESS_TOKENS', 24000);
  const none: CompressionResult = {
    didCompress: false,
    messages,
    keptTurns: messages.length,
    droppedTurns: 0,
    summaryTokens: 0,
    summarizer: 'none',
  };
  if (messages.length <= keepTurns) return none;

  let totalTokens = 0;
  try {
    totalTokens = estimateMessageTokens(
      messages.map((m) => ({ role: typeof m.role === 'string' ? m.role : 'user', content: textOf(m) })),
    );
  } catch {
    return none;
  }
  if (totalTokens <= triggerTokens) return none;

  const tail = messages.slice(messages.length - keepTurns).map(stripHeavyPayloads);
  const head = messages.slice(0, messages.length - keepTurns);
  const headLines = head.map(asHistoryLine).filter((l): l is string => !!l);

  /* Tail-only fallback — used whenever no summary can be produced. The
     marker message mirrors the [Context summary] notice so the reader
     (and the model) can see that earlier turns were dropped rather than
     silently disappearing. */
  const tailOnly = (): CompressionResult => ({
    ...none,
    didCompress: true,
    messages: [
      {
        role: 'system',
        clientId: `dropped-${Date.now()}`,
        rawText: `[Context notice — ${head.length} earlier messages were removed to fit the context window; no summary was available, so they are lost.]`,
        type: 'summary',
      },
      ...tail,
    ],
    keptTurns: tail.length + 1,
    droppedTurns: head.length,
    summaryTokens: 0,
    summarizer: 'tail-only',
  });

  if (headLines.length === 0) {
    return tailOnly();
  }

  if (process.env.SESSION_COMPRESS_DISABLE === '1') {
    return tailOnly();
  }

  let provider: Awaited<ReturnType<typeof getActiveApiKey>> | null = null;
  try {
    provider = await getActiveApiKey(null);
  } catch {
    provider = null;
  }
  if (!provider || !provider.isBuiltIn || !provider.keyPlaintext || !provider.url || !provider.model) {
    return tailOnly();
  }

  const transcript = headLines.join('\n\n').slice(0, 60000);
  let summary = '';
  try {
    /* Save-path budget: a compression must never stall the session save
     * behind a 5-minute upstream window. 45 s covers a dense summary;
     * on timeout we keep the recent tail (the route sanitizer already
     * guarantees the save itself lands). */
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(45000)
        : undefined;
    const completion = await callChatCompletion({
      apiBase: provider.url,
      apiKey: provider.keyPlaintext,
      model: provider.model,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this earlier conversation (about ${head.length} messages):\n\n${transcript}` },
      ],
      maxTokens: 800,
      temperature: 0.2,
      ...(signal ? { signal } : {}),
    });
    summary = String(completion?.content || '').trim().slice(0, 8000);
  } catch (err) {
    console.warn('[compress] summarizer failed, keeping tail only:', (err as Error).message);
    summary = '';
  }
  if (!summary) {
    return tailOnly();
  }

  let summaryTokens = 0;
  try {
    summaryTokens = estimateMessageTokens([{ role: 'system', content: summary }]);
  } catch {
    summaryTokens = 0;
  }
  const summaryMessage: CompressibleMessage = {
    role: 'system',
    clientId: `summary-${Date.now()}`,
    rawText: `[Context summary — ${head.length} earlier messages compressed]\n${summary}`,
    type: 'summary',
  };
  return {
    didCompress: true,
    messages: [summaryMessage, ...tail],
    keptTurns: tail.length + 1,
    droppedTurns: head.length,
    summaryTokens,
    summarizer: 'beagle',
  };
}
