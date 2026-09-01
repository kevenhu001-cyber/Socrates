export function createInitialKbState() {
  return {
    kbNodes: [],
    currentNode: 0,
    mistakes: [],
    boundariesHistory: [],
    boundariesSavedAt: 0,
    mistakeFilter: 'all',
  };
}

export type KbState = ReturnType<typeof createInitialKbState>;
