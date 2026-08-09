import type { ChatRequest, ChatSseHandlers } from '@socrates/contracts';
import { chatStreamUrl, refreshAccessToken, serializeChatRequest } from '../api/client';
import { readTokens } from '../api/tokenStore';

type XhrLike = XMLHttpRequest & { _socratesLastLength?: number };

export function dispatchSseFrame(frame: string, handlers: ChatSseHandlers) {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  const payload = data.join('\n');
  if (payload === '[DONE]') { handlers.onDone?.(); return; }
  let parsed: any = payload;
  try { parsed = JSON.parse(payload); } catch { /* error text is still useful */ }

  if (event === 'error') {
    handlers.onError?.(typeof parsed === 'string' ? parsed : parsed?.error || parsed?.message || 'Stream failed');
    return;
  }
  if (event === 'tool_use') { handlers.onToolUse?.(parsed); return; }
  if (event === 'tool_result') { handlers.onToolResult?.(parsed); return; }
  if (event === 'tool_progress') { handlers.onToolProgress?.(parsed); return; }
  if (event === 'tool_call_delta') { handlers.onToolCallDelta?.(parsed); return; }
  if (event === 'execution_start') { handlers.onExecutionStart?.(parsed); return; }
  const delta = parsed?.choices?.[0]?.delta;
  if (typeof delta?.content === 'string') handlers.onDelta?.(delta.content);
  if (typeof delta?.reasoning_content === 'string') handlers.onReasoning?.(delta.reasoning_content);
}

export async function startChatStream(sessionId: string, request: ChatRequest, handlers: ChatSseHandlers) {
  let xhr: XhrLike | null = null;
  let closed = false;
  let attempt = 0;
  let receivedEvent = false;

  const connect = async (): Promise<void> => {
    const tokens = await readTokens();
    xhr = new XMLHttpRequest() as XhrLike;
    let buffer = '';
    let cursor = 0;

    const consume = () => {
      const text = xhr?.responseText || '';
      const next = text.slice(cursor);
      cursor = text.length;
      buffer += next;
      // SSE permits either LF or CRLF line endings. Keep an incomplete frame
      // buffered so a chunk boundary never causes duplicate or lost deltas.
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match && match.index >= 0) {
        const frame = buffer.slice(0, match.index);
        if (/^(?:event|data):/m.test(frame)) receivedEvent = true;
        dispatchSseFrame(frame, handlers);
        buffer = buffer.slice(match.index + match[0].length);
        match = /\r?\n\r?\n/.exec(buffer);
      }
    };

    xhr.open('POST', chatStreamUrl(sessionId));
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (tokens.accessToken) xhr.setRequestHeader('Authorization', `Bearer ${tokens.accessToken}`);
    xhr.onprogress = consume;
    xhr.onreadystatechange = () => {
      if (!xhr || closed) return;
      if (xhr.readyState === 3) consume();
      if (xhr.readyState === 4) {
        consume();
        if (buffer.trim()) { receivedEvent = true; dispatchSseFrame(buffer, handlers); }
        const status = xhr.status;
        xhr = null;
        if (closed) return;
        if (status === 401 && attempt === 0 && !receivedEvent) {
          attempt += 1;
          void refreshAccessToken().then((refreshed) => refreshed ? connect() : handlers.onError?.('Session expired')).catch(() => handlers.onError?.('Session expired'));
          return;
        }
        if (status >= 400) handlers.onError?.(`Stream failed (${status})`);
      }
    };
    xhr.onerror = () => {
      if (closed) return;
      xhr = null;
      if (attempt === 0 && !receivedEvent) {
        attempt += 1;
        void connect().catch(() => handlers.onError?.('Network unavailable'));
      } else handlers.onError?.('Network unavailable');
    };
    xhr.onabort = () => { xhr = null; };
    xhr.send(serializeChatRequest(request));
  };

  await connect();

  return () => {
    closed = true;
    xhr?.abort();
    xhr = null;
  };
}
