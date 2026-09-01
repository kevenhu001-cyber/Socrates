export function createInitialCallState() {
  return { lastCallSource: null, lastCallError: null };
}

export type CallState = ReturnType<typeof createInitialCallState>;
