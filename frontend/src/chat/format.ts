/* chat/format.ts — Wave 0b of main-js-split plan.
 * Three chat-formatting helpers extracted from main.js region 13.
 */

import { stateStore } from '../state/store.ts';
import { scheduleTurnToTopForMessage } from './turnAnchor.ts';

type ChatResultWindow = Window & {
  askChatTurn(text: string): Promise<unknown>;
  isExpectedTurnAbort?: (error: unknown) => boolean;
  addMessage?: (role: string, text: string) => string;
};

/* Detect a tool envelope in the model's response. Returns:
      null — not a tool call
      {tool:"web_search", query:"..."} — a real tool call
   We search the FULL response text for any recognizable tool call
   format — the model may embed it in conversation text or wrap it
   in [TOOL_CALL] tags despite the instruction to output it alone. */
type ParsedToolCall = { tool: string; query: string };

function normalizeJsonToolCall(value: unknown): ParsedToolCall | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { tool?: unknown; query?: unknown };
  if (candidate.tool !== 'web_search' || typeof candidate.query !== 'string' || !candidate.query.trim()) return null;
  return { tool: 'web_search', query: candidate.query.trim().slice(0, 200) };
}

function parseJsonToolCall(value: string): ParsedToolCall | null {
  try {
    return normalizeJsonToolCall(JSON.parse(value));
  } catch (_) { /* not JSON */ }
  return null;
}

function parseMatchedJsonToolCall(text: string, pattern: RegExp): ParsedToolCall | null {
  const match = text.match(pattern);
  return match ? parseJsonToolCall(match[1]) : null;
}

function parseLooseToolCall(text: string): ParsedToolCall | null {
  const bare = text.match(/\{\s*["']tool["']\s*:\s*["']web_search["']\s*,\s*["']query["']\s*:\s*["']([^"']+)["']\s*\}/i);
  if (bare) return { tool: 'web_search', query: bare[1].slice(0, 200) };

  const lenient = text.match(/\{\s*["']?tool["']?\s*:\s*["']?web_search["']?\s*,\s*["']?query["']?\s*:\s*["']?([^"'}\s][^"'}]*?)["']?\s*\}/i);
  if (lenient) return { tool: 'web_search', query: lenient[1].slice(0, 200) };
  return null;
}

function parseToolCall(text: string): ParsedToolCall | null {
  if (typeof text !== 'string' || !text) return null;
  const trimmed = text.trim();
  return parseJsonToolCall(trimmed)
    || parseMatchedJsonToolCall(text, /```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"web_search"[\s\S]*?\})\s*```/i)
    || parseMatchedJsonToolCall(text, /\[TOOL_CALL\]\s*(\{[\s\S]*?["']tool["']\s*:\s*["']web_search["'][\s\S]*?\})\s*\[\/TOOL_CALL\]/i)
    || parseLooseToolCall(text);
}

/* Format the search results into the same [Web research] block the
   system used to inject. Used by the round-2 message. */
function formatSourcesBlock(sources: Array<{ title?: string; snippet?: string; url?: string; matchedQuery?: string; fullContent?: string }>, query: string): string {
  function stripEmoji(s: string | undefined): string {
    if (!s) return '';
    return String(s)
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{2B00}-\u{2BFF}]/gu, '')
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
      .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/\u200D/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  const lines = sources.map(function (x, i) {
    const title = stripEmoji(x.title || '') || x.title || '';
    let head = '[' + (i + 1) + '] ' + title;
    if (x.snippet) { const snip = stripEmoji(x.snippet); if (snip) head += ' — ' + snip; }
    head += ' ( ' + (x.url || '') + ' )';
    if (x.matchedQuery) head += '\n    Source query: "' + x.matchedQuery + '"';
    if (x.fullContent) {
      const fc = stripEmoji(x.fullContent);
      const trimmed = (fc.length > 3000) ? fc.slice(0, 3000) + '…' : fc;
      head += '\n    Full text: ' + trimmed;
    } else {
      head += '\n    (snippet only — full text unavailable)';
    }
    return head;
  });
  return '[Web research] — query: "' + query + '". ' +
    'Each result below was retrieved live from the web. ' +
    'Weave the facts into your reply as natural prose. Do NOT add [1]/[2] citation markers or append a "Sources:"/"References:" list. Attribute claims supported only by these snippets with a Markdown link to the source URL when no tool source card covers them. ' +
    'Do NOT invent facts not supported by the results; if a result is irrelevant, ignore it.\n' +
    lines.join('\n');
}

interface StreamController {
  abort: () => void;
  finish: () => void;
  replaceWithError: (msg: string, retry: () => void) => void;
}

/* `retry` is the owning turn's own replay closure (askChatTurn passes one
   that carries the immutable pendingContent: image/PDF/text attachments and
   plugin context). Falling back to the bare userText here used to drop that
   content on every error-bubble Retry. */
function handleChatApiResult(
  result: { cancelled?: boolean; text?: string } | null,
  ctl: StreamController,
  userText: string,
  retry?: () => unknown,
): void {
  if (result && result.cancelled) {
    ctl.abort();
    return;
  }
  if (result && result.text && typeof result.text === 'string' && result.text.trim()) {
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
    ctl.finish();
  } else {
    const lastCallError = stateStore.read('lastCallError') as string | null;
    const isClaimConflict = !!(lastCallError && /already been claimed|already bound/i.test(lastCallError));
    const sanitizedError = isClaimConflict
      ? 'Turn execution conflict. Please click Retry to create a new turn.'
      : lastCallError;
    const reason: string = sanitizedError || 'empty response (no error detail)';
    const isCancel = /cancel|user-stop|superseded|new-session|session-switch|session-expired|session-deleted|session-purged|session-reset|archived-session|msg-edit|msg-regen|signout/i.test(reason);
    if (isCancel) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'cancelled' });
      ctl.abort();
    } else if (sanitizedError) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'error' });
      ctl.replaceWithError(sanitizedError, function () {
        /* P_turn-abort-quiet — the retried turn can itself abort
           (session-expired races the retry click); guard the promise so
           it never becomes an unhandledrejection + red banner. */
        try {
          const p = (typeof retry === 'function'
            ? retry()
            : (window as unknown as ChatResultWindow).askChatTurn(userText)) as Promise<unknown> | undefined;
          if (p && typeof p.catch === 'function') {
            p.catch((e: unknown) => {
              const quiet = (window as unknown as ChatResultWindow).isExpectedTurnAbort;
              if (typeof quiet === 'function' ? !quiet(e) : true) console.error('[chat] retry turn failed:', e);
            });
          }
        } catch { /* retry dispatch failed — bubble already shows the error */ }
      });
    } else {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'error' });
      ctl.abort();
      console.warn('[chat] stream returned no result with no error. result=', result, 'lastCallError=', lastCallError);
      const runtime = window as unknown as ChatResultWindow;
      if (runtime.addMessage) {
        const clientId = runtime.addMessage('assistant', '(response interrupted — no content received)');
        const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
        scheduleTurnToTopForMessage(list, clientId);
      }
    }
  }
}

export { parseToolCall, formatSourcesBlock, handleChatApiResult, StreamController };
