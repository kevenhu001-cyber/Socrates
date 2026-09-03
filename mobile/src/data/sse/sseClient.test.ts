jest.mock('../api/client', () => ({
  chatStreamUrl: jest.fn(() => 'https://example.test/chat/stream'),
  refreshAccessToken: jest.fn(),
  serializeChatRequest: jest.fn(() => '{}'),
}));
jest.mock('../api/tokenStore', () => ({
  readTokens: jest.fn(),
}));

import { refreshAccessToken } from '../api/client';
import { readTokens } from '../api/tokenStore';
import { dispatchSseFrame, startChatStream } from './sseClient';

class FakeXhr {
  static instances: FakeXhr[] = [];
  readyState = 1;
  status = 0;
  responseText = '';
  onprogress: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn();
  abort = jest.fn(() => this.onabort?.());

  constructor() { FakeXhr.instances.push(this); }

  complete(status: number) {
    this.status = status;
    this.readyState = 4;
    this.onreadystatechange?.();
  }
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SSE adapter', () => {
  const originalXhr = globalThis.XMLHttpRequest;

  beforeEach(() => {
    FakeXhr.instances = [];
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: FakeXhr });
    (readTokens as jest.Mock).mockResolvedValue({ accessToken: 'ma.test' });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: originalXhr });
    jest.clearAllMocks();
  });

  it('parses CRLF content and reasoning frames', () => {
    const content: string[] = [];
    const reasoning: string[] = [];
    dispatchSseFrame('data: {"choices":[{"delta":{"content":"Hello"}}]}\r\n\r\n', {
      onDelta: (value) => content.push(value),
    });
    dispatchSseFrame('data: {"choices":[{"delta":{"reasoning_content":"Think"}}]}\n\n', {
      onReasoning: (value) => reasoning.push(value),
    });
    expect(content).toEqual(['Hello']);
    expect(reasoning).toEqual(['Think']);
  });

  it('routes tool events and completes on DONE', () => {
    const tools: unknown[] = [];
    let done = 0;
    dispatchSseFrame('event: tool_progress\ndata: {"step":1}\n\n', {
      onToolProgress: (payload) => tools.push(payload),
    });
    dispatchSseFrame('data: [DONE]\n\n', { onDone: () => { done += 1; } });
    expect(tools).toEqual([{ step: 1 }]);
    expect(done).toBe(1);
  });

  it('surfaces structured errors', () => {
    let message = '';
    dispatchSseFrame('event: error\ndata: {"message":"No connection"}\n\n', {
      onError: (value) => { message = value; },
    });
    expect(message).toBe('No connection');
  });

  it('does not reopen a stream after Stop wins a pending 401 refresh', async () => {
    let resolveRefresh: ((value: boolean) => void) | undefined;
    (refreshAccessToken as jest.Mock).mockReturnValue(new Promise<boolean>((resolve) => { resolveRefresh = resolve; }));

    const stop = await startChatStream('session-1', { messages: [] }, {});
    FakeXhr.instances[0].complete(401);
    stop();
    resolveRefresh?.(true);
    await flushPromises();

    expect(FakeXhr.instances).toHaveLength(1);
  });

  it('reopens an untouched stream once its access credential rotates', async () => {
    (refreshAccessToken as jest.Mock).mockResolvedValue(true);

    const stop = await startChatStream('session-1', { messages: [] }, {});
    FakeXhr.instances[0].complete(401);
    await flushPromises();

    expect(FakeXhr.instances).toHaveLength(2);
    stop();
  });

  it('surfaces "Session expired" when a 401 cannot refresh the access token', async () => {
    (refreshAccessToken as jest.Mock).mockResolvedValue(false);
    const errors: string[] = [];
    const stop = await startChatStream('session-1', { messages: [] }, {
      onError: (value) => errors.push(value),
    });
    FakeXhr.instances[0].complete(401);
    await flushPromises();
    expect(errors).toEqual(['Session expired']);
    stop();
  });

  it('surfaces "Session expired" when the refresh promise rejects', async () => {
    (refreshAccessToken as jest.Mock).mockRejectedValue(new Error('refresh failed'));
    const errors: string[] = [];
    const stop = await startChatStream('session-1', { messages: [] }, {
      onError: (value) => errors.push(value),
    });
    FakeXhr.instances[0].complete(401);
    await flushPromises();
    expect(errors).toEqual(['Session expired']);
    stop();
  });

  it('surfaces generic 4xx/5xx as "Stream failed (<status>)" without attempting refresh', async () => {
    (refreshAccessToken as jest.Mock).mockClear();
    const errors: string[] = [];
    const stop = await startChatStream('session-1', { messages: [] }, {
      onError: (value) => errors.push(value),
    });
    FakeXhr.instances[0].complete(500);
    expect(errors).toEqual(['Stream failed (500)']);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    stop();
  });

  it('surfaces "Stream failed (401)" when 401 arrives after partial stream', async () => {
    (refreshAccessToken as jest.Mock).mockClear();
    const errors: string[] = [];
    const stop = await startChatStream('session-1', { messages: [] }, {
      onError: (value) => errors.push(value),
    });
    const xhr = FakeXhr.instances[0];
    xhr.responseText = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n';
    xhr.onprogress?.();
    xhr.complete(401);
    await flushPromises();
    expect(errors).toEqual(['Stream failed (401)']);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    stop();
  });

  it('abort() stops the active stream and prevents further handler calls', async () => {
    const errors: string[] = [];
    let deltaCount = 0;
    const stop = await startChatStream('session-1', { messages: [] }, {
      onDelta: () => { deltaCount += 1; },
      onError: (value) => errors.push(value),
    });
    stop();
    const xhr = FakeXhr.instances[0];
    xhr.complete(500);
    expect(errors).toEqual([]);
    expect(deltaCount).toBe(0);
  });
});
