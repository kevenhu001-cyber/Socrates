import type { LegacyChatMessage, ToolCall } from '../react/types/domain';

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
 * a genuinely mutable boundary cannot change data React has already observed.
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
    visualizations: call.visualizations
      ? freezeToolData(call.visualizations)
      : call.visualizations,
  });
}

/**
 * Cut the React rendering boundary away from mutable callers without paying for
 * a second deep copy on the normal state-store path.
 *
 * `createDomainStore` recursively freezes session snapshots and memoizes frozen
 * subtrees. Therefore a frozen message read from `stateStore` is already the
 * immutable graph React needs and can cross this boundary zero-copy. Direct or
 * legacy mutable inputs still take the defensive clone/freeze path below.
 */
export function snapshotMessage(message: LegacyChatMessage): LegacyChatMessage {
  if (Object.isFrozen(message)) return message;

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
    turnRuntime: message.turnRuntime ? freezeToolData(message.turnRuntime) : message.turnRuntime,
    _liveStatus: message._liveStatus
      ? Object.freeze({ ...message._liveStatus })
      : message._liveStatus,
  });
}

/**
 * Reconcile a newly-read message list with the previous React snapshot.
 *
 * The production session-domain list is recursively frozen as one graph. Its
 * list identity is therefore already the canonical immutable transcript
 * snapshot, so it crosses this boundary O(1) with no per-message scan, map, or
 * allocation on streaming frames.
 *
 * `changedMessageIds` remains only as the compatibility invalidation signal for
 * genuinely mutable callers. Those callers can identify a row by either its
 * transient `clientId` or persisted `id`; rows without a stable id are always
 * re-snapshotted rather than being incorrectly matched by array index.
 */
export function reconcileMessageSnapshots(
  previous: ReadonlyArray<LegacyChatMessage>,
  legacy: ReadonlyArray<LegacyChatMessage>,
  changedMessageIds: ReadonlySet<string> | null,
): ReadonlyArray<LegacyChatMessage> {
  if (Object.isFrozen(legacy)) return legacy;

  const previousByKey = new Map<string, LegacyChatMessage>();
  previous.forEach((message) => {
    messageIdentityKeys(message).forEach((key) => previousByKey.set(key, message));
  });

  const next = legacy.map((message) => {
    const keys = messageIdentityKeys(message);
    const previousMessage = keys
      .map((key) => previousByKey.get(key))
      .find((candidate): candidate is LegacyChatMessage => candidate !== undefined);

    if (Object.isFrozen(message)) return message;

    const changed = changedMessageIds === null
      || keys.length === 0
      || keys.some((key) => changedMessageIds.has(key));
    if (!changed && previousMessage) return previousMessage;
    return snapshotMessage(message);
  });

  return Object.freeze(next);
}
