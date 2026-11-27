/* chat/quickActions.ts
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from legacy entry. Reads the current snapshot and
 * calls the turn and session helpers it imports directly.
 */

import { dispatchPatches, dispatchSession, kbBridge, sessionBridge } from '../store/index.ts';
import { getMistakeBookUI } from '../app/widgetSetup.ts';
import { submitChatMessage } from './sendPipeline.ts';
import { parsePracticeInner } from '@socrates/core/learn';
import { getExplanation, askNextQuestion } from '../tutor/socraticTurn.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { addMessage } from './messages.ts';
import { translate } from './send/runtime.ts';
import { publishReactChatRuntime } from '../legacy/reactBridge.ts';
import type { ChatMessageShape } from '../state/session.ts';
import { getCurrentLanguage } from '../i18n/languageState.ts';

type TutorMessage = ChatMessageShape;

function recordTutorMistake(messages: TutorMessage[], index: number, nodeName: string): void {
  const previous = messages.slice(0, index).reverse();
  const question =
    previous.find((message) => message.role === 'assistant' && message.type !== 'suggest')
      ?.rawText || nodeName;
  const practice = question.match(/<practice\b[^>]*>([\s\S]*?)<\/practice>/i);
  getMistakeBookUI().recordMistake?.({
    type: 'practice',
    q: practice ? parsePracticeInner(practice[1])?.problem || question : question,
    userAnswer: previous.find((message) => message.role === 'user')?.rawText || null,
  });
}

async function explainCurrentNode(
  kbNodes: Array<{ name?: string; status?: string }>,
  currentNode: number,
  sessionId: unknown,
): Promise<boolean> {
  const node = kbNodes[currentNode];
  if (!node) return false;
  dispatchPatches({ session: { explaining: true, substantiveCount: 0 } });
  try {
    const explanation = await getExplanation(node.status ?? '');
    if (sessionBridge.getSnapshot().currentSessionId !== sessionId) return false;
    addMessage('assistant', explanation);
  } finally {
    if (sessionBridge.getSnapshot().currentSessionId === sessionId) {
      dispatchSession({ type: 'session/set', key: 'explaining', value: false });
    }
  }
  return true;
}

async function handleQuickAction(action: string, messageId: string): Promise<void> {
  if (!['explain', 'skip', 'retry', 'hint', 'mistake'].includes(action)) return;
  const messages: TutorMessage[] = sessionBridge.getSnapshot().messages;
  const index = messages.findIndex((message) => message.clientId === messageId);
  if (index < 0 || !Array.isArray(messages[index].actions)) return;
  dispatchSession({
    type: 'session/update-message',
    index,
    clientId: messageId,
    patch: { actions: null },
  });
  publishReactChatRuntime({ type: 'state-synced', reason: 'tutor-action-consumed' });

  const kbNodes = kbBridge.getSnapshot().kbNodes as Array<{ name?: string; status?: string }>;
  const currentNode = kbBridge.getSnapshot().currentNode as number;
  const sessionId = sessionBridge.getSnapshot().currentSessionId;
  const isZh = getCurrentLanguage() === 'zh';
  switch (action) {
    case 'explain': {
      if (!(await explainCurrentNode(kbNodes, currentNode, sessionId))) return;
      break;
    }
    case 'hint':
      await submitChatMessage(
        isZh
          ? '请给我一个提示，不要直接给出完整答案。'
          : 'Give me one hint without revealing the full solution.',
        { origin: 'hint' },
      );
      break;
    case 'mistake':
      recordTutorMistake(messages, index, kbNodes[currentNode]?.name || '');
      break;
    case 'skip':
      /* U-M3 — the button label is "Ask me a different question" (换一道题),
       * but this used to advance currentNode, silently skipping the whole
       * sub-topic. Stay on the same node and generate a fresh question;
       * sub-topic advancement remains the job of the mastery flow. */
      dispatchPatches({
        session: { stuckCount: 0, stuckCheckOffered: false, stuckCheckRejected: 0 },
      });
      await askNextQuestion();
      break;
    case 'retry':
      /* U-M3 — label reads "I need to think more" (我再想想), yet the old
       * handler immediately fired a brand-new question — the opposite of
       * letting the student think. Just acknowledge and leave the current
       * question on screen. */
      addMessage('assistant', translate('tutor.takeTime'));
      break;
  }
  if (sessionBridge.getSnapshot().currentSessionId === sessionId) saveCurrentSession();
}

export { handleQuickAction };
