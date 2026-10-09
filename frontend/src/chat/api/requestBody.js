import { stateStore } from '../../state/store.js';
import { isMiniMaxProvider } from '../../config/providers.js';
import { getStoredResponseSpeed } from '../../config/chatPreferences.ts';
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
  if (typeof window.isReasoningProvider !== 'function' || !window.isReasoningProvider()) return;
  body.reasoning_effort = (typeof window.getReasoningEffort === 'function' && window.getReasoningEffort())
    || 'medium';
  /* MiniMax-M3 needs reasoning_split in extra_body to emit reasoning_content. */
  if (isMiniMaxProvider()) body.extra_body = { reasoning_split: true };
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
