import { stateStore } from '../../state/store.js';
import { askNextQuestion } from '../../tutor/socraticTurn.js';
import { saveCurrentSession } from '../../session/persistence.js';
import { updateKB } from '../../ui/knowledgePanel.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { addAnchoredAssistant, getTutorSocratic } from './runtime.js';
import {
  countsTowardTutorProgress,
  isSubstantiveTutorAnswer,
  nextTutorStage,
  tutorNodeProgressDecision,
} from './tutorPolicy.js';

function renderTutorProgress(method, context) {
  const tutor = getTutorSocratic();
  if (!tutor || typeof tutor !== 'object' || typeof tutor[method] !== 'function') return;
  try { tutor[method](); }
  catch (error) { reportSwallow(error, context); }
}

export function recordTutorProgress(text, options) {
  const currentNode = stateStore.read('currentNode');
  const node = stateStore.read('kbNodes')[currentNode];
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

function findNextNodeIndex(node) {
  let nextNodeIndex = -1;
  const planSubtopics = (stateStore.read('teachingPlan') && stateStore.read('teachingPlan').subtopics) || [];
  if (planSubtopics.length) {
    const currentPlanIndex = planSubtopics.findIndex((subtopic) => subtopic.name === node.name);
    const nextPlanIndex = planSubtopics.findIndex((subtopic, index) => (
      index > currentPlanIndex && subtopic.status !== 'internalized'
    ));
    if (nextPlanIndex >= 0) {
      const nextSubtopic = planSubtopics[nextPlanIndex];
      const nodes = stateStore.read('kbNodes');
      nextNodeIndex = nodes.findIndex((candidate) => candidate.name === nextSubtopic.name);
      stateStore.dispatch({
        type: 'state/set',
        key: 'session.teachingPlan.currentSubtopicIdx',
        value: nextPlanIndex,
      });
    }
  }

  if (nextNodeIndex < 0) {
    const currentIndex = stateStore.read('currentNode');
    const nodes = stateStore.read('kbNodes');
    for (let index = currentIndex + 1; index < nodes.length; index += 1) {
      if (nodes[index].status !== 'internalized') {
        nextNodeIndex = index;
        break;
      }
    }
  }
  return nextNodeIndex;
}

export function advanceTutorNodeIfReady(node, origin) {
  if (!tutorNodeProgressDecision({
    node,
    substantiveCount: stateStore.read('substantiveCount'),
    teachingStage: stateStore.read('teachingStage'),
    origin,
  })) return false;

  const updatedNode = Object.assign({}, node, {
    status: 'internalized',
    questions: (node.questions || 0) + 1,
  });
  const currentIndex = stateStore.read('currentNode');
  const updatedNodes = stateStore.read('kbNodes').slice();
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
    const nextNode = stateStore.read('kbNodes')[nextNodeIndex];
    addAnchoredAssistant('Good depth on **' + updatedNode.name + '**. Let\'s move to the next area: **' + nextNode.name + '**.');
    setTimeout(() => askNextQuestion(), 900);
  }
  saveCurrentSession();
  return true;
}
