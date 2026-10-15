export interface KbNode {
  name: string;
  status: string;
  questions: number;
  system_note?: string;
  user_note?: string;
  confidence_score?: number;
  history?: unknown[];
}

export function createInitialKbState() {
  return {
    kbNodes: [] as KbNode[],
    currentNode: 0,
    mistakes: [],
    boundariesHistory: [],
    boundariesSavedAt: 0,
    mistakeFilter: 'all',
  };
}

export type KbState = ReturnType<typeof createInitialKbState>;
