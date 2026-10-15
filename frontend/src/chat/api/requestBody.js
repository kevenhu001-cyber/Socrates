import { stateStore } from '../../state/store.js';
import { isMiniMaxProvider } from '../../config/providers.js';
import { getStoredResponseSpeed, getStoredReasoningEffort } from '../../config/chatPreferences.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

function attachSessionContext(body) {
  try {
    const sessionId = stateStore.read('currentSessionId') || null;
    const projectId = stateStore.read('currentProjectId') || null;
    if (sessionId) body.sessionId = sessionId;
    if (projectId) body.projectId = projectId;
    if (sessionId) body.ragSessionId = sessionId;
    const assistantId = sessionStorage.getItem('socrates-active-assistant');
    if (assistantId) body.assistantId = assistantId;
  } catch (error) {
    reportSwallow(error, 'chat/api.requestBody.sessionContext');
  }
}

function prependCustomInstructions(body) {
  const instructions = typeof window.getCustomInstructionsString === 'function'
    ? window.getCustomInstructionsString()
    : '';
  if (!instructions) return;
  body.messages.unshift({
    role: 'system',
    content: '[User custom instructions]\n' + instructions,
  });
}

function attachReasoningOptions(body) {
  // Output separation is independent of support for granular effort levels.
  // M3 supports reasoning_split but only adaptive/disabled thinking, so the
  // effort gate must not suppress the reasoning stream needed by the UI.
  if (isMiniMaxProvider()) body.extra_body = { reasoning_split: true };
  const effort = getStoredReasoningEffort();
  if (effort === 'instant') {
    // The server translates Instant using the real configured model, including
    // built-in models whose names are intentionally hidden from the browser.
    body.reasoning_effort = 'none';
    return;
  }
  if (typeof window.isReasoningProvider !== 'function' || !window.isReasoningProvider()) return;
  body.reasoning_effort = (typeof window.getReasoningEffort === 'function' && window.getReasoningEffort())
    || effort;
}

/* Shared by probe, streaming, built-in, and custom-provider requests. */
export function buildChatRequestBody(messages, maxTokens, temperature) {
  const body = {
    messages: messages.slice(),
    temperature,
    max_tokens: maxTokens,
    mode: window.appMode === 'tutor' ? 'tutor' : 'chat',
    response_speed: getStoredResponseSpeed(),
  };
  attachSessionContext(body);
  prependCustomInstructions(body);
  attachReasoningOptions(body);
  return body;
}
