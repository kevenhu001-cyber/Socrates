export function resolveNextAppMode(targetMode, currentMode) {
  if (targetMode === 'chat' || targetMode === 'tutor') return targetMode;
  return currentMode === 'tutor' ? 'chat' : 'tutor';
}

export function hasActiveModeSession({ topic, knowledgeNodes, phase, hasRealMessages }) {
  return Boolean(topic)
    || Boolean(knowledgeNodes && knowledgeNodes.length > 0)
    || phase === 'chat'
    || Boolean(hasRealMessages);
}
