export const SESSION_FLAT_KEYS = [
  'topic', 'phase', 'diagIndex', 'diagAnswers', 'diagQuestions',
  'currentSessionId', 'substantiveCount', 'explaining', 'sessionTitle',
  'domain', 'totalQ', 'stuckCount', 'messages', 'currentProjectId',
  'activeProjectFilter', 'diagCancel', 'teachingStage', 'currentExampleIdx',
  'practiceAttempts', 'practicePhase', 'teachingPlan', 'branchedFrom',
  'stuckCheckOffered', 'stuckCheckRejected', 'fourOptionDialog',
] as const;

export function createInitialSessionState() {
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
