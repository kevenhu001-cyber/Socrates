import { fetch as streamFetch } from 'expo/fetch';
import type { Message, Session } from '@socrates/contracts';
import { sessionsApi } from '../data/api/client';
import { readCachedSession } from '../data/offline/sqlite';
import { sessionRepository } from '../data/repositories/sessionRepository';
import { appStore, type AppState } from './appStore';

jest.mock('../data/offline/sqlite', () => jest.requireActual('../data/offline/sqlite.web'));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../data/api/client', () => ({
  chatStreamUrl: jest.fn(() => 'https://example.test/chat/stream'),
  refreshAccessToken: jest.fn(async () => true),
  serializeChatRequest: jest.fn(() => '{}'),
  sessionsApi: { upsert: jest.fn(async (session: Session) => session) },
}));
jest.mock('../data/api/tokenStore', () => ({
  chatStreamUrl: jest.fn(() => 'https://example.test/chat/stream'),
  refreshAccessToken: jest.fn(async () => true),
  serializeChatRequest: jest.fn(() => '{}'),
  sessionsApi: { upsert: jest.fn(async (session: Session) => session) },
}));
jest.mock('../data/api/tokenStore', () => ({
  readCachedUser: jest.fn(async () => null),
  readTokens: jest.fn(async () => ({ accessToken: 'token', refreshToken: 'refresh' })),
}));

type StreamTerminal = { kind: 'completed' | 'stopped' | 'error'; message?: string };
type IntegrationStoreInternals = {
  setState: (patch: Partial<AppState>) => void;
  startAssistantStream: (session: Session, nextMessages: Message[]) => Promise<void>;
  stopStream: (() => void) | null;
  streamGeneration: number;
  streamFinished: boolean;
  streamTerminal: StreamTerminal;
  streamTerminalReceived: boolean;
  streamPlayer: { dispose: () => void } | null;
  clearPendingAssistantPatches: () => void;
  finishStream: (error?: string, generation?: number) => Promise<void>;
};
type ReadResult = { done: false; value: Uint8Array } | { done: true; value?: undefined };
type ReadMode = 'reject' | 'done' | 'hold' | 'malformed-reject';

const internals = appStore as unknown as IntegrationStoreInternals;
const mockedFetch = streamFetch as unknown as jest.Mock;
const mockedSessionsApi = sessionsApi as unknown as { upsert: jest.Mock };
const encoder = new TextEncoder();

function responseBody(mode: ReadMode, delta: string) {
  let reads = 0;
  let rejectPendingRead: ((error: Error) => void) | null = null;
  let pendingRead = false;
  const reader = {
    read: jest.fn((): Promise<ReadResult> => {
      if (reads === 0) {
        reads += 1;
        return Promise.resolve({
          done: false,
          value: encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
        });
      }
      if (reads === 1 && mode === 'done') {
        reads += 1;
        return Promise.resolve({ done: false, value: encoder.encode('data: [DONE]\n\n') });
      }
      if (reads === 1 && mode === 'reject') {
        reads += 1;
        return Promise.reject(new Error('socket reset after partial response'));
      }
      if (reads === 1 && mode === 'malformed-reject') {
        reads += 1;
        return Promise.resolve({
          done: false,
          value: encoder.encode('data: {"choices":[{"delta":{"content":"unterminated'),
        });
      }
      if (reads === 2 && mode === 'malformed-reject') {
        reads += 1;
        return Promise.reject(new Error('socket reset after malformed SSE prefix'));
      }
      pendingRead = true;
      return new Promise((_resolve, reject) => { rejectPendingRead = reject; });
    }),
    cancel: jest.fn(async () => undefined),
  };
  return {
    body: { getReader: () => reader },
    reader,
    get pendingRead() { return pendingRead; },
    abort() { rejectPendingRead?.(new DOMException('Aborted', 'AbortError')); },
  };
}

async function flushMicrotasks(rounds = 80) {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

describe('real SSE transport to AppStore terminal persistence', () => {
  let previousState: AppState;
  let previousGeneration: number;
  let previousFinished: boolean;
  let previousTerminal: StreamTerminal;
  let previousTerminalReceived: boolean;
  let previousPlayer: IntegrationStoreInternals['streamPlayer'];
  let previousStop: (() => void) | null;
  let previousRafDescriptor: PropertyDescriptor | undefined;
  let performanceNowSpy: jest.SpyInstance | null;
  let rafCallbacks: FrameRequestCallback[];
  let now: number;
  let observedTerminals: string[];

  function observeTerminalBeforeFinish() {
    const finishOriginal = internals.finishStream.bind(appStore);
    jest.spyOn(internals, 'finishStream').mockImplementation((error, generation) => {
      observedTerminals.push(internals.streamTerminal.kind);
      return finishOriginal(error, generation);
    });
  }

  function installResponse(mode: ReadMode, delta: string) {
    const scripted = responseBody(mode, delta);
    mockedFetch.mockImplementation((_url, options) => {
      const signal = (options as { signal: AbortSignal }).signal;
      signal.addEventListener('abort', () => scripted.abort(), { once: true });
      return Promise.resolve({ status: 200, body: scripted.body });
    });
    return scripted;
  }

  async function startTurn(id: string) {
    const userMessage = {
      clientId: `user-${id}`,
      role: 'user',
      rawText: 'Please answer this test question.',
      content: 'Please answer this test question.',
      type: 'user',
    } as Message;
    const session = {
      id,
      mode: 'chat',
      topic: 'SSE terminal integration',
      updatedAt: new Date().toISOString(),
      messages: [userMessage],
    } as unknown as Session;
    await internals.startAssistantStream(session, [userMessage]);
    await flushMicrotasks();
  }

  async function drainFrames() {
    for (let i = 0; i < 20; i += 1) {
      await flushMicrotasks();
      const callback = rafCallbacks.shift();
      if (!callback) break;
      now += 1000;
      callback(now);
    }
    await flushMicrotasks();
  }

  beforeEach(() => {
    previousState = appStore.getSnapshot();
    previousGeneration = internals.streamGeneration;
    previousFinished = internals.streamFinished;
    previousTerminal = internals.streamTerminal;
    previousTerminalReceived = internals.streamTerminalReceived;
    previousPlayer = internals.streamPlayer;
    previousStop = internals.stopStream;
    internals.stopStream?.();
    internals.streamPlayer?.dispose();
    internals.clearPendingAssistantPatches();
    internals.streamPlayer = null;
    internals.stopStream = null;
    internals.streamGeneration = 88100;
    internals.streamFinished = false;
    internals.streamTerminal = { kind: 'completed' };
    internals.streamTerminalReceived = false;

    rafCallbacks = [];
    now = 0;
    observedTerminals = [];
    previousRafDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      },
    });
    performanceNowSpy = jest.spyOn(globalThis.performance, 'now').mockImplementation(() => now);

    mockedFetch.mockReset();
    mockedSessionsApi.upsert.mockReset().mockImplementation(async (session: Session) => session);
    internals.setState({
      ...previousState,
      activeSession: null,
      isIncognito: false,
      isStreaming: false,
      error: null,
      selectedComposerPlugins: [],
      activeExtension: null,
      activeTemplate: null,
      webSearchEnabled: false,
      searchContext: '',
      memories: [],
      projects: [],
    });
    observeTerminalBeforeFinish();
  });

  afterEach(() => {
    internals.stopStream?.();
    internals.streamPlayer?.dispose();
    internals.clearPendingAssistantPatches();
    internals.streamPlayer = previousPlayer;
    internals.stopStream = previousStop;
    internals.streamGeneration = previousGeneration;
    internals.streamFinished = previousFinished;
    internals.streamTerminal = previousTerminal;
    internals.streamTerminalReceived = previousTerminalReceived;
    internals.setState(previousState);
    performanceNowSpy?.mockRestore();
    performanceNowSpy = null;
    if (previousRafDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', previousRafDescriptor);
    } else {
      delete (globalThis as unknown as { requestAnimationFrame?: FrameRequestCallback }).requestAnimationFrame;
    }
    jest.restoreAllMocks();
  });

  it('persists a reader-rejected prefix as error, never as natural completion', async () => {
    const save = jest.spyOn(sessionRepository, 'save').mockImplementation(async (session) => session);
    installResponse('reject', 'partial prefix');
    await startTurn('reader-error');
    await drainFrames();

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    const savedMessages = save.mock.calls[0][1];
    const assistant = savedMessages.find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean; completed?: boolean }) | undefined;
    expect(assistant?.rawText).toBe('partial prefix');
    expect(assistant?.type).toBe('assistant');
    expect(assistant?.stopped).toBeUndefined();
    expect(assistant?.completed).toBeUndefined();
    expect(observedTerminals).toEqual(['error']);
    expect(appStore.getSnapshot().isStreaming).toBe(false);
    expect(appStore.getSnapshot().error).toBe('Network unavailable');
  });

  it('persists a [DONE] answer as completed', async () => {
    const save = jest.spyOn(sessionRepository, 'save').mockImplementation(async (session) => session);
    installResponse('done', 'complete prefix');
    await startTurn('done');
    await drainFrames();

    expect(save).toHaveBeenCalledTimes(1);
    const assistant = save.mock.calls[0][1].find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean }) | undefined;
    expect(assistant?.rawText).toBe('complete prefix');
    expect(assistant?.type).toBe('assistant');
    expect(assistant?.stopped).toBeUndefined();
    expect(observedTerminals).toEqual(['completed']);
    expect(appStore.getSnapshot().isStreaming).toBe(false);
    expect(appStore.getSnapshot().error).toBeNull();
  });

  it('keeps [DONE] completed when Stop is pressed during the deterministic playback drain', async () => {
    const save = jest.spyOn(sessionRepository, 'save').mockImplementation(async (session) => session);
    installResponse('done', 'the complete delivered answer');
    await startTurn('done-then-stop');

    expect(internals.streamTerminal.kind).toBe('completed');
    expect(rafCallbacks.length).toBeGreaterThan(0);
    expect(appStore.getSnapshot().isStreaming).toBe(true);

    // No RAF is advanced: Stop lands after [DONE] but before natural drain.
    appStore.stopGenerating();
    await flushMicrotasks();

    const assistant = save.mock.calls[0]?.[1].find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean }) | undefined;
    expect(assistant?.rawText).toBe('the complete delivered answer');
    expect(assistant?.stopped).toBeUndefined();
    expect(observedTerminals).toEqual(['completed']);
    expect(appStore.getSnapshot().isStreaming).toBe(false);
    expect(appStore.getSnapshot().error).toBeNull();
  });

  it('persists a user-stopped prefix as stopped, not error or completion', async () => {
    const save = jest.spyOn(sessionRepository, 'save').mockImplementation(async (session) => session);
    const scripted = installResponse('hold', 'stopped prefix');
    await startTurn('stopped');
    expect(scripted.pendingRead).toBe(true);

    appStore.stopGenerating();
    await flushMicrotasks();

    expect(save).toHaveBeenCalledTimes(1);
    const assistant = save.mock.calls[0][1].find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean }) | undefined;
    expect(assistant?.rawText).toBe('stopped prefix');
    expect(assistant?.stopped).toBe(true);
    expect(observedTerminals).toEqual(['stopped']);
    expect(appStore.getSnapshot().isStreaming).toBe(false);
    expect(appStore.getSnapshot().error).toBeNull();
  });

  it('persists the valid prefix through the real repository when a malformed SSE tail is followed by reader rejection', async () => {
    mockedSessionsApi.upsert.mockImplementation(async (payload: Session) => {
      const messages = (payload.messages || []).map((message) => {
        const { stopped: _stopped, completed: _completed, ...serverMessage } = message as Message & {
          stopped?: boolean;
          completed?: boolean;
        };
        return serverMessage as Message;
      });
      return { ...payload, messages };
    });
    installResponse('malformed-reject', 'valid persisted prefix');
    await startTurn('reader-malformed-persist');
    await drainFrames();

    expect(mockedSessionsApi.upsert.mock.calls).toHaveLength(1);
    const payload = mockedSessionsApi.upsert.mock.calls[0][0] as Session;
    const savedAssistant = payload.messages?.find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean; completed?: boolean }) | undefined;
    expect(savedAssistant?.rawText).toBe('valid persisted prefix');
    expect(savedAssistant?.type).toBe('assistant');
    expect(savedAssistant?.stopped).toBeUndefined();
    expect(savedAssistant?.completed).toBeUndefined();
    expect(observedTerminals).toEqual(['error']);
    expect(appStore.getSnapshot().error).toBe('Network unavailable');

    const cached = readCachedSession('reader-malformed-persist');
    const cachedAssistant = cached?.messages?.find((message) => message.role === 'assistant') as
      (Message & { stopped?: boolean; completed?: boolean }) | undefined;
    expect(cachedAssistant?.rawText).toBe('valid persisted prefix');
    expect(cachedAssistant?.stopped).toBeUndefined();
    expect(cachedAssistant?.completed).toBeUndefined();
  });
});
