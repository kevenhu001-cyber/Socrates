/* chat/quickActions.ts — Wave 0e of main-js-split plan.
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from main.js region 26 (L8778). Reads/writes window.state and
 * calls global helpers (addMessage, askNextQuestion, saveCurrentSession,
 * getExplanation).
 */

async function handleQuickAction(action: string): Promise<void> {
  const msgs = document.querySelectorAll('.msg.assistant:last-of-type .quick-opts');
  msgs.forEach(function (m) { (m as HTMLElement).style.display = 'none'; });

  const state = (window as any).state;
  if (action === 'explain') {
    state.explaining = true;
    state.substantiveCount = 0;
    const node = state.kbNodes[state.currentNode];
    const expText = await (window as any).getExplanation(node.status);
    (window as any).addMessage('assistant', expText);
    setTimeout(function () {
      (window as any).addMessage('assistant', 'Does that help clarify things? What questions do you have now?');
      state.explaining = false;
    }, 300);
  } else if (action === 'skip') {
    /* U-M3 — the button label is "Ask me a different question" (换一道题),
     * but this used to advance currentNode, silently skipping the whole
     * sub-topic. Stay on the same node and generate a fresh question;
     * sub-topic advancement remains the job of the mastery flow. */
    state.stuckCount = 0;
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
