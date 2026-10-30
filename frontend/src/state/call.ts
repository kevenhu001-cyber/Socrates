export function createInitialCallState() {
  return { lastCallSource: null as string | null, lastCallError: null as string | null };
}

export type CallState = ReturnType<typeof createInitialCallState>;
