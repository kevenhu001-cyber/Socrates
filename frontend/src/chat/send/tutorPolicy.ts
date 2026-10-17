export type TeachingStage = 'motivate' | 'define' | 'develop' | 'illustrate' | 'exercise' | 'check';

const TEACHING_STAGES: TeachingStage[] = ['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check'];

export function isSubstantiveTutorAnswer(text: unknown): boolean {
  return String(text || '').length > 40 && String(text || '').split(/\s+/).length > 8;
}

export function countsTowardTutorProgress(text: unknown, origin?: string | null): boolean {
  return isSubstantiveTutorAnswer(text) && origin !== 'quiz' && origin !== 'practice';
}

export function nextTutorStage(
  currentStage: string | null | undefined,
  isSubstantive: boolean,
  origin?: string | null,
): string | null {
  if (!isSubstantive || origin === 'quiz' || currentStage === 'check') return null;
  const currentIndex = TEACHING_STAGES.indexOf((currentStage || 'motivate') as TeachingStage);
  if (currentIndex < 0 || currentIndex >= TEACHING_STAGES.length - 1) return null;
  return TEACHING_STAGES[currentIndex + 1];
}

export function tutorNodeProgressDecision({ node, substantiveCount, teachingStage, origin }: {
  node: unknown;
  substantiveCount: number;
  teachingStage?: string | null;
  origin?: string | null;
}): boolean {
  const stageIndex = TEACHING_STAGES.indexOf((teachingStage || 'motivate') as TeachingStage);
  const exerciseIndex = TEACHING_STAGES.indexOf('exercise');
  return Boolean(node)
    && substantiveCount >= 3
    && !origin
    && stageIndex >= exerciseIndex;
}

export type StuckAction = 'take-time' | 'four-options' | 'explain-prompt';

export interface StuckTransition {
  action: StuckAction;
  patch: Record<string, unknown> | null;
}

export function stuckPromptTransition({ stuckCount, offered, rejected }: {
  stuckCount: number;
  offered?: boolean;
  rejected?: number;
}): StuckTransition {
  if (stuckCount < 3) return { action: 'take-time', patch: null };
  if (offered && rejected !== undefined && rejected >= 1) {
    return {
      action: 'four-options',
      patch: { stuckCount: 0, stuckCheckOffered: false, stuckCheckRejected: 0 },
    };
  }
  if (!offered) {
    return { action: 'explain-prompt', patch: { stuckCheckOffered: true, stuckCount: 0 } };
  }
  return {
    action: 'take-time',
    patch: { stuckCheckRejected: (rejected || 0) + 1, stuckCount: 0 },
  };
}
