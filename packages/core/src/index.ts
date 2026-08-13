import type { ChatSseHandlers, Message, Session } from '@socrates/contracts';

export type { ChatSseHandlers, Message, Session } from '@socrates/contracts';

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
  try { parsed = JSON.parse(payload); } catch { /* keep a useful text payload */ }

  if (event === 'error') {
    const value = parsed as { error?: unknown; message?: unknown } | string;
    handlers.onError?.(
      typeof value === 'string'
        ? value
        : typeof value.error === 'string'
          ? value.error
          : typeof value.message === 'string'
            ? value.message
            : 'Stream failed',
    );
    return;
  }

  const toolHandler = {
    tool_use: handlers.onToolUse,
    tool_result: handlers.onToolResult,
    tool_progress: handlers.onToolProgress,
    tool_call_delta: handlers.onToolCallDelta,
    execution_start: handlers.onExecutionStart,
  }[event as 'tool_use' | 'tool_result' | 'tool_progress' | 'tool_call_delta' | 'execution_start'];
  if (toolHandler) {
    toolHandler(parsed as never);
    return;
  }

  const delta = (parsed as { choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }> })
    ?.choices?.[0]?.delta;
  if (typeof delta?.content === 'string') handlers.onDelta?.(delta.content);
  if (typeof delta?.reasoning_content === 'string') handlers.onReasoning?.(delta.reasoning_content);
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

export function messageText(message: Pick<Message, 'rawText' | 'content'>) {
  return message.rawText || message.content || '';
}

export function createDraftSession(id: string, mode: Session['mode'] = 'chat'): Session {
  return {
    id,
    title: null,
    topic: '',
    mode,
    phase: 'topic',
    kind: mode === 'tutor' ? 'tutor' : 'chat',
    messages: [],
    updatedAt: new Date().toISOString(),
  };
}
