export const CALL_FLAT_KEYS = {
  lastCallSource: 'source',
  lastCallError: 'error',
} as const;

export function createInitialCallState() {
  return { source: null, error: null };
}

export type CallState = ReturnType<typeof createInitialCallState>;
