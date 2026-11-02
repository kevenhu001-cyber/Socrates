/**
 * RN-6 — "Practice" on a knowledge-map node: one tutor turn in the
 * server-owned `practice` mode, focused on that node. The model writes the
 * problem; the node's name and its AI definition (when there is one) are
 * the focus it works from.
 */
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import type { KbNode } from '../state/kb.ts';

export function practiceFocus(node: KbNode | undefined): string {
  if (!node || !node.name) return '';
  const definition = typeof node.definition === 'string' && node.definition.trim() ? ` (${node.definition.trim()})` : '';
  return node.name + definition;
}

export async function practiceKnowledgeNode(index: number): Promise<void> {
  const nodes = (stateStore.read('kbNodes') || []) as KbNode[];
  const focus = practiceFocus(nodes[index]);
  if (!focus || stateStore.read('phase') !== 'chat') return;
  try {
    const { runLearningModeTurn } = await import('./socraticTurn.ts');
    await runLearningModeTurn({ learningMode: 'practice', learningFocus: focus });
  } catch (error) {
    reportSwallow(error, 'tutor/knowledgePractice');
  }
}
