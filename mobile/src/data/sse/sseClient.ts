import { fetch as streamFetch } from 'expo/fetch';
import type { ChatRequest, ChatSseHandlers, JsonValue } from '@socrates/contracts';
import { consumeSseBuffer, dispatchChatSseFrame } from '@socrates/core';
import { chatStreamUrl, refreshAccessToken, serializeChatRequest } from '../api/client';
import { readTokens } from '../api/tokenStore';
import { createInlineThinkRouter } from './inlineThinkRouter';

export interface MobileChatSseHandlers extends ChatSseHandlers {
  /** Server Workspace Agent stage events are not in the shared core protocol yet. */
  onAgentStep?: (payload: JsonValue) => void;
}

/** Wrap the shared SSE contract so inline model thought never enters Markdown. */
export function createThinkAwareHandlers(handlers: MobileChatSseHandlers) {
  const router = createInlineThinkRouter(handlers.onDelta, handlers.onReasoning);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    router.finish();
  };
  return {
    handlers: {
      ...handlers,
      onDelta: (delta: string) => router.push(delta),
      onDone: () => { finish(); handlers.onDone?.(); },
      onError: (message: string) => { finish(); handlers.onError?.(message); },
    } satisfies MobileChatSseHandlers,
    finish,
  };
}

/**
 * Keep common event routing in `@socrates/core`; narrowly adapt the server's
 * existing `agent_step` event here so Explore stages work without widening the
 * shared contract or changing the Web client.
 */
export function dispatchSseFrame(frame: string, handlers: MobileChatSseHandlers) {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  if (event === 'agent_step' && data.length) {
    try {
      const payload = JSON.parse(data.join('\n')) as Record<string, unknown>;
      if (payload.type === 'step' && typeof payload.id === 'string' && typeof payload.stepId === 'string') {
        handlers.onAgentStep?.(payload as JsonValue);
      }
    } catch {
      handlers.onError?.('Malformed SSE JSON payload for event: agent_step');
    }
    return;
  }
  dispatchChatSseFrame(frame, handlers);
}

/* The previous transport drove SSE over `XMLHttpRequest`. On Android that is
 * unreliable for server-sent events: RN only publishes incremental
 * `responseText` under narrow conditions, and on several devices/proxies no
 * bytes surface until the response completes — the chat then renders nothing
 * while the server is already streaming. `expo/fetch` is a WinterCG fetch
 * whose `body` is a real `ReadableStream<Uint8Array>`, so deltas arrive the
 * moment they hit the socket, matching the web client's `fetch` reader loop.
 */
const CONNECT_TIMEOUT_MS = 30000;

export async function startChatStream(sessionId: string | null, request: ChatRequest, handlers: MobileChatSseHandlers) {
  let closed = false;
  let attempt = 0;
  let receivedEvent = false;
  let doneSeen = false;
  let errorSeen = false;
  const controller = new AbortController();
  const thinkAware = createThinkAwareHandlers(handlers);

  /* Only an explicit protocol terminal frame is natural completion. A clean
   * EOF without [DONE] is a truncated response, not a successful answer. */
  const tracked: MobileChatSseHandlers = {
    ...thinkAware.handlers,
    onError: (message) => {
      if (closed || errorSeen || doneSeen) return;
      errorSeen = true;
      thinkAware.handlers.onError?.(message);
    },
    onDone: () => {
      if (closed || doneSeen || errorSeen) return;
      doneSeen = true;
      thinkAware.handlers.onDone?.();
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
      if (!closed) tracked.onError?.('Network unavailable');
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
        tracked.onError?.('Network unavailable');
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
        tracked.onError?.('Session expired');
        return;
      }
      if (status >= 400) {
        tracked.onError?.(`Stream failed (${status})`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        tracked.onError?.('Stream unavailable');
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
            if (doneSeen || errorSeen || closed) return;
            if (/^(?:event|data):/m.test(frame)) receivedEvent = true;
            dispatchSseFrame(frame, tracked);
          });
          // Stop on either terminal outcome. Do not dispatch later frames from
          // the same network chunk after [DONE] or a protocol/server error.
          if (doneSeen || errorSeen || closed) {
            try { await reader.cancel(); } catch { /* closing anyway */ }
            return;
          }
        }
      } catch {
        // A user Stop aborts the request and must remain a stopped outcome.
        // Other body read failures preserve dispatched deltas but are errors.
        if (closed) return;
        if (!doneSeen && !errorSeen) tracked.onError?.('Network unavailable');
        return;
      }
      if (closed || errorSeen || doneSeen) return;
      // Per SSE, an event is dispatched only after its blank-line delimiter.
      // Never reinterpret an unterminated tail as a complete answer frame.
      tracked.onError?.('Stream ended before [DONE]');
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

  /* Resolve the cancellation handle before asynchronous secure-storage/token
   * work. Otherwise Stop can finalize the UI while `readTokens()` is pending,
   * then briefly start a request before the late handle is aborted. */
  void connect().catch((error: unknown) => {
    if (closed) return;
    tracked.onError?.(error instanceof Error ? error.message : 'Network unavailable');
  });

  return () => {
    closed = true;
    thinkAware.finish();
    controller.abort();
  };
}
