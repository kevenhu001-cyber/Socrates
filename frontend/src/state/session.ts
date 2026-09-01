export const SESSION_FLAT_KEYS = [
  'topic', 'phase', 'diagIndex', 'diagAnswers', 'diagQuestions',
  'currentSessionId', 'substantiveCount', 'explaining', 'sessionTitle',
  'domain', 'totalQ', 'stuckCount', 'messages', 'currentProjectId',
  'activeProjectFilter', 'diagCancel', 'teachingStage', 'currentExampleIdx',
  'practiceAttempts', 'practicePhase', 'teachingPlan', 'branchedFrom',
  'stuckCheckOffered', 'stuckCheckRejected', 'fourOptionDialog',
] as const;

export type ChatMessageShape = Record<string, unknown> & { clientId?: string };

export function createInitialSessionState(): {
  topic: string;
  phase: string;
  diagIndex: number;
  diagAnswers: unknown[];
  diagQuestions: unknown[];
  currentSessionId: string | null;
  substantiveCount: number;
  explaining: boolean;
  sessionTitle: string | null;
  domain: string | null;
  totalQ: number;
  stuckCount: number;
  branchedFrom: string | null;
  messages: ChatMessageShape[];
  currentProjectId: string | null;
  activeProjectFilter: string | null;
  teachingStage: string;
  currentExampleIdx: number;
  practiceAttempts: number;
  practicePhase: string;
  teachingPlan: unknown;
  stuckCheckOffered: boolean;
  stuckCheckRejected: number;
  fourOptionDialog: unknown;
  diagCancel: boolean;
} {
  return {
    topic: '',
    phase: 'topic',
    diagIndex: 0,
    diagAnswers: [],
    diagQuestions: [],
    currentSessionId: null,
    substantiveCount: 0,
    explaining: false,
    sessionTitle: null,
    domain: null,
    totalQ: 0,
    stuckCount: 0,
    branchedFrom: null,
    messages: [],
    currentProjectId: null,
    activeProjectFilter: null,
    teachingStage: 'motivate',
    currentExampleIdx: 0,
    practiceAttempts: 0,
    practicePhase: 'foundation',
    teachingPlan: null,
    stuckCheckOffered: false,
    stuckCheckRejected: 0,
    fourOptionDialog: null,
    diagCancel: false,
  };
}

export type SessionState = ReturnType<typeof createInitialSessionState>;
