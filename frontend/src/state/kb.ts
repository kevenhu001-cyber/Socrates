export interface KbNode {
  name: string;
  status: string;
  questions: number;
  [key: string]: unknown;
  system_note?: string;
  user_note?: string;
  confidence_score?: number;
  history?: unknown[];
}
export interface BoundarySnapshot {
  date?: string;
  at?: number;
  summary?: string;
  counts?: Record<string, number>;
}
export interface MistakeStateEntry {
  id: string;
  type: string;
  topic: string;
  q: string;
  options: Array<string | { letter?: string; text?: string }>;
  correct: string | null;
  userAnswer: string | null;
  timestamp: number;
  source?: string;
  node?: string;
  nodeIdx?: number;
  judgedAnswer?: string | null;
  redoCount?: number;
  quizSlotId?: string | null;
  resolved?: boolean;
  isResolved?: boolean;
}

export function createInitialKbState() {
  return {
    kbNodes: [] as KbNode[],
    currentNode: 0,
    mistakes: [] as MistakeStateEntry[],
    boundariesHistory: [] as BoundarySnapshot[],
    boundariesSavedAt: 0,
    mistakeFilter: 'all',
  };
}

export type KbState = ReturnType<typeof createInitialKbState>;
