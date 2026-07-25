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
    state.currentNode = Math.min(state.currentNode + 1, state.kbNodes.length - 1);
    state.stuckCount = 0;
    state.substantiveCount = 0;
    await (window as any).askNextQuestion();
    (window as any).saveCurrentSession();
  } else if (action === 'retry') {
    (window as any).addMessage('assistant', 'No problem. Let\'s try from a different angle.');
    await (window as any).askNextQuestion();
  }
}

export { handleQuickAction };
