/* chat/format.ts — Wave 0b of main-js-split plan.
 * Three chat-formatting helpers extracted from main.js region 13.
 */

import { stateStore } from '../state.js';

/* Detect a tool envelope in the model's response. Returns:
      null — not a tool call
      {tool:"web_search", query:"..."} — a real tool call
   We search the FULL response text for any recognizable tool call
   format — the model may embed it in conversation text or wrap it
   in [TOOL_CALL] tags despite the instruction to output it alone. */
function parseToolCall(text: string): { tool: string; query: string } | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const trimmed = text.trim();
    const obj = JSON.parse(trimmed);
    if (obj && obj.tool === 'web_search' && typeof obj.query === 'string' && obj.query.trim())
      return { tool: 'web_search', query: obj.query.trim().slice(0, 200) };
  } catch (_) { /* not JSON */ }
  const fence = text.match(/```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"web_search"[\s\S]*?\})\s*```/i);
  if (fence) {
    try {
      const obj2 = JSON.parse(fence[1]);
      if (obj2 && obj2.tool === 'web_search' && typeof obj2.query === 'string' && obj2.query.trim())
        return { tool: 'web_search', query: obj2.query.trim().slice(0, 200) };
    } catch (_) { /* not JSON */ }
  }
  const tcMatch = text.match(/\[TOOL_CALL\]\s*(\{[\s\S]*?["']tool["']\s*:\s*["']web_search["'][\s\S]*?\})\s*\[\/TOOL_CALL\]/i);
  if (tcMatch) {
    try {
      const obj3 = JSON.parse(tcMatch[1]);
      if (obj3 && obj3.tool === 'web_search' && typeof obj3.query === 'string' && obj3.query.trim())
        return { tool: 'web_search', query: obj3.query.trim().slice(0, 200) };
    } catch (_) { /* not JSON */ }
  }
  const bare = text.match(/\{\s*["']tool["']\s*:\s*["']web_search["']\s*,\s*["']query["']\s*:\s*["']([^"']+)["']\s*\}/i);
  if (bare) {
    return { tool: 'web_search', query: bare[1].slice(0, 200) };
  }
  const lenient = text.match(/\{\s*["']?tool["']?\s*:\s*["']?web_search["']?\s*,\s*["']?query["']?\s*:\s*["']?([^"'\}\s][^"'\}]*?)["']?\s*\}/i);
  if (lenient) {
    return { tool: 'web_search', query: lenient[1].slice(0, 200) };
  }
  return null;
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
    'Weave the facts into your reply as natural prose. Do NOT add [1]/[2] citation markers, do NOT append a "Sources:"/"References:" list, and do NOT paste result URLs into your reply (the UI already shows every source to the user). ' +
    'Do NOT invent facts not supported by the results; if a result is irrelevant, ignore it.\n' +
    lines.join('\n');
}

interface StreamController {
  abort: () => void;
  finish: () => void;
  replaceWithError: (msg: string, retry: () => void) => void;
}

function handleChatApiResult(result: { cancelled?: boolean; text?: string } | null, ctl: StreamController, userText: string): void {
  if (result && result.cancelled) {
    ctl.abort();
    return;
  }
  if (result && result.text && typeof result.text === 'string' && result.text.trim()) {
    stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'api' });
    ctl.finish();
  } else {
    const lastCallError = stateStore.read('lastCallError');
    const reason = lastCallError || 'empty response (no error detail)';
    const isCancel = /cancel|user-stop|superseded|new-session|session-switch|session-deleted|session-purged|session-reset|msg-edit/i.test(reason);
    if (isCancel) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'cancelled' });
      ctl.abort();
    } else if (lastCallError) {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'error' });
      ctl.replaceWithError(lastCallError, function () {
        if ((window as any).askChatTurn) (window as any).askChatTurn(userText);
      });
    } else {
      stateStore.dispatch({ type: 'state/set', key: 'lastCallSource', value: 'error' });
      ctl.abort();
      console.warn('[chat] stream returned no result with no error. result=', result, 'lastCallError=', lastCallError);
      if ((window as any).addMessage) (window as any).addMessage('assistant', '(response interrupted — no content received)');
    }
  }
}

export { parseToolCall, formatSourcesBlock, handleChatApiResult, StreamController };
