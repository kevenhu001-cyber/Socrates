/* chat/quickActions.ts — Wave 0e of main-js-split plan.
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from main.js region 26 (L8778). Reads the current snapshot and
 * calls global helpers (addMessage, askNextQuestion, saveCurrentSession,
 * getExplanation).
 */

import { stateStore } from '../state/store.js';

async function handleQuickAction(action: string): Promise<void> {
  const msgs = document.querySelectorAll('.msg.assistant:last-of-type .quick-opts');
  msgs.forEach(function (m) { (m as HTMLElement).style.display = 'none'; });

  const kbNodes = stateStore.read('kbNodes') as Array<{ name?: string; status?: string }>;
  const currentNode = stateStore.read('currentNode') as number;
  if (action === 'explain') {
    stateStore.dispatch({
      type: 'state/batch', patch: { explaining: true, substantiveCount: 0 },
    });
    const node = kbNodes[currentNode];
    const expText = await (window as any).getExplanation(node.status);
    (window as any).addMessage('assistant', expText);
    setTimeout(function () {
      (window as any).addMessage('assistant', 'Does that help clarify things? What questions do you have now?');
      stateStore.dispatch({ type: 'state/set', key: 'explaining', value: false });
    }, 300);
  } else if (action === 'skip') {
    /* U-M3 — the button label is "Ask me a different question" (换一道题),
     * but this used to advance currentNode, silently skipping the whole
     * sub-topic. Stay on the same node and generate a fresh question;
     * sub-topic advancement remains the job of the mastery flow. */
    stateStore.dispatch({ type: 'state/set', key: 'stuckCount', value: 0 });
    await (window as any).askNextQuestion();
    (window as any).saveCurrentSession();
  } else if (action === 'retry') {
    /* U-M3 — label reads "I need to think more" (我再想想), yet the old
     * handler immediately fired a brand-new question — the opposite of
     * letting the student think. Just acknowledge and leave the current
     * question on screen. */
    const t = (window as any).t;
    (window as any).addMessage('assistant',
      typeof t === 'function' ? t('tutor.takeTime') : 'Take your time. There is no rush.');
  }
}

export { handleQuickAction };
