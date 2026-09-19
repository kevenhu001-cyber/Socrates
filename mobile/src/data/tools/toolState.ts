import type { JsonValue, ToolApproval, ToolCall } from '@socrates/contracts';

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
  | 'execution_start'
  | 'tool_approval';

export type ToolStatus = 'running' | 'awaiting' | 'done' | 'failed';

export interface MobileToolCall extends ToolCall {
  status?: ToolStatus;
  /** Streamed stdout/stderr chunks joined in arrival order. */
  progress?: string;
}

const MAX_STREAMED_TEXT = 48_000;
const TRUNCATED_STREAM_PREFIX = '… earlier streamed output truncated …\n';

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function appendCapped(existing: string, chunk: string): string {
  const combined = `${existing}${chunk}`;
  if (combined.length <= MAX_STREAMED_TEXT) return combined;
  return `${TRUNCATED_STREAM_PREFIX}${combined.slice(-(MAX_STREAMED_TEXT - TRUNCATED_STREAM_PREFIX.length))}`;
}

function displayText(value: unknown): string | null {
  const direct = str(value);
  if (direct != null) return direct;
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  // SSE payloads are server-originated JSON. Keep the structured payload so
  // cards can render plans, visualisations and search results instead of
  // reducing them to an opaque string.
  return value as JsonValue;
}

function artifacts(value: unknown): ToolCall['artifacts'] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.flatMap((entry) => {
    const record = asRecord(entry);
    const id = record ? str(record.id) : null;
    return id && record
      ? [{
        id,
        name: str(record.name),
        mimeType: str(record.mimeType),
      }]
      : [];
  });
  return parsed;
}

function results(value: unknown): ToolCall['results'] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry) => asRecord(entry) != null)
    .slice(0, 24)
    .map((entry) => entry as Record<string, JsonValue>);
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

  if (kind === 'tool_approval') {
    const runId = str(record.runId);
    const approvalId = str(record.approvalId);
    if (!runId || !approvalId) return calls;
    const targetId = id || calls.find((call) => call.executionId === runId)?.id || `approval:${approvalId}`;
    const approval = {
      ...record,
      id: targetId,
      runId,
      approvalId,
      status: str(record.status) || 'pending',
    } as unknown as ToolApproval;
    return upsert(calls, targetId, {
      name: str(record.name) || str(record.kind) || 'workspace_agent',
      approval,
      status: 'awaiting',
    });
  }

  if (kind === 'tool_call_delta') {
    // Deltas may precede the tool_use frame; buffer argument text by id.
    if (!id) return calls;
    const at = indexOfCall(calls, id);
    // The backend forwards the provider's cumulative arguments snapshot, not
    // an append-only fragment. Appending here duplicated every prefix and
    // produced invalid JSON such as {"q"}{"query":"..."}.
    const argumentsText = str(record.arguments);
    return upsert(calls, id, {
      name: str(record.name) || (at >= 0 ? calls[at].name : 'tool'),
      ...(argumentsText != null ? { argumentsText } : {}),
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
    const existing = at >= 0 ? calls[at].progress || '' : '';
    return upsert(calls, id, {
      ...(chunk ? { progress: appendCapped(existing, chunk) } : {}),
      ...(str(record.phase) ? { progressPhase: str(record.phase) } : {}),
      status: 'running',
    });
  }

  if (kind === 'tool_result') {
    const ok = record.ok === true || record.status === 'completed';
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
    const stderr = str(record.stderr);
    const executionId = str(record.executionId);
    const durationMs = typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)
      ? record.durationMs
      : undefined;
    const retryable = typeof record.retryable === 'boolean' ? record.retryable : undefined;
    const detail = displayText(record.detail);
    const resultArtifacts = artifacts(record.artifacts);
    const resultResults = results(record.results);
    const plan = jsonValue(record.plan);
    const spec = jsonValue(record.spec);
    const visualization = jsonValue(record.visualization);
    if (stderr != null) patch.stderr = stderr;
    if (executionId != null) patch.executionId = executionId;
    if (durationMs != null) patch.durationMs = durationMs;
    if (retryable != null) patch.retryable = retryable;
    if (detail != null) patch.detail = detail;
    if (resultArtifacts != null) patch.artifacts = resultArtifacts;
    if (resultResults != null) patch.results = resultResults;
    if (plan != null) patch.plan = plan;
    if (spec != null) patch.spec = spec;
    if (visualization != null) patch.visualization = visualization;
    return upsert(calls, id, patch);
  }

  return calls;
}

/** Any tool still running once the stream ends is reported as stopped, not spinning. */
export function settleToolCalls(calls: MobileToolCall[] | undefined): MobileToolCall[] {
  if (!calls?.length) return [];
  return calls.map((call) => (call.status === 'running' ? { ...call, status: 'failed' as ToolStatus } : call));
}
