/**
 * sessionCompressor — context-window compression (M3).
 *
 * When a conversation carries more context than the model's budget, the
 * built-in (Beagle) model summarizes the older turns into one system
 * message and the result is used in place of the originals, keeping the
 * most recent turns verbatim. Oversize inline attachment payloads in the
 * summarized range are dropped (metadata kept, truncated flagged).
 *
 * SCOPE — this is a MODEL-INPUT transform only. Its output is never
 * written to the database. It used to be called from the session-save
 * route on the belief that the summary would "replace" the older turns,
 * but that route only upserts and never deletes, so nothing was ever
 * discarded: every save of a long session paid a synchronous LLM call
 * and added a summary row that then rendered next to the full transcript
 * it claimed to replace. That call has been removed; the single live
 * caller is routes/chat/helpers.ts, which compresses the messages handed
 * to the model. Persisting a conversation is lossless.
 *
 * Design rules:
 *  - Built-in model only (operator-funded, never the user's own key) —
 *    same policy as the suggestions surface.
 *  - Any summarizer failure degrades to keeping the recent tail (the
 *    caller's own fallback keeps the turn alive, so this module must
 *    never throw).
 *  - SESSION_COMPRESS_DISABLE=1 forces the dumb tail-only path (tests
 *    and operators that want zero LLM spend).
 */

import {createHash} from 'node:crypto';
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

/* P_compress-memo — the model-input path (routes/chat/helpers.ts) can
   ask for the same conversation more than once (a retried turn, a
   regenerate that re-sends the same prefix). Each of those re-derives an
   identical head and therefore an identical summary — a full LLM round
   trip for a result that cannot differ.

   Cache the produced summary keyed by a digest of the head, so a repeat
   request reuses it. The tail is always recomputed from the current
   input, so a growing conversation still returns fresh recent turns.
   Bounded to a handful of entries and time-limited, so an edit to an old
   turn (new digest) re-summarizes. */
const COMPRESS_MEMO_MAX = 8;
const COMPRESS_MEMO_TTL_MS = 10 * 60 * 1000;
const compressMemo = new Map<string, { summary: string; summaryTokens: number; headLength: number; at: number }>();

/* P_summary-stable-id — the clientId carried by the synthetic summary
   message. It is no longer persisted anywhere (see the scope note above),
   but it stays fixed rather than time-based so that a summary handed to
   the model is stable across the retries the memo above collapses, and
   so any future caller that does persist it upserts one row instead of
   appending a new one per request. */
const SUMMARY_CLIENT_ID = 'context-summary';

function headDigest(lines: string[]): string {
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

/* Test seam — clears the memoized summaries. */
export function __resetCompressMemo(): void {
  compressMemo.clear();
}

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
        clientId: SUMMARY_CLIENT_ID,
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

  /* P_compress-memo — return the memoized summary for this exact head
     instead of paying for the LLM again. The tail is rebuilt below from
     the current input, so the caller still gets fresh recent turns. */
  const digest = headDigest(headLines);
  const now = Date.now();
  const memo = compressMemo.get(digest);
  if (memo && now - memo.at < COMPRESS_MEMO_TTL_MS && memo.headLength === head.length) {
    /* Refresh LRU position. */
    compressMemo.delete(digest);
    compressMemo.set(digest, { ...memo, at: now });
    return finishWithSummary(memo.summary, memo.summaryTokens);
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
  compressMemo.delete(digest);
  compressMemo.set(digest, { summary, summaryTokens, headLength: head.length, at: Date.now() });
  while (compressMemo.size > COMPRESS_MEMO_MAX) {
    const oldest = compressMemo.keys().next().value;
    if (oldest === undefined) break;
    compressMemo.delete(oldest);
  }
  return finishWithSummary(summary, summaryTokens);

  /* Shared tail assembly for both the freshly-summarised and the
     memoized path. Declared as a closure so it always pairs the summary
     with the CURRENT tail rather than a captured one. */
  function finishWithSummary(summaryText: string, tokens: number): CompressionResult {
    const summaryMessage: CompressibleMessage = {
      role: 'system',
      /* P_summary-stable-id — was `summary-${Date.now()}`, which made every
         call mint a distinct identity. Harmless now that nothing persists
         this, but a fixed id keeps the summary stable across the retries
         the memo collapses, and keeps a future persisting caller on the
         upsert-one-row path instead of appending one per call. */
      clientId: SUMMARY_CLIENT_ID,
      rawText: `[Context summary — ${head.length} earlier messages compressed]\n${summaryText}`,
      type: 'summary',
    };
    return {
      didCompress: true,
      messages: [summaryMessage, ...tail],
      keptTurns: tail.length + 1,
      droppedTurns: head.length,
      summaryTokens: tokens,
      summarizer: 'beagle',
    };
  }
}
