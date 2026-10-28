export type AppMode = 'chat' | 'tutor';

interface ActiveModeSession {
  topic?: unknown;
  knowledgeNodes?: { length: number } | null;
  phase?: unknown;
  hasRealMessages?: unknown;
}

export function resolveNextAppMode(targetMode: unknown, currentMode: AppMode): AppMode {
  if (targetMode === 'chat' || targetMode === 'tutor') return targetMode;
  return currentMode === 'tutor' ? 'chat' : 'tutor';
}

export function hasActiveModeSession({ topic, knowledgeNodes, phase, hasRealMessages }: ActiveModeSession): boolean {
  return Boolean(topic)
    || Boolean(knowledgeNodes && knowledgeNodes.length > 0)
    || phase === 'chat'
    || Boolean(hasRealMessages);
}
