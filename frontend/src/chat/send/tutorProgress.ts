import { dispatchPatches, dispatchSession, kbBridge, sessionBridge } from '../../store/index.ts';
import { askNextQuestion } from '../../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../../session/persistence.ts';
import { addAnchoredAssistant } from './runtime.ts';
import {
  countsTowardTutorProgress,
  isSubstantiveTutorAnswer,
  nextTutorStage,
  tutorNodeProgressDecision,
  type TutorTurnOptions,
} from './tutorPolicy.ts';
import type { KbNode, TeachingPlan } from '../teachingPlan.ts';

export function recordTutorProgress(
  text: string,
  options: TutorTurnOptions,
): { node: KbNode | null; isSubstantive: boolean } {
  const currentNode = kbBridge.getSnapshot().currentNode as number;
  const node = (kbBridge.getSnapshot().kbNodes as KbNode[])[currentNode] || null;
  dispatchSession({
    type: 'session/set',
    key: 'stuckCount',
    value: sessionBridge.getSnapshot().stuckCount + 1,
  });

  if (sessionBridge.getSnapshot().teachingStage === 'exercise') {
    dispatchSession({
      type: 'session/set',
      key: 'practiceAttempts',
      value: (sessionBridge.getSnapshot().practiceAttempts || 0) + 1,
    });
  }

  const isSubstantive = isSubstantiveTutorAnswer(text);
  if (countsTowardTutorProgress(text, options.origin)) {
    dispatchSession({
      type: 'session/set',
      key: 'substantiveCount',
      value: sessionBridge.getSnapshot().substantiveCount + 1,
    });
  }

  const nextStage = nextTutorStage(
    sessionBridge.getSnapshot().teachingStage,
    isSubstantive,
    options.origin,
  );
  if (nextStage) {
    dispatchSession({ type: 'session/set', key: 'teachingStage', value: nextStage });
    if (nextStage === 'exercise') {
      dispatchPatches({ session: { practiceAttempts: 0, practicePhase: 'foundation' } });
    }
  }

  return { node, isSubstantive };
}

function findNextNodeIndex(node: KbNode): number {
  let nextNodeIndex = -1;
  const plan = sessionBridge.getSnapshot().teachingPlan as TeachingPlan | null;
  const planSubtopics = (plan && plan.subtopics) || [];
  if (planSubtopics.length) {
    const currentPlanIndex = planSubtopics.findIndex((subtopic) => subtopic.name === node.name);
    const nextPlanIndex = planSubtopics.findIndex(
      (subtopic, index) => index > currentPlanIndex && subtopic.status !== 'internalized',
    );
    if (nextPlanIndex >= 0) {
      const nextSubtopic = planSubtopics[nextPlanIndex]!;
      const nodes = kbBridge.getSnapshot().kbNodes as KbNode[];
      nextNodeIndex = nodes.findIndex((candidate) => candidate.name === nextSubtopic.name);
      dispatchSession({
        type: 'session/patch',
        patch: { teachingPlan: { ...(plan as TeachingPlan), currentSubtopicIdx: nextPlanIndex } },
      });
    }
  }

  if (nextNodeIndex < 0) {
    const currentIndex = kbBridge.getSnapshot().currentNode as number;
    const nodes = kbBridge.getSnapshot().kbNodes as KbNode[];
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
  if (
    !node ||
    !tutorNodeProgressDecision({
      node,
      substantiveCount: sessionBridge.getSnapshot().substantiveCount,
      teachingStage: sessionBridge.getSnapshot().teachingStage,
      origin,
    })
  )
    return false;

  /* This threshold advances the lesson sequence; message length and turn
     count are not evidence of mastery. Leave the KB status and assessed
     question count unchanged until a learning check records that evidence. */
  dispatchSession({ type: 'session/set', key: 'substantiveCount', value: 0 });

  const nextNodeIndex = findNextNodeIndex(node);
  if (nextNodeIndex < 0) {
    addAnchoredAssistant(
      "Nice work — you've worked through the current learning path for " +
        sessionBridge.getSnapshot().domain +
        '. Revisit any idea or use a practice check to see what you can recall independently.',
    );
  } else {
    dispatchPatches({
      kb: { currentNode: nextNodeIndex },
      session: {
        stuckCount: 0,
        teachingStage: 'motivate',
        currentExampleIdx: 0,
        practiceAttempts: 0,
      },
    });
    const nextNode = (kbBridge.getSnapshot().kbNodes as KbNode[])[nextNodeIndex]!;
    addAnchoredAssistant(
      'Good work on **' + node.name + "**. Let's move to the next area: **" + nextNode.name + '**.',
    );
    setTimeout(() => askNextQuestion(), 900);
  }
  saveCurrentSession();
  return true;
}
