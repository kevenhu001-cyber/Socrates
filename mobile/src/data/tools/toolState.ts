import type { JsonValue, ToolCall } from '@socrates/contracts';

/* The server keys every tool frame by the tool-call id and emits `tool_use` as
 * an ARRAY of calls (see server/src/routes/chat/stream.ts). The mobile store
 * used to push one synthetic row per frame with `name` set to the event kind,
 * so a single tool run rendered as separate "tool_use" / "tool_result" cards
 * with no output. These helpers merge frames onto one card per tool call,
 * mirroring the web client's toolRuntime behaviour. */

export type ToolEventKind =
  | 'tool_use'
  | 'tool_result'
  | 'tool_progress'
  | 'tool_call_delta'
  | 'execution_start';

export type ToolStatus = 'running' | 'done' | 'failed';

export interface MobileToolCall extends ToolCall {
  status?: ToolStatus;
  /** Streamed stdout/stderr chunks joined in arrival order. */
  progress?: string;
  executionId?: string | null;
  /** Raw streamed argument text, before the arguments parse to JSON. */
  argumentsText?: string;
  /** Machine error code from a failed tool_result. */
  errorText?: string;
  /** Human-facing explanation the server supplies for unretryable failures. */
  userMessage?: string;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Find an existing card by id, else by a pending delta at the same index. */
function indexOfCall(calls: MobileToolCall[], id: string | null) {
  if (!id) return -1;
  return calls.findIndex((call) => call.id === id);
}

function upsert(calls: MobileToolCall[], id: string, patch: Partial<MobileToolCall>) {
  const at = indexOfCall(calls, id);
  if (at < 0) return [...calls, { id, name: patch.name || 'tool', ...patch }];
  const next = calls.slice();
  next[at] = { ...next[at], ...patch };
  return next;
}

/**
 * Fold one SSE tool frame into the current list of tool cards.
 * Returns a new array; never mutates the input.
 */
export function reduceToolEvent(
  current: MobileToolCall[] | undefined,
  kind: ToolEventKind,
  payload: unknown,
): MobileToolCall[] {
  let calls = current ? current.slice() : [];

  if (kind === 'tool_use') {
    // Arrives as an array of {id, name, input}.
    const entries = Array.isArray(payload) ? payload : [payload];
    for (const entry of entries) {
      const record = asRecord(entry);
      if (!record) continue;
      const id = str(record.id);
      if (!id) continue;
      calls = upsert(calls, id, {
        name: str(record.name) || 'tool',
        input: (record.input ?? {}) as JsonValue,
        status: 'running',
      });
    }
    return calls;
  }

  const record = asRecord(payload);
  if (!record) return calls;
  const id = str(record.id);

  if (kind === 'tool_call_delta') {
    // Deltas may precede the tool_use frame; buffer argument text by id.
    if (!id) return calls;
    const at = indexOfCall(calls, id);
    const chunk = str(record.arguments) || '';
    const existing = at >= 0 ? calls[at].argumentsText || '' : '';
    return upsert(calls, id, {
      name: str(record.name) || (at >= 0 ? calls[at].name : 'tool'),
      argumentsText: `${existing}${chunk}`,
      status: 'running',
    });
  }

  if (!id) return calls;

  if (kind === 'execution_start') {
    return upsert(calls, id, { executionId: str(record.executionId), status: 'running' });
  }

  if (kind === 'tool_progress') {
    const at = indexOfCall(calls, id);
    const chunk = str(record.chunk) || '';
    if (!chunk) return calls;
    const existing = at >= 0 ? calls[at].progress || '' : '';
    return upsert(calls, id, { progress: `${existing}${chunk}`, status: 'running' });
  }

  if (kind === 'tool_result') {
    const ok = record.ok === true;
    const error = str(record.error);
    const userMessage = str(record.userMessage);
    const patch: Partial<MobileToolCall> = {
      output: str(record.output) ?? '',
      isError: !ok,
      status: ok ? 'done' : 'failed',
    };
    // Surface the friendly message when the server provides one.
    if (error) patch.errorText = error;
    if (userMessage) patch.userMessage = userMessage;
    return upsert(calls, id, patch);
  }

  return calls;
}

/** Any tool still running once the stream ends is reported as stopped, not spinning. */
export function settleToolCalls(calls: MobileToolCall[] | undefined): MobileToolCall[] {
  if (!calls?.length) return [];
  return calls.map((call) => (call.status === 'running' ? { ...call, status: 'failed' as ToolStatus } : call));
}
