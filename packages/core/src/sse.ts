import type { ChatSseHandlers } from '@socrates/contracts';

/**
 * Parse one complete SSE frame. This is deliberately free of XMLHttpRequest,
 * fetch, React, and platform storage so Web, Android, and desktop clients can
 * use exactly the same event routing semantics.
 */
export function dispatchChatSseFrame(frame: string, handlers: ChatSseHandlers) {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  const payload = data.join('\n');
  if (payload === '[DONE]') {
    handlers.onDone?.();
    return;
  }

  let parsed: unknown = payload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    /* keep a useful text payload */
  }

  if (event === 'error') {
    const value =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const message =
      typeof parsed === 'string'
        ? parsed
        : typeof value?.message === 'string'
          ? value.message
          : typeof value?.error === 'string'
            ? value.error
            : 'Stream failed';
    const details: import('@socrates/contracts').ChatStreamError = {
      message,
      ...(typeof value?.status === 'number' &&
      Number.isInteger(value.status) &&
      value.status >= 100 &&
      value.status <= 599
        ? { status: value.status }
        : {}),
      ...(typeof value?.code === 'string' ? { code: value.code } : {}),
      ...(typeof value?.retryable === 'boolean' ? { retryable: value.retryable } : {}),
      ...(typeof value?.upstreamStatus === 'number' &&
      Number.isInteger(value.upstreamStatus) &&
      value.upstreamStatus >= 100 &&
      value.upstreamStatus <= 599
        ? { upstreamStatus: value.upstreamStatus }
        : {}),
      ...(typeof value?.retryAfterMs === 'number' &&
      Number.isFinite(value.retryAfterMs) &&
      value.retryAfterMs >= 0
        ? { retryAfterMs: Math.round(value.retryAfterMs) }
        : {}),
    };
    handlers.onError?.(message, details);
    return;
  }

  const toolHandler = {
    tool_use: handlers.onToolUse,
    tool_result: handlers.onToolResult,
    tool_progress: handlers.onToolProgress,
    tool_call_delta: handlers.onToolCallDelta,
    execution_start: handlers.onExecutionStart,
    tool_approval: handlers.onToolApproval,
    turn_activity: handlers.onTurnActivity,
    turn_event: handlers.onTurnEvent,
    turn_summary: handlers.onTurnSummary,
  }[
    event as
      | 'tool_use'
      | 'tool_result'
      | 'tool_progress'
      | 'tool_call_delta'
      | 'execution_start'
      | 'tool_approval'
      | 'turn_activity'
      | 'turn_event'
      | 'turn_summary'
  ];
  if (toolHandler) {
    toolHandler(parsed as never);
    return;
  }

  const delta = (
    parsed as {
      choices?: Array<{
        delta?: {
          content?: unknown;
          reasoning_content?: unknown;
          reasoning?: unknown;
          thinking?: unknown;
        };
      }>;
    }
  )?.choices?.[0]?.delta;
  if (typeof delta?.content === 'string') handlers.onDelta?.(delta.content);
  const rawReasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking;
  const reasoning =
    typeof rawReasoning === 'string'
      ? rawReasoning
      : rawReasoning !== null &&
          typeof rawReasoning === 'object' &&
          !Array.isArray(rawReasoning) &&
          'text' in rawReasoning &&
          typeof rawReasoning.text === 'string'
        ? rawReasoning.text
        : '';
  if (reasoning) handlers.onReasoning?.(reasoning);
}

/** Split an SSE response buffer while preserving an incomplete trailing frame. */
export function consumeSseBuffer(buffer: string, onFrame: (frame: string) => void) {
  let rest = buffer;
  const separator = /\r?\n\r?\n/;
  let match = separator.exec(rest);
  while (match) {
    onFrame(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
    match = separator.exec(rest);
  }
  return rest;
}
