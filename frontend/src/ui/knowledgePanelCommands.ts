import { dispatchKb, dispatchSession, kbStore } from '../store/index.ts';
import type { BoundarySnapshot, KbNode } from '../state/kb.ts';
import { runtimeWindow as browserWindow } from '../types/runtimeWindow.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;

function saveCurrentSessionSafely(): void {
  try { browserWindow.saveCurrentSession?.(); }
  catch (error) { reportSwallow(error, 'ui/knowledgePanelCommands.saveCurrentSession'); }
}

function scheduleCurrentSessionSave(): void {
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(() => {
    noteSaveTimer = null;
    saveCurrentSessionSafely();
  }, 500);
}

export function patchKnowledgeNode(index: number, patch: Partial<KbNode>): void {
  dispatchKb({ type: 'kb/patch-node', index, patch });
  saveCurrentSessionSafely();
}

export function updateKnowledgeNodeNote(index: number, user_note: string): void {
  dispatchKb({ type: 'kb/patch-node', index, patch: { user_note } });
  scheduleCurrentSessionSave();
}

export async function jumpToKnowledgeNode(index: number): Promise<void> {
  dispatchKb({ type: 'kb/set', key: 'currentNode', value: index });
  dispatchSession({ type: 'session/patch', patch: { stuckCount: 0, substantiveCount: 0 } });
  await browserWindow.askNextQuestion?.();
  saveCurrentSessionSafely();
}

export function saveKnowledgeBoundarySnapshot(): void {
  const { kbNodes, boundariesHistory } = kbStore.getState();
  const counts = { internalized: 0, fuzzy: 0, blank: 0 };
  kbNodes.forEach((node) => {
    const status = node.status === 'internalized' ? 'internalized'
      : node.status === 'fuzzy' ? 'fuzzy' : 'blank';
    counts[status] += 1;
  });

  const snapshot: BoundarySnapshot = {
    date: new Date().toISOString().slice(0, 10),
    at: Date.now(),
    summary: `I ${counts.internalized} · F ${counts.fuzzy} · B ${counts.blank}`,
    counts,
  };
  dispatchKb({
    type: 'kb/patch',
    patch: {
      boundariesHistory: boundariesHistory.concat(snapshot).slice(-30),
      boundariesSavedAt: Date.now(),
    },
  });
  saveCurrentSessionSafely();
}
