import { stateStore } from '../../state/store.js';
import { getStoredResponseSpeed, getStoredReasoningEffort } from '../../config/chatPreferences.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

/** One wire-format message. Providers accept extra fields, so the shape stays open. */
export interface ChatRequestMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface ChatRequestBody {
  messages: ChatRequestMessage[];
  temperature: number;
  max_tokens: number;
  mode: 'tutor' | 'chat';
  response_speed: string;
  sessionId?: string;
  projectId?: string;
  ragSessionId?: string;
  assistantId?: string;
  extra_body?: { reasoning_split: boolean };
  reasoning_effort?: string;
  [key: string]: unknown;
}

/** Legacy bridges the request builder reads; all optional on non-SPA hosts. */
interface RequestBodyWindow extends Window {
  appMode?: string;
  getCustomInstructionsString?: () => string;
  getReasoningEffort?: () => string;
}

function attachSessionContext(body: ChatRequestBody): void {
  try {
    const sessionId = stateStore.read('currentSessionId') || null;
    const projectId = stateStore.read('currentProjectId') || null;
    if (sessionId) body.sessionId = String(sessionId);
    if (projectId) body.projectId = String(projectId);
    if (sessionId) body.ragSessionId = String(sessionId);
    const assistantId = sessionStorage.getItem('socrates-active-assistant');
    if (assistantId) body.assistantId = assistantId;
  } catch (error) {
    reportSwallow(error, 'chat/api.requestBody.sessionContext');
  }
}

function prependCustomInstructions(body: ChatRequestBody): void {
  const win = window as RequestBodyWindow;
  const instructions = typeof win.getCustomInstructionsString === 'function'
    ? win.getCustomInstructionsString()
    : '';
  if (!instructions) return;
  body.messages.unshift({
    role: 'system',
    content: '[User custom instructions]\n' + instructions,
  });
}

function attachReasoningOptions(body: ChatRequestBody): void {
  /* P_model-capability-registry — the browser expresses INTENT, never a
     provider parameter.

     "Instant" means "do not reason"; how that is encoded belongs to the
     model, and the server is the only side that knows the real model — the
     built-in model's name is deliberately hidden from the browser. The
     browser used to guess the vendor from the model name, which silently
     dropped the user's Low/Medium/High for whole model families
     (deepseek-chat, kimi-k2.6, …) and injected a MiniMax-only
     `reasoning_split` that other providers reject. The server resolves both
     against its capability registry now.

     The level is always sent: the server drops it for a model that does not
     accept one, so an unsupported model costs nothing on the wire. */
  const effort = getStoredReasoningEffort();
  if (effort === 'instant') {
    body.reasoning_effort = 'none';
    return;
  }
  const win = window as RequestBodyWindow;
  body.reasoning_effort = (typeof win.getReasoningEffort === 'function' && win.getReasoningEffort())
    || effort;
}

/* Shared by probe, streaming, built-in, and custom-provider requests. */
export function buildChatRequestBody(
  messages: ChatRequestMessage[],
  maxTokens: number,
  temperature: number,
): ChatRequestBody {
  const body: ChatRequestBody = {
    messages: messages.slice(),
    temperature,
    max_tokens: maxTokens,
    mode: (window as RequestBodyWindow).appMode === 'tutor' ? 'tutor' : 'chat',
    response_speed: getStoredResponseSpeed(),
  };
  attachSessionContext(body);
  prependCustomInstructions(body);
  attachReasoningOptions(body);
  return body;
}
