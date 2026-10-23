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
import {resolveContextBudget} from '../../lib/modelCapabilities.js';
import {callChatCompletion} from '../core/llm.js';
import {getActiveApiKey} from '../core/apiKey.js';
import {estimateContextMessageTokens} from '../core/usageTracker.js';
import {createSummaryMemo} from '../../lib/summaryMemo.js';

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
const compressMemo = createSummaryMemo();

/* P_summary-stable-id — the clientId carried by the synthetic summary
   message. It is no longer persisted anywhere (see the scope note above),
   but it stays fixed rather than time-based so that a summary handed to
   the model is stable across the retries the memo above collapses, and
   so any future caller that does persist it upserts one row instead of
   appending a new one per request. */
const SUMMARY_CLIENT_ID = 'context-summary';

/* Test seam — clears the memoized summaries. */
export function __resetCompressMemo(): void {
  compressMemo.clear();
}

export async function compressSessionMessages(
  input: CompressibleMessage[],
  opts: { keepTurns?: number; triggerTokens?: number; model?: string; cacheScope?: string } = {},
): Promise<CompressionResult> {
  const messages = Array.isArray(input) ? input.slice() : [];
  const keepTurns = opts.keepTurns ?? numEnv('SESSION_COMPRESS_KEEP_TURNS', 24);
  /* P_model-capability-registry — the trigger follows the window of the model
     the conversation is destined for. It used to be one global constant
     (24 000 tokens) for every model and every endpoint. A model with a small
     window was compressed far too late — the request went out oversized and
     the provider rejected it with a context-length 400, which the
     compatibility chain treats as terminal — while a model with a large
     window was compressed far too early. The caller passes an explicit
     trigger whenever it knows the target model; `opts.model` is the fallback
     for callers that do not. */
  const envTrigger = numEnv('SESSION_COMPRESS_TOKENS', 0);
  const triggerTokens = opts.triggerTokens
    ?? (envTrigger > 0 ? envTrigger : resolveContextBudget(opts.model ?? '').budget);
  const none: CompressionResult = {
    didCompress: false,
    messages,
    keptTurns: messages.length,
    droppedTurns: 0,
    summaryTokens: 0,
    summarizer: 'none',
  };
  if (messages.length < 2) return none;

  let messageTokens: number[];
  try {
    messageTokens = messages.map((m) => estimateContextMessageTokens([
      { ...m, role: typeof m.role === 'string' ? m.role : 'user', content: m.content || textOf(m) },
    ]));
  } catch {
    return none;
  }
  const totalTokens = messageTokens.reduce((sum, count) => sum + count, 0);
  if (totalTokens <= triggerTokens) return none;

  // Cut only at a user-turn boundary. Slicing by message count can leave a
  // tool result without its assistant tool_calls (or only half a multi-tool
  // result batch), causing deterministic provider 400s on the next request.
  let tailStart = Math.max(0, messages.length - keepTurns);
  while (tailStart > 0 && messages[tailStart].role !== 'user') tailStart--;
  // keepTurns is a ceiling, not a promise to send an oversized tail. Even
  // two long exchanges can exceed a small model's window. Leave space for
  // a summary and advance only over complete user/assistant/tool groups.
  const tailBudget = Math.max(1, triggerTokens - Math.min(1200, Math.floor(triggerTokens * 0.2)));
  let tailTokens = messageTokens.slice(tailStart).reduce((sum, count) => sum + count, 0);
  while (tailTokens > tailBudget) {
    let nextUser = tailStart + 1;
    while (nextUser < messages.length && messages[nextUser].role !== 'user') nextUser++;
    if (nextUser === messages.length) break; // current interaction is indivisible
    for (let i = tailStart; i < nextUser; i++) tailTokens -= messageTokens[i];
    tailStart = nextUser;
  }
  if (tailStart === 0) return none; // never split the current interaction
  const tail = messages.slice(tailStart).map(stripHeavyPayloads);
  const head = messages.slice(0, tailStart);
  const headLines = head.map(asHistoryLine).filter((l): l is string => !!l);

  /* Tail-only fallback — used whenever no summary can be produced. The
     marker message mirrors the [Context summary] notice so the reader
     (and the model) can see that earlier turns were dropped rather than
     silently disappearing.
     P_context-marker-prefix — the prefix has to be one the prompt splitter
     recognises: lib/chatPromptContext.ts keeps "[Conversation summary" and
     "[Context summary" blocks in the conversation. With any other prefix the
     marker was classified as a system initialization block and dropped along
     with the head, so the model saw a conversation that simply started
     later, with no indication that earlier turns had existed. */
  const tailOnly = (): CompressionResult => ({
    ...none,
    didCompress: true,
    messages: [
      {
        role: 'system',
        clientId: SUMMARY_CLIENT_ID,
        rawText: `[Context summary — ${head.length} earlier messages were removed to fit the context window; no summary was available, so they are lost.]`,
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
  const digest = createHash('sha256').update(JSON.stringify([
    opts.cacheScope ?? null, provider.id, provider.url, provider.model, head.length, headLines,
  ])).digest('hex');

  const transcript = headLines.join('\n\n').slice(0, 60000);
  const { url: apiBase, keyPlaintext: apiKey, model } = provider;
  const summarize = async () => {
    try {
      // Bound the model-input preparation delay. On timeout the original
      // transcript remains persisted and only this request uses tail-only.
      const signal = AbortSignal.timeout(45000);
      const completion = await callChatCompletion({
        apiBase,
        apiKey,
        model,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: `Summarize this earlier conversation (about ${head.length} messages):\n\n${transcript}` },
        ],
        maxTokens: 800,
        temperature: 0.2,
        signal,
      });
      return String(completion?.content || '').trim().slice(0, 8000);
    } catch (err) {
      console.warn('[compress] summarizer failed, keeping tail only:', (err as Error).message);
      return '';
    }
  };
  // Sessionless callers never share cached conversation data.
  const summary = opts.cacheScope ? await compressMemo.get(digest, summarize) : await summarize();
  if (!summary) {
    return tailOnly();
  }

  let summaryTokens = 0;
  try {
    summaryTokens = estimateContextMessageTokens([{ role: 'system', content: summary }]);
  } catch {
    summaryTokens = 0;
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
