import type { Message } from '@socrates/contracts';
import { createThinkAwareHandlers, dispatchSseFrame, startChatStream } from '../data/sse/sseClient';
import { SPLIT_THINK_TURN } from '../data/sse/fixtures/assistantTurns';
import { createMobileStreamPlayer, type MobileStreamPlayer } from '../data/sse/streamPlayer';
import { appStore, type AppState } from './appStore';

jest.mock('../data/sse/sseClient', () => ({
  ...jest.requireActual('../data/sse/sseClient'),
  startChatStream: jest.fn(),
}));

type StreamTerminal = { kind: 'completed' | 'stopped' | 'error'; message?: string };
type StreamingStoreInternals = {
  setState: (patch: Partial<AppState>) => void;
  streamGeneration: number;
  streamFinished: boolean;
  streamPlayer: MobileStreamPlayer | null;
  streamTerminal: StreamTerminal;
  streamTerminalReceived: boolean;
  clearPendingAssistantPatches: () => void;
  appendAssistant: (delta: string, generation: number) => void;
  addToolEvent: (kind: 'tool_use', payload: unknown, generation: number) => void;
  patchAssistant: (patch: (assistant: Message) => Partial<Message>) => void;
  finishStream: (error?: string, generation?: number) => Promise<void>;
  requestStreamFinish: (terminal: StreamTerminal, generation: number) => void;
};

const internals = appStore as unknown as StreamingStoreInternals;
const mockedStartChatStream = startChatStream as jest.MockedFunction<typeof startChatStream>;

describe('appStore streamed assistant deltas', () => {
  let previousState: AppState;
  let previousGeneration: number;
  let previousFinished: boolean;
  let previousPlayer: MobileStreamPlayer | null;
  let previousTerminal: StreamTerminal;
  let previousTerminalReceived: boolean;
  let now: number;
  let frames: Array<() => void>;

  function installPlayer() {
    internals.streamPlayer = createMobileStreamPlayer({
      now: () => now,
      raf: (callback) => { frames.push(callback); },
      onFrame: (rawText) => internals.patchAssistant(() => ({ rawText, content: rawText })),
      onDone: () => {
        const terminal = internals.streamTerminal;
        void internals.finishStream(terminal.kind === 'error' ? terminal.message : undefined, internals.streamGeneration);
      },
    });
  }

  function advanceFrame() {
    const next = frames.shift();
    if (!next) throw new Error('expected a scheduled animation frame');
    now += 1000 / 60;
    next();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    now = 0;
    frames = [];
    previousState = appStore.getSnapshot();
    previousGeneration = internals.streamGeneration;
    previousFinished = internals.streamFinished;
    previousPlayer = internals.streamPlayer;
    previousTerminal = internals.streamTerminal;
    previousTerminalReceived = internals.streamTerminalReceived;
    internals.streamPlayer?.dispose();
    internals.clearPendingAssistantPatches();
    internals.streamGeneration = 77123;
    internals.streamFinished = false;
    internals.streamTerminal = { kind: 'completed' };
    internals.streamTerminalReceived = false;
    mockedStartChatStream.mockReset();
    internals.setState({
      isIncognito: true,
      isOnline: true,
      isStreaming: true,
      activeSession: {
        id: 'stream-test',
        mode: 'chat',
        messages: [
          { role: 'user', content: 'try again' } as Message,
          { role: 'assistant', type: 'streaming', rawText: '', content: '' } as Message,
        ],
      } as unknown as AppState['activeSession'],
    });
    installPlayer();
  });

  afterEach(() => {
    internals.streamPlayer?.dispose();
    internals.clearPendingAssistantPatches();
    internals.streamPlayer = previousPlayer;
    internals.streamTerminal = previousTerminal;
    internals.streamTerminalReceived = previousTerminalReceived;
    internals.streamGeneration = previousGeneration;
    internals.streamFinished = previousFinished;
    internals.setState(previousState);
    jest.useRealTimers();
  });

  it('shows the first arrived character on the first animation frame, without waiting for cadence timers', () => {
    internals.appendAssistant('你', internals.streamGeneration);
    internals.appendAssistant('好，世界。', internals.streamGeneration);
    expect(appStore.getSnapshot().activeSession?.messages?.at(-1)?.rawText).toBe('');

    advanceFrame();
    expect(appStore.getSnapshot().activeSession?.messages?.at(-1)?.rawText).toMatch(/^你/);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reveals only arrived prose synchronously when tool_use starts, without ending the turn', () => {
    internals.appendAssistant('Visible preamble.', internals.streamGeneration);
    expect(appStore.getSnapshot().activeSession?.messages?.at(-1)?.rawText).toBe('');

    internals.addToolEvent('tool_use', [{ id: 'call-1', name: 'web_search' }], internals.streamGeneration);
    const message = appStore.getSnapshot().activeSession?.messages?.at(-1);
    expect(message?.rawText).toBe('Visible preamble.');
    expect(message?.content).toBe('Visible preamble.');
    expect(appStore.getSnapshot().isStreaming).toBe(true);
    expect(internals.streamFinished).toBe(false);
  });

  it('naturally drains every arrived character and marks the message completed, not stopped', () => {
    internals.appendAssistant('一段分帧回答。', internals.streamGeneration);
    internals.requestStreamFinish({ kind: 'completed' }, internals.streamGeneration);

    let guard = 0;
    while (frames.length && guard++ < 200) advanceFrame();
    const finalMessage = appStore.getSnapshot().activeSession?.messages?.at(-1);
    expect(guard).toBeLessThan(200);
    expect(finalMessage?.rawText).toBe('一段分帧回答。');
    expect(finalMessage?.content).toBe('一段分帧回答。');
    expect(finalMessage?.type).toBe('assistant');
    expect((finalMessage as (Message & { stopped?: boolean }) | undefined)?.stopped).toBeUndefined();
    expect(appStore.getSnapshot().isStreaming).toBe(false);
  });

  it('Stop synchronously flushes the arrived suffix and records a retryable stopped answer', () => {
    internals.appendAssistant('首', internals.streamGeneration);
    internals.appendAssistant('个', internals.streamGeneration);
    internals.appendAssistant('字', internals.streamGeneration);
    internals.appendAssistant('符', internals.streamGeneration);
    appStore.stopGenerating();

    const finalMessage = appStore.getSnapshot().activeSession?.messages?.at(-1);
    expect(finalMessage?.rawText).toBe('首个字符');
    expect(finalMessage?.content).toBe('首个字符');
    expect(finalMessage?.type).toBe('assistant');
    expect((finalMessage as (Message & { stopped?: boolean }) | undefined)?.stopped).toBe(true);
    expect(appStore.getSnapshot().isStreaming).toBe(false);

    // A previously queued frame is invalidated and cannot append late text.
    while (frames.length) advanceFrame();
    expect(appStore.getSnapshot().activeSession?.messages?.at(-1)?.rawText).toBe('首个字符');
  });

  it('drains the arrived prefix and records an interrupted stream as error, not stopped', () => {
    internals.appendAssistant('已到达的部分回答', internals.streamGeneration);
    internals.requestStreamFinish({ kind: 'error', message: 'Stream ended before [DONE]' }, internals.streamGeneration);

    let guard = 0;
    while (frames.length && guard++ < 200) advanceFrame();
    const state = appStore.getSnapshot();
    const finalMessage = state.activeSession?.messages?.at(-1) as (Message & { stopped?: boolean }) | undefined;

    expect(guard).toBeLessThan(200);
    expect(finalMessage?.rawText).toBe('已到达的部分回答');
    expect(finalMessage?.type).toBe('assistant');
    expect(finalMessage?.stopped).toBeUndefined();
    expect(state.isStreaming).toBe(false);
    expect(state.error).toBe('Stream ended before [DONE]');
  });

  it('Resend retries a stopped answer using the same split-think SSE fixture and completes normally', async () => {
    const stoppedMessage = { role: 'assistant', type: 'assistant', rawText: 'old prefix', content: 'old prefix', stopped: true } as Message;
    internals.setState({
      isIncognito: true,
      isOnline: true,
      isStreaming: false,
      activeSession: {
        id: 'stream-test',
        mode: 'chat',
        messages: [{ role: 'user', content: 'try again' } as Message, stoppedMessage],
      } as unknown as AppState['activeSession'],
    });
    mockedStartChatStream.mockImplementation(async (_sessionId, _request, handlers) => {
      const routed = createThinkAwareHandlers(handlers);
      for (const frame of SPLIT_THINK_TURN) dispatchSseFrame(frame, routed.handlers);
      return () => routed.finish();
    });

    await appStore.retryLastResponse();
    expect(mockedStartChatStream).toHaveBeenCalledTimes(1);
    expect(appStore.getSnapshot().activeSession?.messages?.at(-1)?.type).toBe('streaming');

    let guard = 0;
    while (jest.getTimerCount() && guard++ < 200) {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
    }
    const finalMessage = appStore.getSnapshot().activeSession?.messages?.at(-1) as (Message & { stopped?: boolean }) | undefined;
    expect(guard).toBeLessThan(200);
    expect(finalMessage?.rawText).toBe('Hi answer still.');
    expect(finalMessage?.reasoningContent).toBe('private thought');
    expect(finalMessage?.stopped).toBeUndefined();
    expect(appStore.getSnapshot().isStreaming).toBe(false);
  });
});
