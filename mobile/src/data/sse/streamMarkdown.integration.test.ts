declare const require: (specifier: string) => {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
declare const __dirname: string;
const { readFileSync } = require('node:fs');
import { createSettledMarkdownSplitter, parseMarkdown } from '../../render/markdown';
import { dispatchSseFrame, createThinkAwareHandlers } from './sseClient';
import { createMobileStreamPlayer } from './streamPlayer';

const LONG_TURN = readFileSync(
  `${__dirname}/../../../scripts/visual/fixtures/long-assistant-turn.md`,
  'utf8',
).trimEnd();

function contentFrame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function chunkText(source: string, size = 91): string[] {
  const characters = Array.from(source);
  const chunks: string[] = [];
  for (let offset = 0; offset < characters.length; offset += size) {
    chunks.push(characters.slice(offset, offset + size).join(''));
  }
  return chunks;
}

describe('long shared SSE → Markdown fixture', () => {
  let now: number;
  let frames: Array<() => void>;

  beforeEach(() => {
    now = 0;
    frames = [];
  });

  function advanceFrame() {
    const next = frames.shift();
    if (!next) throw new Error('expected a scheduled animation frame');
    now += 1000 / 60;
    next();
  }

  it('shows the first delta promptly, keeps partial tails safe, and drains the same complete chart on Done', () => {
    const completedTurn = `${LONG_TURN}\n\`\`\``;
    const reasoning: string[] = [];
    const visiblePrefixes: string[] = [];
    const settled: string[] = [];
    const splitter = createSettledMarkdownSplitter();
    const done = jest.fn();
    const player = createMobileStreamPlayer({
      now: () => now,
      raf: (callback) => { frames.push(callback); },
      onFrame: (text) => {
        visiblePrefixes.push(text);
        const split = splitter.push(text);
        settled.push(...split.added);
        // Exercise the renderer's active-tail parse at each displayed prefix.
        parseMarkdown(split.tail);
      },
      onDone: done,
    });
    const routed = createThinkAwareHandlers({
      onDelta: (delta) => player.push(delta),
      onReasoning: (delta) => reasoning.push(delta),
      onDone: () => player.beginDrain(),
    });

    // Deliberately split the think tag and every Markdown structure across frames.
    const chunks = ['<thi', 'nk>cohort comparison</think>', ...chunkText(completedTurn)];
    for (const chunk of chunks) dispatchSseFrame(contentFrame(chunk), routed.handlers);
    dispatchSseFrame('data: [DONE]\n\n', routed.handlers);

    expect(visiblePrefixes).toEqual([]);
    advanceFrame();
    expect(visiblePrefixes[0]?.length).toBeGreaterThan(0);
    expect(visiblePrefixes[0].length).toBeLessThan(completedTurn.length);

    let guard = 0;
    while (frames.length && guard++ < 10000) advanceFrame();
    expect(guard).toBeLessThan(10000);
    expect(visiblePrefixes.at(-1)).toBe(completedTurn);
    expect(reasoning.join('')).toBe('cohort comparison');
    expect(done).toHaveBeenCalledTimes(1);
    expect(visiblePrefixes.every((prefix, index) => index === 0 || visiblePrefixes[index - 1].length <= prefix.length)).toBe(true);

    const finalSplit = splitter.push(completedTurn);
    settled.push(...finalSplit.added);
    const incrementallyParsed = settled.flatMap((part) => parseMarkdown(part)).concat(parseMarkdown(finalSplit.tail));
    const parsedFullTurn = parseMarkdown(completedTurn);
    expect(incrementallyParsed).toEqual(parsedFullTurn);
    expect(parsedFullTurn.some((block) => block.type === 'math' && block.closed)).toBe(true);
    expect(parsedFullTurn.some((block) => block.type === 'viz' && block.kind === 'plot' && block.closed)).toBe(true);
  });

  it.each([
    ['an unfinished display-math block', LONG_TURN.slice(0, LONG_TURN.indexOf('$$\n') + 28), 'math'],
    ['the streamed chart block', LONG_TURN, 'viz'],
  ] as const)('Stop flushes the arrived prefix without repairing %s', (_label, partialTurn, expectedType) => {
    const visible: string[] = [];
    const reasoning: string[] = [];
    const done = jest.fn();
    const player = createMobileStreamPlayer({
      now: () => now,
      raf: (callback) => { frames.push(callback); },
      onFrame: (text) => visible.push(text),
      onDone: done,
    });
    const routed = createThinkAwareHandlers({
      onDelta: (delta) => player.push(delta),
      onReasoning: (delta) => reasoning.push(delta),
      onDone: () => player.beginDrain(),
    });

    for (const chunk of ['<thi', 'nk>cohort comparison</think>', ...chunkText(partialTurn)]) {
      dispatchSseFrame(contentFrame(chunk), routed.handlers);
    }
    routed.finish();
    player.flushNow();

    expect(visible).toEqual([partialTurn]);
    expect(reasoning.join('')).toBe('cohort comparison');
    expect(done).toHaveBeenCalledTimes(1);
    const blocks = parseMarkdown(partialTurn);
    expect(blocks.some((block) => block.type === expectedType && !block.closed)).toBe(true);
  });
});
