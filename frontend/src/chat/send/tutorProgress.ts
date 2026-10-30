import { stateStore } from '../../state/store.ts';
import { askNextQuestion } from '../../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../../session/persistence.ts';
import { updateKB } from '../../ui/knowledgePanel.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { addAnchoredAssistant, getTutorSocratic } from './runtime.ts';
import {
  countsTowardTutorProgress,
  isSubstantiveTutorAnswer,
  nextTutorStage,
  tutorNodeProgressDecision,
  type TutorTurnOptions,
} from './tutorPolicy.ts';
import type { KbNode, TeachingPlan } from '../teachingPlan.ts';

function renderTutorProgress(method: string, context: string): void {
  const tutor = getTutorSocratic() as Record<string, unknown> | null | undefined;
  if (!tutor || typeof tutor[method] !== 'function') return;
  try { (tutor[method] as () => void)(); }
  catch (error) { reportSwallow(error, context); }
}

export function recordTutorProgress(
  text: string,
  options: TutorTurnOptions,
): { node: KbNode | null; isSubstantive: boolean } {
  const currentNode = stateStore.read('currentNode') as number;
  const node = (stateStore.read('kbNodes') as KbNode[])[currentNode] || null;
  stateStore.dispatch({
    type: 'state/set',
    key: 'stuckCount',
    value: stateStore.read('stuckCount') + 1,
  });

  if (stateStore.read('teachingStage') === 'exercise') {
    stateStore.dispatch({
      type: 'state/set',
      key: 'practiceAttempts',
      value: (stateStore.read('practiceAttempts') || 0) + 1,
    });
  }

  const isSubstantive = isSubstantiveTutorAnswer(text);
  if (countsTowardTutorProgress(text, options.origin)) {
    stateStore.dispatch({
      type: 'state/set',
      key: 'substantiveCount',
      value: stateStore.read('substantiveCount') + 1,
    });
  }

  const nextStage = nextTutorStage(stateStore.read('teachingStage'), isSubstantive, options.origin);
  if (nextStage) {
    stateStore.dispatch({ type: 'state/set', key: 'teachingStage', value: nextStage });
    if (nextStage === 'exercise') {
      stateStore.dispatch({
        type: 'state/batch',
        patch: { practiceAttempts: 0, practicePhase: 'foundation' },
      });
    }
  }

  renderTutorProgress('renderPracticeProgress', 'sendPipeline.practiceProgress');
  renderTutorProgress('renderTeachingPlan', 'sendPipeline.teachingPlan');
  return { node, isSubstantive };
}

function findNextNodeIndex(node: KbNode): number {
  let nextNodeIndex = -1;
  const plan = stateStore.read('teachingPlan') as TeachingPlan | null;
  const planSubtopics = (plan && plan.subtopics) || [];
  if (planSubtopics.length) {
    const currentPlanIndex = planSubtopics.findIndex((subtopic) => subtopic.name === node.name);
    const nextPlanIndex = planSubtopics.findIndex((subtopic, index) => (
      index > currentPlanIndex && subtopic.status !== 'internalized'
    ));
    if (nextPlanIndex >= 0) {
      const nextSubtopic = planSubtopics[nextPlanIndex]!;
      const nodes = stateStore.read('kbNodes') as KbNode[];
      nextNodeIndex = nodes.findIndex((candidate) => candidate.name === nextSubtopic.name);
      stateStore.dispatch({
        type: 'state/set',
        key: 'session.teachingPlan.currentSubtopicIdx',
        value: nextPlanIndex,
      });
    }
  }

  if (nextNodeIndex < 0) {
    const currentIndex = stateStore.read('currentNode') as number;
    const nodes = stateStore.read('kbNodes') as KbNode[];
    for (let index = currentIndex + 1; index < nodes.length; index += 1) {
      const candidate = nodes[index];
      if (candidate && candidate.status !== 'internalized') {
        nextNodeIndex = index;
        break;
      }
    }
  }
  return nextNodeIndex;
}

export function advanceTutorNodeIfReady(node: KbNode | null, origin?: string | null): boolean {
  if (!node || !tutorNodeProgressDecision({
    node,
    substantiveCount: stateStore.read('substantiveCount'),
    teachingStage: stateStore.read('teachingStage'),
    origin,
  })) return false;

  const updatedNode = Object.assign({}, node, {
    status: 'internalized',
    questions: (typeof node.questions === 'number' ? node.questions : 0) + 1,
  });
  const currentIndex = stateStore.read('currentNode') as number;
  const updatedNodes = (stateStore.read('kbNodes') as KbNode[]).slice();
  updatedNodes[currentIndex] = updatedNode;
  stateStore.dispatch({ type: 'state/set', key: 'kbNodes', value: updatedNodes });
  stateStore.dispatch({ type: 'state/set', key: 'substantiveCount', value: 0 });

  const nextNodeIndex = findNextNodeIndex(updatedNode);
  updateKB();
  if (nextNodeIndex < 0) {
    addAnchoredAssistant(
      "Nice work — you've explored all the key areas of " + stateStore.read('domain')
        + '. Feel free to revisit any node on the left, or start a new topic.',
    );
  } else {
    stateStore.dispatch({
      type: 'state/batch',
      patch: {
        currentNode: nextNodeIndex,
        stuckCount: 0,
        teachingStage: 'motivate',
        currentExampleIdx: 0,
        practiceAttempts: 0,
      },
    });
    const nextNode = (stateStore.read('kbNodes') as KbNode[])[nextNodeIndex]!;
    addAnchoredAssistant('Good depth on **' + updatedNode.name + '**. Let\'s move to the next area: **' + nextNode.name + '**.');
    setTimeout(() => askNextQuestion(), 900);
  }
  saveCurrentSession();
  return true;
}
