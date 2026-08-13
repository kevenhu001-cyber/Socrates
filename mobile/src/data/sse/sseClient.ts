import type { ChatRequest, ChatSseHandlers } from '@socrates/contracts';
import { consumeSseBuffer, dispatchChatSseFrame } from '@socrates/core';
import { chatStreamUrl, refreshAccessToken, serializeChatRequest } from '../api/client';
import { readTokens } from '../api/tokenStore';

type XhrLike = XMLHttpRequest & { _socratesLastLength?: number };

export const dispatchSseFrame = dispatchChatSseFrame;

export async function startChatStream(sessionId: string, request: ChatRequest, handlers: ChatSseHandlers) {
  let xhr: XhrLike | null = null;
  let closed = false;
  let attempt = 0;
  let receivedEvent = false;

  const connect = async (): Promise<void> => {
    const tokens = await readTokens();
    // A 401 refresh is asynchronous. The user may have pressed Stop while
    // secure storage was being read, in which case starting a fresh XHR would
    // resurrect an intentionally cancelled stream.
    if (closed) return;
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
      buffer = consumeSseBuffer(buffer, (frame) => {
        if (/^(?:event|data):/m.test(frame)) receivedEvent = true;
        dispatchSseFrame(frame, handlers);
      });
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
          void refreshAccessToken().then((refreshed) => {
            if (closed) return;
            if (refreshed) return connect();
            handlers.onError?.('Session expired');
          }).catch(() => {
            if (!closed) handlers.onError?.('Session expired');
          });
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
        void connect().catch(() => {
          if (!closed) handlers.onError?.('Network unavailable');
        });
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
