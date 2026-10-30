/* chat/quickActions.ts — Wave 0e of main-js-split plan.
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from main.js region 26 (L8778). Reads the current snapshot and
 * calls global helpers (addMessage, askNextQuestion, saveCurrentSession,
 * getExplanation).
 */

import { stateStore } from '../state/store.ts';
import { getMistakeBookUI } from '../app/widgetSetup.ts';
import { submitChatMessage } from './sendPipeline.ts';
import { parsePracticeInner } from '../render/widgetParsers.ts';
import { getExplanation, askNextQuestion } from '../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { addMessage } from './messages.ts';
import { translate } from './send/runtime.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';

type QuickActionWindow = Window & {
  _currentLang?: string;
};

interface TutorMessage {
  clientId: string;
  role: string;
  rawText?: string;
  type?: string;
  actions?: unknown;
}

function recordTutorMistake(messages: TutorMessage[], index: number, nodeName: string): void {
  const previous = messages.slice(0, index).reverse();
  const question = previous.find((message) => message.role === 'assistant' && message.type !== 'suggest')?.rawText || nodeName;
  const practice = question.match(/<practice\b[^>]*>([\s\S]*?)<\/practice>/i);
  getMistakeBookUI().recordMistake?.({
    type: 'practice',
    q: practice ? parsePracticeInner(practice[1])?.problem || question : question,
    userAnswer: previous.find((message) => message.role === 'user')?.rawText || null,
  });
}

async function handleQuickAction(action: string, messageId: string): Promise<void> {
  if (!['explain', 'skip', 'retry', 'hint', 'mistake'].includes(action)) return;
  const messages = stateStore.read('messages') as TutorMessage[];
  const index = messages.findIndex((message) => message.clientId === messageId);
  if (index < 0 || !Array.isArray(messages[index].actions)) return;
  stateStore.dispatch({ type: 'session/update-message', index, clientId: messageId, patch: { actions: null } });
  publishReactChatRuntime({ type: 'state-synced', reason: 'tutor-action-consumed' });

  const kbNodes = stateStore.read('kbNodes') as Array<{ name?: string; status?: string }>;
  const currentNode = stateStore.read('currentNode') as number;
  const sessionId = stateStore.read('currentSessionId');
  const isZh = (window as QuickActionWindow)._currentLang === 'zh';
  if (action === 'explain') {
    const node = kbNodes[currentNode];
    if (!node) return;
    stateStore.dispatch({
      type: 'state/batch', patch: { explaining: true, substantiveCount: 0 },
    });
    try {
      const expText = await getExplanation(node.status ?? '');
      if (stateStore.read('currentSessionId') !== sessionId) return;
      addMessage('assistant', expText);
    } finally {
      if (stateStore.read('currentSessionId') === sessionId) {
        stateStore.dispatch({ type: 'state/set', key: 'explaining', value: false });
      }
    }
  } else if (action === 'hint') {
    await submitChatMessage(isZh ? '请给我一个提示，不要直接给出完整答案。' : 'Give me one hint without revealing the full solution.', { origin: 'hint' });
  } else if (action === 'mistake') {
    recordTutorMistake(messages, index, kbNodes[currentNode]?.name || '');
  } else if (action === 'skip') {
    /* U-M3 — the button label is "Ask me a different question" (换一道题),
     * but this used to advance currentNode, silently skipping the whole
     * sub-topic. Stay on the same node and generate a fresh question;
     * sub-topic advancement remains the job of the mastery flow. */
    stateStore.dispatch({ type: 'state/batch', patch: { stuckCount: 0, stuckCheckOffered: false, stuckCheckRejected: 0 } });
    await askNextQuestion();
  } else if (action === 'retry') {
    /* U-M3 — label reads "I need to think more" (我再想想), yet the old
     * handler immediately fired a brand-new question — the opposite of
     * letting the student think. Just acknowledge and leave the current
     * question on screen. */
    addMessage('assistant', translate('tutor.takeTime'));
  }
  if (stateStore.read('currentSessionId') === sessionId) saveCurrentSession();
}

export { handleQuickAction };
