/* chat/quickActions.ts — Wave 0e of main-js-split plan.
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from main.js region 26 (L8778). Reads the current snapshot and
 * calls global helpers (addMessage, askNextQuestion, saveCurrentSession,
 * getExplanation).
 */

import { stateStore } from '../state/store.js';

type QuickActionWindow = Window & {
  getExplanation(status?: string): Promise<string>;
  addMessage(role: string, text: string): string;
  askNextQuestion(): Promise<unknown>;
  saveCurrentSession(): unknown;
};

async function handleQuickAction(action: string): Promise<void> {
  const msgs = document.querySelectorAll('.msg.assistant:last-of-type .quick-opts');
  msgs.forEach(function (m) { (m as HTMLElement).style.display = 'none'; });

  const kbNodes = stateStore.read('kbNodes') as Array<{ name?: string; status?: string }>;
  const currentNode = stateStore.read('currentNode') as number;
  // Boot installs these required actions before message controls are usable.
  const runtime = window as unknown as QuickActionWindow;
  if (action === 'explain') {
    stateStore.dispatch({
      type: 'state/batch', patch: { explaining: true, substantiveCount: 0 },
    });
    const node = kbNodes[currentNode];
    const expText = await runtime.getExplanation(node.status);
    runtime.addMessage('assistant', expText);
    setTimeout(function () {
      runtime.addMessage('assistant', 'Does that help clarify things? What questions do you have now?');
      stateStore.dispatch({ type: 'state/set', key: 'explaining', value: false });
    }, 300);
  } else if (action === 'skip') {
    /* U-M3 — the button label is "Ask me a different question" (换一道题),
     * but this used to advance currentNode, silently skipping the whole
     * sub-topic. Stay on the same node and generate a fresh question;
     * sub-topic advancement remains the job of the mastery flow. */
    stateStore.dispatch({ type: 'state/set', key: 'stuckCount', value: 0 });
    await runtime.askNextQuestion();
    runtime.saveCurrentSession();
  } else if (action === 'retry') {
    /* U-M3 — label reads "I need to think more" (我再想想), yet the old
     * handler immediately fired a brand-new question — the opposite of
     * letting the student think. Just acknowledge and leave the current
     * question on screen. */
    const t = runtime.t;
    runtime.addMessage('assistant',
      typeof t === 'function' ? t('tutor.takeTime') : 'Take your time. There is no rush.');
  }
}

export { handleQuickAction };
