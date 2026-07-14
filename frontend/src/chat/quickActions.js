/* chat/quickActions.js — Wave 0e of main-js-split plan.
 * Dispatcher for "quick" option buttons rendered inside assistant messages.
 * Extracted from main.js region 26 (L8778). Reads/writes window.state and
 * calls global helpers (addMessage, askNextQuestion, saveCurrentSession,
 * getExplanation).
 */

async function handleQuickAction(action) {
  var msgs = document.querySelectorAll(".msg.assistant:last-of-type .quick-opts");
  msgs.forEach(function (m) { m.style.display = "none"; });

  var state = window.state;
  if (action === "explain") {
    state.explaining = true;
    state.substantiveCount = 0;
    var node = state.kbNodes[state.currentNode];
    var expText = await window.getExplanation(node.status);
    window.addMessage("assistant", expText);
    setTimeout(function () {
      window.addMessage("assistant", "Does that help clarify things? What questions do you have now?");
      state.explaining = false;
    }, 300);
  } else if (action === "skip") {
    state.currentNode = Math.min(state.currentNode + 1, state.kbNodes.length - 1);
    state.stuckCount = 0;
    state.substantiveCount = 0;
    await window.askNextQuestion();
    window.saveCurrentSession();
  } else if (action === "retry") {
    window.addMessage("assistant", "No problem. Let's try from a different angle.");
    await window.askNextQuestion();
  }
}

export { handleQuickAction };
