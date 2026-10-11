import type { LegacyChatMessage, ToolCall } from './types/domain';

function messageIdentityKeys(message: LegacyChatMessage): ReadonlyArray<string> {
  const keys: string[] = [];
  if (typeof message.clientId === 'string' && message.clientId.length > 0) {
    keys.push(message.clientId);
  }
  if (
    typeof message.id === 'string'
    && message.id.length > 0
    && !keys.includes(message.id)
  ) {
    keys.push(message.id);
  }
  return keys;
}

/**
 * Tool payloads are JSON-shaped, but several React renderers read nested input,
 * result, detail, and visualization fields. Clone + freeze that whole graph so
 * a legacy writer cannot mutate data React has already observed.
 */
function freezeToolData<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;

  const source = value as object;
  const cached = seen.get(source);
  if (cached !== undefined) return cached as T;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(source, copy);
    value.forEach((item) => copy.push(freezeToolData(item, seen)));
    return Object.freeze(copy) as T;
  }

  const copy: Record<string, unknown> = {};
  seen.set(source, copy);
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    copy[key] = freezeToolData(item, seen);
  });
  return Object.freeze(copy) as T;
}

function freezeToolCall(call: ToolCall): ToolCall {
  return Object.freeze({
    ...call,
    input: freezeToolData(call.input),
    detail: freezeToolData(call.detail),
    _run: call._run ? freezeToolData(call._run) : call._run,
    results: call.results ? freezeToolData(call.results) : call.results,
    artifacts: call.artifacts ? freezeToolData(call.artifacts) : call.artifacts,
    visualization: call.visualization
      ? freezeToolData(call.visualization)
      : call.visualization,
  });
}

/**
 * Cut the React rendering boundary away from legacy mutable state.
 *
 * The runtime is still allowed to mutate its own message objects in place,
 * but a published snapshot owns fresh/frozen containers for every rendered
 * nested collection. React therefore never holds the object that legacy code
 * will mutate on the next token/tool update.
 */
export function snapshotMessage(message: LegacyChatMessage): LegacyChatMessage {
  return Object.freeze({
    ...message,
    actions: message.actions
      ? Object.freeze(message.actions.map((action) => Object.freeze({ ...action })))
      : message.actions,
    attachments: message.attachments
      ? Object.freeze(message.attachments.map((attachment) => Object.freeze({ ...attachment })))
      : message.attachments,
    modelInfo: message.modelInfo ? Object.freeze({ ...message.modelInfo }) : message.modelInfo,
    toolCalls: message.toolCalls
      ? Object.freeze(message.toolCalls.map((call) => freezeToolCall(call)))
      : message.toolCalls,
    _liveStatus: message._liveStatus
      ? Object.freeze({ ...message._liveStatus })
      : message._liveStatus,
  });
}

/**
 * Reconcile a newly-read legacy list with the previous immutable snapshot.
 * Only messages named by the event receive a new object identity. Runtime
 * publishers can identify the same row by either its transient `clientId` or
 * its persisted `id`, so both aliases participate in lookup and invalidation.
 * Messages without either id are conservatively re-snapshotted: an index is
 * not a stable identity when rows are inserted or removed.
 *
 * Passing `null` for changedMessageIds is the state-sync escape hatch: every
 * message is snapshotted because an external writer may have changed anything.
 */
export function reconcileMessageSnapshots(
  previous: ReadonlyArray<LegacyChatMessage>,
  legacy: ReadonlyArray<LegacyChatMessage>,
  changedMessageIds: ReadonlySet<string> | null,
): ReadonlyArray<LegacyChatMessage> {
  const previousByKey = new Map<string, LegacyChatMessage>();
  previous.forEach((message) => {
    messageIdentityKeys(message).forEach((key) => previousByKey.set(key, message));
  });

  const next = legacy.map((message) => {
    const keys = messageIdentityKeys(message);
    const previousMessage = keys
      .map((key) => previousByKey.get(key))
      .find((candidate): candidate is LegacyChatMessage => candidate !== undefined);
    const changed = changedMessageIds === null
      || keys.length === 0
      || keys.some((key) => changedMessageIds.has(key));

    if (!changed && previousMessage) return previousMessage;
    return snapshotMessage(message);
  });

  return Object.freeze(next);
}
