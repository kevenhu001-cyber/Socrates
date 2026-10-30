import { stateStore } from '../../state/store.ts';
import { getStoredResponseSpeed, getStoredReasoningEffort, type ReasoningEffort } from '../../config/chatPreferences.ts';
import { getProviderConfigSnapshot } from '../../config/providerConfig.store.ts';
import { resolveEffortRequest } from '../../config/effectiveEffort.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import type { ProviderCapabilities } from '@socrates/contracts';

/** One wire-format message. Providers accept extra fields, so the shape stays open. */
export interface ChatRequestMessage {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface ChatRequestBody {
  messages: ChatRequestMessage[];
  temperature: number;
  max_tokens?: number;
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

/** What the server says the active model can do. Absent means "not
 * published": the request then carries the user's intent and the server
 * resolves it against the real model, which is the only side that knows
 * the built-in model's name. */
function activeProviderCapabilities(): ProviderCapabilities | null {
  try {
    const config = getProviderConfigSnapshot();
    const active = (config.providers || []).find((provider) => provider && provider.id === config.activeId);
    return active?.capabilities ?? null;
  } catch (error) {
    reportSwallow(error, 'chat/api.requestBody.capabilities');
    return null;
  }
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

     The server also publishes what the active model supports, so a stored
     preference the model cannot satisfy (Instant on a model that always
     reasons) never reaches the wire as a request that is bound to fail. */
  const win = window as RequestBodyWindow;
  const raw = (typeof win.getReasoningEffort === 'function' && win.getReasoningEffort())
    || getStoredReasoningEffort();
  /* The legacy bridge is untyped; an unexpected value falls back to the
     stored preference rather than reaching the wire. */
  const effort: ReasoningEffort = raw === 'instant' || raw === 'low' || raw === 'medium' || raw === 'high'
    ? raw
    : getStoredReasoningEffort();
  const request = resolveEffortRequest(effort, activeProviderCapabilities());
  if (request === undefined) return;
  body.reasoning_effort = request;
}

/* Shared by probe, streaming, built-in, and custom-provider requests. */
export function buildChatRequestBody(
  messages: ChatRequestMessage[],
  maxTokens: number | undefined,
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
