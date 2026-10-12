import { dispatchSseFrame, createThinkAwareHandlers } from './sseClient';
import { SPLIT_THINK_TURN, STOP_DURING_THINK_TURN } from './fixtures/assistantTurns';
import { createMobileStreamPlayer } from './streamPlayer';

describe('native SSE playback parity fixture', () => {
  let now: number;
  let frames: Array<() => void>;

  beforeEach(() => {
    now = 0;
    frames = [];
  });

  function makePlayer(onDone = jest.fn()) {
    const visible: string[] = [];
    const player = createMobileStreamPlayer({
      now: () => now,
      raf: (callback) => { frames.push(callback); },
      onFrame: (text) => visible.push(text),
      onDone,
    });
    return { player, visible, onDone };
  }

  function advanceFrame() {
    const next = frames.shift();
    if (!next) throw new Error('expected a scheduled animation frame');
    now += 1000 / 60;
    next();
  }

  it('shows the first prose prefix on the first frame and drains naturally after [DONE]', () => {
    const reasoning: string[] = [];
    const { player, visible, onDone } = makePlayer();
    const routed = createThinkAwareHandlers({
      onDelta: (delta) => player.push(delta),
      onReasoning: (delta) => reasoning.push(delta),
      onDone: () => player.beginDrain(),
    });

    for (const frame of SPLIT_THINK_TURN) dispatchSseFrame(frame, routed.handlers);
    expect(visible).toEqual([]);
    advanceFrame();
    expect(visible[0]).toMatch(/^H/);

    let guard = 0;
    while (frames.length && guard++ < 500) advanceFrame();
    expect(guard).toBeLessThan(500);
    expect(visible.at(-1)).toBe('Hi answer still.');
    expect(reasoning.join('')).toBe('private thought');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(visible.every((prefix, index) => index === 0 || visible[index - 1].length <= prefix.length)).toBe(true);
  });

  it('coalesces display commits below the device refresh rate while keeping the first prefix', () => {
    const { player, visible } = makePlayer();
    player.push('x'.repeat(1000));
    advanceFrame();
    expect(visible).toHaveLength(1);
    for (let index = 0; index < 6; index += 1) advanceFrame();
    expect(visible.length).toBeLessThan(7);
    expect(visible.at(-1)?.length).toBeGreaterThan(visible[0].length);
  });

  it('reveals pre-tool prose immediately without ending playback of the final answer', () => {
    const { player, visible, onDone } = makePlayer();
    player.push('I will check that for you.');
    player.revealBufferedNow();
    expect(visible).toEqual(['I will check that for you.']);
    expect(onDone).not.toHaveBeenCalled();

    player.push(' Here is the result.');
    player.beginDrain();
    let guard = 0;
    while (frames.length && guard++ < 500) advanceFrame();
    expect(guard).toBeLessThan(500);
    expect(visible.at(-1)).toBe('I will check that for you. Here is the result.');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Stop flushes arrived prose synchronously and moves partial think content to reasoning', () => {
    const reasoning: string[] = [];
    const { player, visible, onDone } = makePlayer();
    const routed = createThinkAwareHandlers({
      onDelta: (delta) => player.push(delta),
      onReasoning: (delta) => reasoning.push(delta),
      onDone: () => player.beginDrain(),
    });

    for (const frame of STOP_DURING_THINK_TURN) dispatchSseFrame(frame, routed.handlers);
    routed.finish();
    player.flushNow();

    expect(visible).toEqual(['Working ']);
    expect(reasoning.join('')).toBe('internal');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(1); // stale scheduled RAF is invalidated by Stop.
    advanceFrame();
    expect(visible).toEqual(['Working ']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Stop before [DONE] synchronously exposes the same split-tag fixture prefix without reclassifying thought', () => {
    const reasoning: string[] = [];
    const { player, visible, onDone } = makePlayer();
    const routed = createThinkAwareHandlers({
      onDelta: (delta) => player.push(delta),
      onReasoning: (delta) => reasoning.push(delta),
      onDone: () => player.beginDrain(),
    });

    for (const frame of SPLIT_THINK_TURN.slice(0, 4)) dispatchSseFrame(frame, routed.handlers);
    routed.finish();
    player.flushNow();

    expect(visible).toEqual(['Hi answer']);
    expect(reasoning.join('')).toBe('private thought');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(player.getState()).toBe('done');
    expect(frames).toHaveLength(1);
  });
});
