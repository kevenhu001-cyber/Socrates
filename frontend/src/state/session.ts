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
  tutorAttachments: unknown;
  tutorPartsTemplate: unknown;
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
    tutorAttachments: null,
    tutorPartsTemplate: null,
  };
}

export type SessionState = ReturnType<typeof createInitialSessionState>;
