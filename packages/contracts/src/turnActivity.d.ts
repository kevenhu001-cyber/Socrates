/** Public observations only; never excerpts of provider scratch work. */
export type PublicTurnActivity =
  | { type: 'thinking' }
  | { type: 'tool'; toolCallId: string; toolName: string }
  | { type: 'synthesizing' }
  | { type: 'public_reasoning_summary'; text: string }
  | { type: 'done'; durationMs?: number };

