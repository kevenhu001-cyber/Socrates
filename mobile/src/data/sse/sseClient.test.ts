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
import { readTokens } from '../api/tokenStore';
import { startChatStream } from './sseClient';

const mockedFetch = expoFetch as unknown as jest.Mock;
const mockedRefresh = refreshAccessToken as unknown as jest.Mock;
const mockedReadTokens = readTokens as unknown as jest.Mock;

const encoder = new TextEncoder();

/* `startChatStream` returns its cancellation handle before asynchronous token
 * storage and request setup; response headers, the reader loop, retries, and
 * callbacks continue on the microtask queue afterwards. Tests must drain that
 * queue before asserting on response behaviour. Works under fake timers too. */
async function flush(rounds = 30) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

/** Minimal ReadableStream stand-in; the client only needs body.getReader(). */
function streamBody(chunks: string[], readError?: Error) {
  const queue = chunks.map((chunk) => encoder.encode(chunk));
  return {
    getReader: () => ({
      read: jest.fn(async () => {
        if (queue.length) return { done: false, value: queue.shift() };
        if (readError) throw readError;
        return { done: true, value: undefined };
      }),
      cancel: jest.fn(async () => undefined),
    }),
    cancel: jest.fn(async () => undefined),
  };
}

function okResponse(chunks: string[], status = 200, readError?: Error) {
  return { status, body: streamBody(chunks, readError) };
}

const request = {
  messages: [{ role: 'user', content: 'hi' }],
} as never;

describe('sseClient (expo/fetch transport)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('emits deltas and completes exactly once only after [DONE]', async () => {
    mockedFetch.mockResolvedValue(
      okResponse([
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n',
        'data: {"choices":[{"delta":{"content":"late"}}]}\n\n',
      ]),
    );
    const deltas: string[] = [];
    let done = 0;
    const onError = jest.fn();
    await startChatStream('session', request, {
      onDelta: (text) => deltas.push(text),
      onError,
      onDone: () => {
        done += 1;
      },
    });
    await flush();
    expect(deltas).toEqual(['Hello']);
    expect(done).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  test('routes the existing server agent_step frame through the mobile adapter', async () => {
    mockedFetch.mockResolvedValue(okResponse([
      'event: agent_step\ndata: {"id":"agent-1","type":"step","stepId":"step-1","kind":"search","title":"Find sources","detail":"Searching the topic","status":"running","exitCode":null}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onAgentStep = jest.fn();
    await startChatStream('session', request, { onAgentStep });
    await flush();
    expect(onAgentStep).toHaveBeenCalledWith(expect.objectContaining({
      id: 'agent-1', stepId: 'step-1', title: 'Find sources', status: 'running',
    }));
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

  test('returns a Stop handle before token storage resolves and never starts the cancelled request', async () => {
    let resolveTokens: (value: { accessToken: string; refreshToken: string }) => void = () => undefined;
    mockedReadTokens.mockReturnValueOnce(new Promise((resolve) => { resolveTokens = resolve; }));
    const onError = jest.fn();

    const stop = await startChatStream('session', request, { onError });
    expect(typeof stop).toBe('function');
    stop();
    resolveTokens({ accessToken: 'token', refreshToken: 'refresh' });
    await flush();

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
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

  test('reports EOF without [DONE] as transport truncation, not natural completion', async () => {
    mockedFetch.mockResolvedValue(
      okResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n']),
    );
    const onError = jest.fn();
    const onDone = jest.fn();
    const onDelta = jest.fn();
    await startChatStream('session', request, { onDelta, onError, onDone });
    await flush();
    expect(onDelta).toHaveBeenCalledWith('Hi');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Stream ended before [DONE]');
    expect(onDone).not.toHaveBeenCalled();
  });

  test('a reader rejection after a delta reports error only and keeps the arrived prefix', async () => {
    mockedFetch.mockResolvedValue(okResponse(
      ['data: {"choices":[{"delta":{"content":"prefix"}}]}\n\n'],
      200,
      new Error('body read failed'),
    ));
    const deltas: string[] = [];
    const onError = jest.fn();
    const onDone = jest.fn();

    await startChatStream('session', request, {
      onDelta: (value) => deltas.push(value), onError, onDone,
    });
    await flush();

    expect(deltas).toEqual(['prefix']);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Network unavailable');
    expect(onDone).not.toHaveBeenCalled();
  });

  test('Stop during a body read stays silent to onError/onDone and preserves the prefix', async () => {
    let rejectPendingRead: (error: Error) => void = () => undefined;
    let firstRead = true;
    const body = {
      getReader: () => ({
        read: jest.fn(() => {
          if (firstRead) {
            firstRead = false;
            return Promise.resolve({
              done: false,
              value: encoder.encode('data: {"choices":[{"delta":{"content":"prefix"}}]}\n\n'),
            });
          }
          return new Promise<never>((_resolve, reject) => { rejectPendingRead = reject; });
        }),
        cancel: jest.fn(async () => undefined),
      }),
    };
    mockedFetch.mockImplementation((_url, options) => {
      const signal = (options as { signal: AbortSignal }).signal;
      signal.addEventListener('abort', () => {
        rejectPendingRead(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
      return Promise.resolve({ status: 200, body });
    });
    const deltas: string[] = [];
    const onError = jest.fn();
    const onDone = jest.fn();
    const stop = await startChatStream('session', request, {
      onDelta: (value) => deltas.push(value), onError, onDone,
    });

    await flush();
    expect(deltas).toEqual(['prefix']);
    stop();
    await flush();

    expect(deltas).toEqual(['prefix']);
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  test('a malformed JSON SSE data frame is a protocol error even if [DONE] follows', async () => {
    mockedFetch.mockResolvedValue(okResponse([
      'data: {not-json}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onError = jest.fn();
    const onDone = jest.fn();

    await startChatStream('session', request, { onError, onDone });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Malformed SSE JSON payload for event: message');
    expect(onDone).not.toHaveBeenCalled();
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
