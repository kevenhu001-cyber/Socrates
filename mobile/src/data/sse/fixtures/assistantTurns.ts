function contentFrame(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

/** Same turn is consumed by the SSE router and PlaybackClock integration tests. */
export const SPLIT_THINK_TURN = [
  contentFrame('Hi '),
  contentFrame('<thi'),
  contentFrame('nk>private thought</thi'),
  contentFrame('nk>answer'),
  contentFrame(' still.'),
  'data: [DONE]\n\n',
] as const;

/** A user Stop between deltas must expose arrived prose and retain partial reasoning. */
export const STOP_DURING_THINK_TURN = [
  contentFrame('Working '),
  contentFrame('<think>internal'),
] as const;
