jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

jest.mock('../api/client', () => ({
  chatStreamUrl: jest.fn(() => 'https://example.test/chat/stream'),
  refreshAccessToken: jest.fn(async () => true),
  serializeChatRequest: jest.fn(() => '{}'),
}));

jest.mock('../api/tokenStore', () => ({
  readTokens: jest.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' })),
}));

import { fetch as expoFetch } from 'expo/fetch';
import { refreshAccessToken } from '../api/client';
import { startChatStream } from './sseClient';

const mockedFetch = expoFetch as unknown as jest.Mock;
const mockedRefresh = refreshAccessToken as unknown as jest.Mock;

const encoder = new TextEncoder();

/* `startChatStream` resolves as soon as the request is issued (mirroring the
 * old `xhr.send()`); response headers, the reader loop, retries, and error
 * callbacks all continue on the microtask queue afterwards. Tests must drain
 * that queue before asserting on post-response behaviour. Works under fake
 * timers too, unlike a setTimeout-based flush. */
async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** Minimal ReadableStream stand-in; the client only needs body.getReader(). */
function streamBody(chunks: string[]) {
  const queue = chunks.map((chunk) => encoder.encode(chunk));
  return {
    getReader: () => ({
      read: jest.fn(async () =>
        queue.length ? { done: false, value: queue.shift() } : { done: true, value: undefined },
      ),
      cancel: jest.fn(async () => undefined),
    }),
    cancel: jest.fn(async () => undefined),
  };
}

function okResponse(chunks: string[], status = 200) {
  return { status, body: streamBody(chunks) };
}

const request = {
  messages: [{ role: 'user', content: 'hi' }],
} as never;

describe('sseClient (expo/fetch transport)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits deltas and stops reading after [DONE]', async () => {
    mockedFetch.mockResolvedValue(
      okResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"late"}}]}\n\n',
      ]),
    );
    const deltas: string[] = [];
    let done = 0;
    await startChatStream('session', request, {
      onDelta: (text) => deltas.push(text),
      onDone: () => {
        done += 1;
      },
    });
    await flush();
    expect(deltas).toEqual(['Hello']);
    expect(done).toBe(1);
  });

  test('refreshes the token and retries once on a pre-stream 401', async () => {
    mockedFetch
      .mockResolvedValueOnce(okResponse([], 401))
      .mockResolvedValueOnce(okResponse(['data: [DONE]\n\n']));
    const done = jest.fn();
    await startChatStream('session', request, { onDone: done });
    await flush();
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('surfaces "Session expired" when the refresh fails', async () => {
    mockedFetch.mockResolvedValue(okResponse([], 401));
    mockedRefresh.mockResolvedValueOnce(false);
    const onError = jest.fn();
    await startChatStream('session', request, { onError });
    await flush();
    expect(onError).toHaveBeenCalledWith('Session expired');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  test('surfaces non-OK responses as stream failures', async () => {
    mockedFetch.mockResolvedValue(okResponse([], 500));
    const onError = jest.fn();
    await startChatStream('session', request, { onError });
    await flush();
    expect(onError).toHaveBeenCalledWith('Stream failed (500)');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  test('retries a rejected fetch once, then reports the network error', async () => {
    mockedFetch.mockRejectedValue(new Error('socket closed'));
    const onError = jest.fn();
    await startChatStream('session', request, { onError });
    await flush();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith('Network unavailable');
  });

  test('does not retry or call handlers after the caller cancels', async () => {
    let rejectFetch: (error: Error) => void = () => undefined;
    mockedFetch.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectFetch = reject;
        }),
    );
    const onError = jest.fn();
    const onDone = jest.fn();
    const stop = await startChatStream('session', request, { onError, onDone });
    stop();
    rejectFetch(new DOMException('Aborted', 'AbortError'));
    await flush();
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  test('ignores a response that lands after the caller cancels', async () => {
    let resolveFetch: (response: unknown) => void = () => undefined;
    mockedFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onDelta = jest.fn();
    const onDone = jest.fn();
    const stop = await startChatStream('session', request, { onDelta, onDone });
    stop();
    resolveFetch(okResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']));
    await flush();
    expect(onDelta).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  test('settles via onDone when the stream ends without [DONE]', async () => {
    mockedFetch.mockResolvedValue(
      okResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']),
    );
    const onDone = jest.fn();
    await startChatStream('session', request, { onDone });
    await flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('times out a request that never responds', async () => {
    jest.useFakeTimers();
    try {
      mockedFetch.mockImplementation(() => new Promise(() => undefined));
      const onError = jest.fn();
      await startChatStream('session', request, { onError });
      expect(onError).not.toHaveBeenCalled();
      jest.advanceTimersByTime(30000);
      expect(onError).toHaveBeenCalledWith('Network unavailable');
    } finally {
      jest.useRealTimers();
    }
  });

  test('clears the connect timeout once response headers arrive', async () => {
    jest.useFakeTimers();
    try {
      mockedFetch.mockResolvedValue(okResponse(['data: [DONE]\n\n']));
      const onError = jest.fn();
      const onDone = jest.fn();
      await startChatStream('session', request, { onError, onDone });
      await flush();
      jest.advanceTimersByTime(60000);
      expect(onError).not.toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
