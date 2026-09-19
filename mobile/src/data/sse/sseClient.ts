import { fetch as streamFetch } from 'expo/fetch';
import type { ChatRequest, ChatSseHandlers } from '@socrates/contracts';
import { consumeSseBuffer, dispatchChatSseFrame } from '@socrates/core';
import { chatStreamUrl, refreshAccessToken, serializeChatRequest } from '../api/client';
import { readTokens } from '../api/tokenStore';

export const dispatchSseFrame = dispatchChatSseFrame;

/* The previous transport drove SSE over `XMLHttpRequest`. On Android that is
 * unreliable for server-sent events: RN only publishes incremental
 * `responseText` under narrow conditions, and on several devices/proxies no
 * bytes surface until the response completes — the chat then renders nothing
 * while the server is already streaming. `expo/fetch` is a WinterCG fetch
 * whose `body` is a real `ReadableStream<Uint8Array>`, so deltas arrive the
 * moment they hit the socket, matching the web client's `fetch` reader loop.
 */
const CONNECT_TIMEOUT_MS = 30000;

export async function startChatStream(sessionId: string | null, request: ChatRequest, handlers: ChatSseHandlers) {
  let closed = false;
  let attempt = 0;
  let receivedEvent = false;
  let doneSeen = false;
  const controller = new AbortController();

  /* The server always terminates a healthy stream with `data: [DONE]`. If the
   * socket closes without it (proxy cut, server crash) the composer would
   * otherwise stay locked in `isStreaming` forever — EOF settles the stream
   * through the wrapped onDone below. */
  const tracked: ChatSseHandlers = {
    ...handlers,
    onDone: () => {
      if (doneSeen) return;
      doneSeen = true;
      handlers.onDone?.();
    },
  };

  const connect = async (): Promise<void> => {
    const tokens = await readTokens();
    // A 401 refresh is asynchronous. The user may have pressed Stop while
    // secure storage was being read, in which case starting a fresh request
    // would resurrect an intentionally cancelled stream.
    if (closed) return;

    /* Some emulators/sandboxed hosts never resolve DNS or complete the TCP
     * handshake, leaving the request permanently pending with no rejection.
     * Without a guard `isStreaming` would never reset, locking the composer.
     * Fail loudly after a reasonable budget instead. The timer is cleared as
     * soon as response headers land; a mid-stream stall is handled by the
     * caller surface, same as before. */
    let timedOut = false;
    const connectTimer = setTimeout(() => {
      timedOut = true;
      try { controller.abort(); } catch { /* request may not exist yet */ }
      if (!closed) handlers.onError?.('Network unavailable');
    }, CONNECT_TIMEOUT_MS);
    const clearConnectTimer = () => clearTimeout(connectTimer);

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    };
    if (tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

    const onFetchError = () => {
      clearConnectTimer();
      if (closed || timedOut) return;
      if (attempt === 0 && !receivedEvent) {
        attempt += 1;
        void connect();
      } else {
        handlers.onError?.('Network unavailable');
      }
    };

    const onResponse = async (response: { status: number; body: ReadableStream<Uint8Array> | null }) => {
      clearConnectTimer();
      if (closed) return;
      const status = response.status;

      if (status === 401 && attempt === 0 && !receivedEvent) {
        attempt += 1;
        try { await response.body?.cancel(); } catch { /* body may be absent */ }
        let refreshed = false;
        try { refreshed = await refreshAccessToken(); } catch { refreshed = false; }
        if (closed) return;
        if (refreshed) return connect();
        handlers.onError?.('Session expired');
        return;
      }
      if (status >= 400) {
        handlers.onError?.(`Stream failed (${status})`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        handlers.onError?.('Stream unavailable');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      // SSE permits either LF or CRLF line endings. Keep an incomplete frame
      // buffered so a chunk boundary never causes duplicate or lost deltas.
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = consumeSseBuffer(buffer, (frame) => {
            if (/^(?:event|data):/m.test(frame)) receivedEvent = true;
            dispatchSseFrame(frame, tracked);
          });
          // The server sends [DONE] as the terminal frame; anything after it
          // is stray bytes, not content. Stop reading rather than dispatch it.
          if (doneSeen || closed) {
            try { await reader.cancel(); } catch { /* closing anyway */ }
            return;
          }
        }
      } catch {
        // A socket drop mid-stream lands here; fall through to the tail
        // handling so already-received frames are still dispatched.
      }
      const tail = decoder.decode();
      if (tail) buffer += tail;
      if (buffer.trim()) {
        receivedEvent = true;
        dispatchSseFrame(buffer, tracked);
      }
      if (closed) return;
      if (!doneSeen) tracked.onDone?.();
    };

    /* Deliberately not awaited: like the old `xhr.send()`, this only kicks the
     * request off. `onResponse`/`onFetchError` own the rest of the lifecycle
     * so `startChatStream` can hand back the cancel function immediately —
     * awaiting the response here would deadlock `stopGenerating` (the stop
     * callback would only exist once the stream had already finished). */
    void streamFetch(chatStreamUrl(sessionId), {
      method: 'POST',
      headers,
      body: serializeChatRequest(request),
      signal: controller.signal,
    }).then(onResponse).catch(onFetchError);
  };

  await connect();

  return () => {
    closed = true;
    controller.abort();
  };
}
