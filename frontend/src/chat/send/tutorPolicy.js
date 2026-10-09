const TEACHING_STAGES = ['motivate', 'define', 'develop', 'illustrate', 'exercise', 'check'];

export function isSubstantiveTutorAnswer(text) {
  return String(text || '').length > 40 && String(text || '').split(/\s+/).length > 8;
}

export function countsTowardTutorProgress(text, origin) {
  return isSubstantiveTutorAnswer(text) && origin !== 'quiz' && origin !== 'practice';
}

export function nextTutorStage(currentStage, isSubstantive, origin) {
  if (!isSubstantive || origin === 'quiz' || currentStage === 'check') return null;
  const currentIndex = TEACHING_STAGES.indexOf(currentStage || 'motivate');
  if (currentIndex < 0 || currentIndex >= TEACHING_STAGES.length - 1) return null;
  return TEACHING_STAGES[currentIndex + 1];
}

export function tutorNodeProgressDecision({ node, substantiveCount, teachingStage, origin }) {
  const stageIndex = TEACHING_STAGES.indexOf(teachingStage || 'motivate');
  const exerciseIndex = TEACHING_STAGES.indexOf('exercise');
  return Boolean(node)
    && substantiveCount >= 3
    && !origin
    && stageIndex >= exerciseIndex;
}

export function stuckPromptTransition({ stuckCount, offered, rejected }) {
  if (stuckCount < 3) return { action: 'take-time', patch: null };
  if (offered && rejected >= 1) {
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

