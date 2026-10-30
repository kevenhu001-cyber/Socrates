import { stateStore } from '../../state/store.ts';
import { turnState, type StreamingTurnController } from '../turnState.ts';
import { saveState } from '../../session/saveState.ts';
import { resetSessionTransients } from '../../session/loader.ts';
import { saveCurrentSession } from '../../session/persistence.ts';
import { askChatTurn } from '../turnController.js';
import { isExpectedTurnAbort } from '../turnUi.ts';
import { setActiveTemplate } from '../templateSlash.ts';
import { addMessage } from '../messages.ts';
import { updateKB } from '../../ui/knowledgePanel.ts';
import { activateMainView } from '../../ui/mainViewController.ts';
import { clearComposer } from '../../composer/controller.ts';
import { updateComposerBtn } from '../../ui/topicSetup.ts';
import { clearLegacyMsgListChildren } from '../../ui/messageListDom.ts';
import { buildMessageContent, resetAttachments } from '../../attachments.ts';
import { renderAttachmentChips } from '../../attachments/render.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import type { SessionStartContext } from './input.ts';

/** Legacy bridges read while booting the first chat turn. */
interface ChatStartWindow extends Window {
  startDeepResearch?: (topic: string) => Promise<unknown> | unknown;
  __loadStreamingTurn?: () => void;
  addStreamingMessage?: (options: { onRetry?: () => void }) => StreamingTurnController;
  __socratesSyncCtl?: StreamingTurnController | null;
}

/** Resolved value of the first-turn content build. */
interface BuiltMessageContent {
  parts: unknown;
  attachmentList?: unknown[];
}

function patchFirstTurnAttachments(clientId: string, topic: string, attachments: unknown[]): void {
  if (!attachments.length || !clientId) return;
  const messages = stateStore.read('messages') as Array<{ clientId?: string }>;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index] || messages[index].clientId !== clientId) continue;
    stateStore.dispatch({
      type: 'session/update-message',
      index,
      clientId,
      patch: {
        attachments,
        rawText: topic,
        html: '',
      },
    });
    publishReactChatRuntime({ type: 'state-synced', reason: 'start-attachment-patch' });
    break;
  }
}

async function assembleAndSendFirstTurn(
  context: SessionStartContext,
  userClientId: string,
  initialSave: Promise<unknown> | null,
  contentPromise: Promise<BuiltMessageContent>,
): Promise<void> {
  const win = window as ChatStartWindow;
  resetSessionTransients();
  if (context.activeTemplate) setActiveTemplate(context.activeTemplate);

  let savePromise = initialSave;
  if (!savePromise) {
    try { savePromise = saveCurrentSession(); }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.initialSave'); }
  }
  // A persistence failure must not discard successfully prepared attachments.
  const [built] = await Promise.all([
    contentPromise,
    Promise.resolve(savePromise).catch((error) => {
      reportSwallow(error, 'chat/sessionBootstrap.initialSave');
    }),
  ]);

  const chatContent = built.parts || context.topicForModel;
  const topic = stateStore.read('topic');
  const attachments = Array.isArray(built.attachmentList) ? built.attachmentList : [];
  turnState.pendingChatContent = chatContent;
  turnState.pendingAttachments = attachments;
  patchFirstTurnAttachments(userClientId, topic, attachments);

  if (context.deepResearchOn && typeof win.startDeepResearch === 'function') {
    await win.startDeepResearch(context.topicForModel);
    return;
  }
  try {
    await askChatTurn(topic, chatContent);
  } catch (error) {
    if (!isExpectedTurnAbort(error)) {
      try { console.error('[chat] start turn failed:', error); }
      catch (caught) { reportSwallow(caught, 'chat/sessionBootstrap.firstTurn.logFailure'); }
    }
  }
}

export async function startChatSession(context: SessionStartContext): Promise<void> {
  const win = window as ChatStartWindow;
  activateMainView('chatView', document);
  try { clearComposer('topic'); }
  catch (error) { reportSwallow(error, 'chat/sessionBootstrap.clearTopicComposer'); }
  clearLegacyMsgListChildren();

  try {
    if (typeof win.__loadStreamingTurn === 'function') win.__loadStreamingTurn();
  } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.prefetchStreamingTurn'); }

  const userClientId = addMessage(
    'user',
    stateStore.read('topic'),
    null,
    null,
    context.immediateAttachments,
  );
  const initialSave = saveState.saveInFlight || null;
  // Clear the submitted chips before the lazy streaming module can yield.
  resetAttachments();
  renderAttachmentChips();
  updateComposerBtn();
  updateKB();

  // Prepare attachments while the streaming chunk loads; retries share the
  // immutable payload instead of reading the next draft or redoing uploads.
  const contentPromise: Promise<BuiltMessageContent> = buildMessageContent(context.topicForModel, context.startAttachments)
    .catch((error) => {
      reportSwallow(error, 'chat/sessionBootstrap.buildFirstContent');
      return { parts: context.topicForModel, attachmentList: context.immediateAttachments };
    });

  let syncController: StreamingTurnController | null = null;
  if (!context.deepResearchOn && typeof win.addStreamingMessage === 'function') {
    try {
      syncController = await win.addStreamingMessage({
        async onRetry() {
          const built = await contentPromise;
          return askChatTurn(context.topic, built.parts);
        },
      });
    } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.createFirstPlaceholder'); }
  }
  if (syncController) {
    try { win.__socratesSyncCtl = syncController; }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.publishSyncController'); }
  }

  setTimeout(() => assembleAndSendFirstTurn(context, userClientId, initialSave, contentPromise), 0);
}
