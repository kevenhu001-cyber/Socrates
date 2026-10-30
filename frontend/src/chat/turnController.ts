/* Single-turn chat orchestration. Prompt assembly, linked-page preparation,
   and shared stream callbacks live in focused modules beside this entry. */
import { stateStore } from '../state/store.ts';
import { turnState, type StreamingTurnController } from './turnState.ts';
import { interruptPendingTurn, quietTurn } from './turnUi.ts';
import { hasUsableActive } from '../config/providers.ts';
import { extractHistory, type HistoryEntry } from './history.ts';
import { callAPIStream, type StreamResult } from './stream.ts';
import { handleChatApiResult } from './format.ts';
import { offlineGuard } from './offline.ts';
import { toolCallbacksForStream, publishActiveWorkflowFinish } from './toolCallbacks.ts';
import { clearPendingTurn, newClientTurnId, savePendingTurn } from './turnClient.ts';
import { addMessage } from './messages.ts';
import { scheduleTurnToTopForMessage } from './turnAnchor.ts';
import { saveCurrentSession } from '../session/persistence.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { syncSocraticMasteryUI, showSocraticSuggestions } from '../tutor/socraticMastery.ts';
import { buildChatTurnMessages } from './turnPrompt.ts';
import { prepareTurnPageContext } from './turnPageContext.ts';

/** Max tokens stays omitted so the backend uses the active model's limit. */
const MAX_TOKENS_CHAT: undefined = undefined;

interface StreamingMessageOptions {
  userPrompt?: string;
  onRetry?: () => unknown;
}

interface TurnControllerWindow extends Window {
  addStreamingMessage?: (options: StreamingMessageOptions) =>
    StreamingTurnController | Promise<StreamingTurnController>;
}

interface ClientTurnPayload {
  id: string;
  userClientId: string | null;
  assistantClientId: string | null;
  input: { text: string };
}

interface PendingClientTurn {
  sessionId: string | null;
  clientTurn: ClientTurnPayload;
  onTurnBound: (turnId: string) => void;
}

async function addStreamingMessage(options: StreamingMessageOptions): Promise<StreamingTurnController> {
  const bridge = (window as TurnControllerWindow).addStreamingMessage;
  if (typeof bridge === 'function') return await bridge(options);
  throw new Error('addStreamingMessage bridge missing');
}

function addAnchoredAssistant(text: string): string {
  const clientId = addMessage('assistant', text);
  const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
  scheduleTurnToTopForMessage(list, clientId);
  return clientId;
}

function claimPrecreatedController(explicit?: StreamingTurnController | null): StreamingTurnController | null {
  if (explicit) return explicit;
  const controller = turnState.pendingFirstTurnController;
  turnState.pendingFirstTurnController = null;
  return controller;
}

function abortSupersededTurn(precreated: StreamingTurnController | null): void {
  const active = turnState.activeChatCtl;
  if (active && active !== precreated) {
    try { active.abort(); }
    catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#2'); }
  }
  try { interruptPendingTurn(); }
  catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#3'); }
  const abort = turnState.activeChatAbort;
  if (abort) {
    try { abort('superseded'); }
    catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#4'); }
  }
}

function consumePendingContent(hasOverride: boolean, override: unknown): unknown {
  const pending = hasOverride ? override : turnState.pendingChatContent;
  try { turnState.pendingChatContent = null; }
  catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#5'); }
  return pending;
}

function showNoProviderReply(userText: string, precreated: StreamingTurnController | null): void {
  if (precreated) {
    try { precreated.abort(); }
    catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#6'); }
  }
  const topic = String(stateStore.read('topic'));
  const fallback = userText
    ? `You said: "${userText}". I can't actually reply yet because no model is configured — open Settings and add a provider to enable Chat mode.`
    : `I'm in Chat mode but no model is configured. Open Settings to add a provider, and I'll be able to talk about "${topic}" for real.`;
  addAnchoredAssistant(fallback);
}

async function showOfflineReply(
  precreated: StreamingTurnController | null,
  retryTurn: () => Promise<void>,
): Promise<void> {
  const retry = () => { quietTurn(retryTurn()); };
  const controller = precreated || await addStreamingMessage({ onRetry: retry });
  controller.replaceWithError('You appear to be offline — check your connection and retry.', retry);
}

function turnWasCancelled(ownerSessionId: unknown, controller: StreamingTurnController): boolean {
  return stateStore.read('currentSessionId') !== ownerSessionId
    || (typeof controller.isFinished === 'function' && controller.isFinished());
}

async function createTurnController(
  userMessage: string,
  retryTurn: () => Promise<void>,
  precreated: StreamingTurnController | null,
): Promise<StreamingTurnController> {
  if (precreated) return precreated;
  return addStreamingMessage({
    userPrompt: userMessage,
    onRetry() {
      /* Replay the captured content so attachments cannot come from a newer draft. */
      quietTurn(retryTurn());
    },
  });
}

function readHistory(): HistoryEntry[] {
  const messages = stateStore.read('messages') as unknown[];
  return messages.length === 0 ? [] : extractHistory();
}

function createPendingClientTurn(userText: string, controller: StreamingTurnController): PendingClientTurn {
  const sessionId = (stateStore.read('currentSessionId') as string | null) || null;
  const clientTurn: ClientTurnPayload = {
    id: newClientTurnId(),
    userClientId: null,
    assistantClientId: typeof controller.getClientId === 'function' ? controller.getClientId() : null,
    input: { text: String(userText || '').slice(0, 20_000) },
  };
  try {
    const messages = (stateStore.read('messages') || []) as Array<{ role?: string; clientId?: string | null }>;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].role === 'user') {
        clientTurn.userClientId = messages[index].clientId || null;
        break;
      }
    }
  } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#10'); }
  try {
    if (sessionId) savePendingTurn(sessionId, { turnId: '', clientTurnId: clientTurn.id, lastSeq: 0 });
  } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#11'); }
  const onTurnBound = (turnId: string): void => {
    if (!turnId) return;
    try {
      if (sessionId) savePendingTurn(sessionId, { turnId, clientTurnId: clientTurn.id, lastSeq: 0 });
    } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#12'); }
  };
  return { sessionId, clientTurn, onTurnBound };
}

function runChatTurnStream(
  messages: unknown[],
  controller: StreamingTurnController,
  pending: PendingClientTurn,
): Promise<StreamResult | null> {
  return callAPIStream(
    messages,
    MAX_TOKENS_CHAT,
    (delta) => controller.append(delta),
    (reasoning) => controller.appendThinking(reasoning),
    {
      ...toolCallbacksForStream(controller, { workspaceRunFinishedMessage: 'Workspace run finished' }),
      onRetry: (notice) => controller.setRetryStatus?.(notice),
      clientTurn: pending.clientTurn,
      onTurnBound: pending.onTurnBound,
    },
  );
}

function finishChatTurn(
  result: StreamResult | null,
  controller: StreamingTurnController,
  userText: string,
  retryTurn: () => Promise<void>,
  pending: PendingClientTurn,
): void {
  handleChatApiResult(result, controller, userText, retryTurn);
  try {
    if (pending.sessionId && result && (result.text || result.cancelled)) {
      clearPendingTurn(pending.sessionId, pending.clientTurn.id);
    }
  } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#13'); }
  finishTurnFeedback(result);
  saveSessionAfterTurn(controller);
}

function finishTurnFeedback(result: StreamResult | null): void {
  publishActiveWorkflowFinish(Boolean(result && result.text && String(result.text).trim()));
  try {
    syncSocraticMasteryUI();
    if (result && result.text && !result.cancelled) showSocraticSuggestions();
  } catch {
    /* empty-catch: intentional — Socratic feedback must not fail the chat turn. */
  }
}

function saveSessionAfterTurn(controller: StreamingTurnController): void {
  if (typeof controller.isFinished === 'function' && controller.isFinished()) return;
  const topic = stateStore.read('topic');
  const nodes = stateStore.read('kbNodes') as unknown[];
  if (stateStore.read('phase') === 'chat' || (topic && nodes.length)) saveCurrentSession();
}

export async function askChatTurn(
  userText: string,
  pendingOverride?: unknown,
  precreatedController?: StreamingTurnController | null,
): Promise<void> {
  const ownerSessionId = stateStore.read('currentSessionId');
  const precreated = claimPrecreatedController(precreatedController);
  abortSupersededTurn(precreated);
  const pendingContent = consumePendingContent(arguments.length > 1, pendingOverride);
  const retryTurn = () => askChatTurn(userText, pendingContent);

  if (!hasUsableActive()) {
    showNoProviderReply(userText, precreated);
    return;
  }
  if (offlineGuard()) {
    await showOfflineReply(precreated, retryTurn);
    return;
  }

  const history = readHistory();
  const topicValue = stateStore.read('topic');
  const topic = topicValue ? String(topicValue) : '';
  const userMessage = userText || `Let's talk about ${String(topicValue)}.`;
  const userContent = pendingContent !== undefined && pendingContent !== null ? pendingContent : userMessage;
  const controller = await createTurnController(userMessage, retryTurn, precreated);
  const isCancelled = () => turnWasCancelled(ownerSessionId, controller);
  if (isCancelled()) return;

  const pageContext = await prepareTurnPageContext(userMessage, isCancelled);
  if (!pageContext || isCancelled()) return;
  const messages = buildChatTurnMessages({
    userText,
    topic,
    userMessage,
    userContent,
    history,
    pageBlocks: pageContext.blocks,
    mentionedSite: pageContext.mentionedSite,
  });
  const pending = createPendingClientTurn(userText, controller);
  if (isCancelled()) return;

  const result = await runChatTurnStream(messages, controller, pending);
  finishChatTurn(result, controller, userText, retryTurn, pending);
}
