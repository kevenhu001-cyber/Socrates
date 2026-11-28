/** Model-only result previews. All original output stays in the normal UI
 * path; a bounded, turn-local archive allows exact reads without re-execution.
 * No summarizer, provider calls, or cross-turn shared state. */
import { estimateContextTokens } from '../core/usageTracker.js';

export const READ_TOOL_RESULT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'read_tool_result',
    description:
      'Read omitted text from a previous tool result in this turn, using its exact call ID and character offset. Does not execute the original tool again.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['call_id'],
      properties: {
        call_id: { type: 'string', minLength: 1, maxLength: 256 },
        offset: { type: 'integer', minimum: 0 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 12000,
          description: 'Characters to read (default 4000).',
        },
      },
    },
  },
};

// Explicit page and schema reads must keep the complete requested contract.
const NATIVE_PAGED = new Set([
  'web_fetch',
  'read_attachment',
  'read_tool_result',
  'get_connector_spec',
  'get_ui_contract',
]);
const MAX_ARCHIVE_CHARS = 4_000_000;
const MAX_ENTRY_CHARS = 120_000;
const MAX_ENTRIES = 200;

export function toolResultBudgetEnabled(): boolean {
  return process.env.CHAT_TOOL_RESULT_COMPACT !== '0';
}

/** Offsets are UTF-16 character offsets, as in existing page tools. Avoid
 * splitting a surrogate pair; report actual returned offsets. */
function safeEnd(text: string, end: number): number {
  if (
    end > 0 &&
    end < text.length &&
    text.charCodeAt(end - 1) >= 0xd800 &&
    text.charCodeAt(end - 1) <= 0xdbff &&
    text.charCodeAt(end) >= 0xdc00 &&
    text.charCodeAt(end) <= 0xdfff
  )
    return end - 1;
  return end;
}

function prefixWithin(text: string, tokens: number): number {
  let lo = 0,
    hi = Math.min(text.length, tokens * 4);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateContextTokens(text.slice(0, mid)) <= tokens) lo = mid;
    else hi = mid - 1;
  }
  return safeEnd(text, lo);
}

function suffixWithin(text: string, tokens: number): number {
  let lo = Math.max(0, text.length - tokens * 4),
    hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (estimateContextTokens(text.slice(mid)) <= tokens) hi = mid;
    else lo = mid + 1;
  }
  const boundary = safeEnd(text, lo);
  return boundary === lo ? lo : lo + 1;
}

export function createToolResultArchive() {
  const entries = new Map<string, string>();
  let chars = 0;
  return {
    preview(
      callId: string,
      toolName: string,
      raw: string,
      opts: { correction?: boolean; failed?: boolean } = {},
    ): string {
      if (!toolResultBudgetEnabled() || NATIVE_PAGED.has(toolName) || opts.correction) return raw;
      const configured = Number(process.env.CHAT_TOOL_RESULT_PREVIEW_TOKENS ?? '2500');
      const base =
        Number.isFinite(configured) && configured >= 512
          ? Math.min(12000, Math.floor(configured))
          : 2500;
      const budget =
        toolName === 'code_interpreter' || toolName === 'workspace_agent' || opts.failed
          ? Math.max(base, 4000)
          : base;
      if (estimateContextTokens(raw) <= budget) return raw;
      // Fail open to the existing transport cap if the exact result cannot
      // be archived. Never advertise an unavailable continuation.
      if (
        !callId ||
        callId.length > 256 ||
        entries.has(callId) ||
        entries.size >= MAX_ENTRIES ||
        raw.length > MAX_ENTRY_CHARS ||
        chars + raw.length > MAX_ARCHIVE_CHARS
      )
        return raw;
      entries.set(callId, raw);
      chars += raw.length;
      const notice = (start: number, end: number) =>
        '\n\n[Tool result preview: omitted chars ' +
        start +
        '-' +
        end +
        ' of ' +
        raw.length +
        '. Read exact text with read_tool_result using call_id=' +
        JSON.stringify(callId) +
        ', offset=' +
        start +
        '. Do not infer omitted data or repeat the original action.]\n\n';
      // Reserve space for the continuation notice. Prefer the start (headers,
      // IDs, schema, stdout) but keep the end (errors and final conclusions).
      const reserve = estimateContextTokens(notice(0, raw.length)) + 16;
      const usable = Math.max(100, budget - reserve);
      const head = prefixWithin(raw, Math.floor(usable * 0.65));
      const tail = suffixWithin(raw, Math.floor(usable * 0.35));
      if (tail <= head) return raw;
      return raw.slice(0, head) + notice(head, tail) + raw.slice(tail);
    },
    read(callId: string, offset: number, limit: number) {
      const raw = entries.get(callId);
      if (
        raw === undefined ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset >= raw.length ||
        safeEnd(raw, offset) !== offset ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 12000
      )
        return null;
      let end = safeEnd(raw, Math.min(raw.length, offset + limit));
      // A one-code-unit request at an emoji boundary must still make progress.
      if (end === offset) end = Math.min(raw.length, offset + 2);
      return {
        text: raw.slice(offset, end),
        offset,
        end,
        total: raw.length,
        hasMore: end < raw.length,
      };
    },
  };
}
export type ToolResultArchive = ReturnType<typeof createToolResultArchive>;
