import type { Attachment, ChatSseHandlers, JsonValue, Message, Session } from '@socrates/contracts';

export type { ChatSseHandlers, Message, Session } from '@socrates/contracts';

export {
  createToolRunApi,
  pureToolRunApi,
  TOOL_RUN_PHASES,
} from './toolRun.ts';
export type {
  ToolRun,
  ToolRunApi,
  ToolRunSummary,
  ToolRunWasmBinding,
} from './toolRun.ts';

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
    tool_approval: handlers.onToolApproval,
  }[event as 'tool_use' | 'tool_result' | 'tool_progress' | 'tool_call_delta' | 'execution_start' | 'tool_approval'];
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

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

export type ChatHistoryMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string | ChatContentPart[];
  reasoning_content?: string;
};

export const CHAT_HISTORY_MAX_TURNS = 30;
export const CHAT_HISTORY_MAX_CHARS = 2000;

function stripThinking(value: string) {
  return value
    .replace(/^Thinking\.\.\.\s*/i, '')
    .replace(/^Thinking\s*/i, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

function clipped(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value;
}

function attachmentParts(attachments: Attachment[], maxChars?: number): ChatContentPart[] {
  const parts: ChatContentPart[] = [];
  for (const attachment of attachments) {
    if (!attachment) continue;
    if (attachment.kind === 'image' && attachment.dataUrl) {
      parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl, detail: 'auto' } });
      continue;
    }
    if (!attachment.text) continue;
    const text = maxChars === undefined ? attachment.text : clipped(attachment.text, maxChars);
    const label = attachment.kind === 'pdf'
      ? `[Parsed PDF: ${attachment.name}]`
      : attachment.kind === 'text'
        ? `[Parsed file: ${attachment.name}]`
        : attachment.docKind
          ? `[Parsed ${attachment.docKind.toUpperCase()}: ${attachment.name}]`
          : `[Parsed document: ${attachment.name}]`;
    parts.push({ type: 'text', text: `${label}\n${text}` });
  }
  return parts;
}

/**
 * Reconstruct the model-facing content for a user message. The persisted
 * message remains plain text plus attachment metadata, while the request
 * uses OpenAI-compatible content parts whenever the attachment has usable
 * image data or extracted text.
 */
export function buildUserContentParts(rawText: string, attachments?: Attachment[], maxChars?: number): string | ChatContentPart[] {
  const text = maxChars === undefined ? rawText.trim() : clipped(rawText.trim(), maxChars);
  const parts: ChatContentPart[] = text ? [{ type: 'text', text }] : [];
  parts.push(...attachmentParts(attachments || [], maxChars));
  return parts.length > 0 && (parts.length > 1 || (attachments || []).some((attachment) =>
    attachment?.kind === 'image' && Boolean(attachment.dataUrl) || Boolean(attachment?.text)
  )) ? parts : text;
}

/**
 * Build the bounded conversation payload shared by the RN and desktop
 * clients. Older turns are clipped, inline reasoning tags are removed, and
 * stored attachments are reconstructed so retry/regenerate does not degrade
 * a multimodal turn into a text-only prompt.
 */
export function buildChatHistory(messages: Message[], options: { maxTurns?: number; maxChars?: number } = {}): ChatHistoryMessage[] {
  const maxTurns = options.maxTurns ?? CHAT_HISTORY_MAX_TURNS;
  const maxChars = options.maxChars ?? CHAT_HISTORY_MAX_CHARS;
  const source = messages.length > maxTurns * 2 ? messages.slice(-maxTurns * 2) : messages;
  const history: ChatHistoryMessage[] = [];
  for (const message of source) {
    const role: ChatHistoryMessage['role'] = message.role === 'user'
      ? 'user'
      : message.role === 'system'
        ? 'system'
        : 'assistant';
    const raw = stripThinking(messageText(message));
    const content = role === 'user' && message.attachments?.length
      ? buildUserContentParts(raw, message.attachments, maxChars)
      : clipped(raw, maxChars);
    if (!content && !(role === 'user' && message.attachments?.length)) continue;
    const entry: ChatHistoryMessage = { role, content };
    if (message.reasoningContent) entry.reasoning_content = message.reasoningContent;
    history.push(entry);
  }
  return history;
}

/* Keep the export typed as JsonValue-compatible for callers that pass the
 * result directly into ChatRequest without weakening the shared contract. */
export function asChatJsonContent(content: string | ChatContentPart[]): string | JsonValue {
  return content as string | JsonValue;
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
