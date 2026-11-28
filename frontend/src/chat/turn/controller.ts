/* Single-turn chat orchestration. Prompt assembly, linked-page preparation,
   and shared stream callbacks live in focused modules beside this entry. */
import { kbStore, sessionStore } from '../../store/index.ts';
import { addStreamingMessage } from './loadStreamingTurn.ts';
import { turnState, type StreamingTurnController } from './state.ts';
import { quietTurn } from './ui.ts';
import { cancelActiveTurn } from './cancelActiveTurn.ts';
import { hasUsableActive } from '../../config/providers.ts';
import { extractHistory, type HistoryEntry } from '../history.ts';
import { callAPIStream, type StreamResult } from '../stream.ts';
import { handleChatApiResult } from '../format.ts';
import { offlineGuard } from '../offline.ts';
import { toolCallbacksForStream, publishActiveWorkflowFinish } from '../toolCallbacks.ts';
import { clearPendingTurn, newClientTurnId, savePendingTurn } from './client.ts';
import { addMessage } from '../messages.ts';
import { scheduleTurnToTopForMessage } from './anchor/schedule.ts';
import { ensureSessionSavedBeforeStream, saveCurrentSession } from '../../session/persistence.ts';
import { i18n } from '../../ui/legacyI18n.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { learningTurnOptions } from '../../tutor/learningModeState.ts';
import { buildChatTurnMessages } from './prompt.ts';
import { prepareTurnPageContext } from './pageContext.ts';

/** Max tokens stays omitted so the backend uses the active model's limit. */
const MAX_TOKENS_CHAT: undefined = undefined;

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

function addAnchoredAssistant(text: string): string {
  const clientId = addMessage('assistant', text);
  const list = typeof document !== 'undefined' ? document.getElementById('msgList') : null;
  scheduleTurnToTopForMessage(list, clientId);
  return clientId;
}

function claimPrecreatedController(
  explicit?: StreamingTurnController | null,
): StreamingTurnController | null {
  if (explicit) return explicit;
  const controller = turnState.pendingFirstTurnController;
  turnState.pendingFirstTurnController = null;
  return controller;
}

function consumePendingContent(hasOverride: boolean, override: unknown): unknown {
  const pending = hasOverride ? override : turnState.pendingChatContent;
  try {
    turnState.pendingChatContent = null;
  } catch (error) {
    reportSwallow(error, 'chat/turn/controller.askChatTurn#5');
  }
  return pending;
}

function showNoProviderReply(userText: string, precreated: StreamingTurnController | null): void {
  if (precreated) {
    try {
      precreated.abort();
    } catch (error) {
      reportSwallow(error, 'chat/turn/controller.askChatTurn#6');
    }
  }
  const topic = String(sessionStore.getState().topic);
  const fallback = userText
    ? `You said: "${userText}". I can't actually reply yet because no model is configured — open Settings and add a provider to enable Chat mode.`
    : `I'm in Chat mode but no model is configured. Open Settings to add a provider, and I'll be able to talk about "${topic}" for real.`;
  addAnchoredAssistant(fallback);
}

async function showOfflineReply(
  precreated: StreamingTurnController | null,
  retryTurn: () => Promise<void>,
): Promise<void> {
  const retry = () => {
    quietTurn(retryTurn());
  };
  const controller = precreated || (await addStreamingMessage({ onRetry: retry }));
  controller.replaceWithError('You appear to be offline — check your connection and retry.', retry);
}

function turnWasCancelled(ownerSessionId: unknown, controller: StreamingTurnController): boolean {
  return (
    sessionStore.getState().currentSessionId !== ownerSessionId ||
    (typeof controller.isFinished === 'function' && controller.isFinished())
  );
}

async function createTurnController(
  retryTurn: () => Promise<void>,
  precreated: StreamingTurnController | null,
): Promise<StreamingTurnController> {
  if (precreated) return precreated;
  return addStreamingMessage({
    onRetry() {
      /* Replay the captured content so attachments cannot come from a newer draft. */
      quietTurn(retryTurn());
    },
  });
}

function readHistory(): HistoryEntry[] {
  const messages = sessionStore.getState().messages as unknown[];
  return messages.length === 0 ? [] : extractHistory();
}

function createPendingClientTurn(
  userText: string,
  controller: StreamingTurnController,
): PendingClientTurn {
  const sessionId = (sessionStore.getState().currentSessionId as string | null) || null;
  const clientTurn: ClientTurnPayload = {
    id: newClientTurnId(),
    userClientId: null,
    assistantClientId:
      typeof controller.getClientId === 'function' ? controller.getClientId() : null,
    input: { text: String(userText || '').slice(0, 20_000) },
  };
  try {
    const messages = (sessionStore.getState().messages || []) as Array<{
      role?: string;
      clientId?: string | null;
    }>;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].role === 'user') {
        clientTurn.userClientId = messages[index].clientId || null;
        break;
      }
    }
  } catch (error) {
    reportSwallow(error, 'chat/turn/controller.askChatTurn#10');
  }
  try {
    if (sessionId)
      savePendingTurn(sessionId, { turnId: '', clientTurnId: clientTurn.id, lastSeq: 0 });
  } catch (error) {
    reportSwallow(error, 'chat/turn/controller.askChatTurn#11');
  }
  const onTurnBound = (turnId: string): void => {
    if (!turnId) return;
    try {
      if (sessionId)
        savePendingTurn(sessionId, { turnId, clientTurnId: clientTurn.id, lastSeq: 0 });
    } catch (error) {
      reportSwallow(error, 'chat/turn/controller.askChatTurn#12');
    }
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
      ...toolCallbacksForStream(controller, {
        workspaceRunFinishedMessage: 'Workspace run finished',
      }),
      onRetry: (notice) => controller.setRetryStatus?.(notice),
      sessionId: pending.sessionId,
      clientTurn: pending.clientTurn,
      onTurnBound: pending.onTurnBound,
      /* RN-6: in Tutor mode a free-form turn carries the learning mode too. */
      ...learningTurnOptions(),
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
    if (
      pending.sessionId &&
      result &&
      (result.text || result.cancelled || result.semanticActivity)
    ) {
      clearPendingTurn(pending.sessionId, pending.clientTurn.id);
    }
  } catch (error) {
    reportSwallow(error, 'chat/turn/controller.askChatTurn#13');
  }
  finishTurnFeedback(result);
  saveSessionAfterTurn(controller);
}

function finishTurnFeedback(result: StreamResult | null): void {
  publishActiveWorkflowFinish(Boolean(result && result.text && String(result.text).trim()));
}

function saveSessionAfterTurn(controller: StreamingTurnController): void {
  if (typeof controller.isFinished === 'function' && controller.isFinished()) return;
  const topic = sessionStore.getState().topic;
  const nodes = kbStore.getState().kbNodes as unknown[];
  if (sessionStore.getState().phase === 'chat' || (topic && nodes.length)) saveCurrentSession();
}

export async function askChatTurn(
  userText: string,
  pendingOverride?: unknown,
  precreatedController?: StreamingTurnController | null,
): Promise<void> {
  const ownerSessionId = sessionStore.getState().currentSessionId;
  const precreated = claimPrecreatedController(precreatedController);
  cancelActiveTurn('superseded', precreated);
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
  const topicValue = sessionStore.getState().topic;
  const topic = topicValue ? String(topicValue) : '';
  const userMessage = userText || `Let's talk about ${String(topicValue)}.`;
  const userContent =
    pendingContent !== undefined && pendingContent !== null ? pendingContent : userMessage;
  const controller = await createTurnController(retryTurn, precreated);
  const isCancelled = () => turnWasCancelled(ownerSessionId, controller);
  if (isCancelled()) return;

  const saved = await ensureSessionSavedBeforeStream();
  if (!saved.ok) {
    controller.replaceWithError(
      i18n('session.saveBeforeStreamFailed', 'Could not save this conversation yet. Please retry.'),
      () => quietTurn(retryTurn()),
    );
    return;
  }

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
