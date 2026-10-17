import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.js';
import { saveState } from '../../session/saveState.ts';
import { resetSessionTransients } from '../../session/loader.js';
import { saveCurrentSession } from '../../session/persistence.js';
import { askChatTurn } from '../turnController.js';
import { isExpectedTurnAbort } from '../turnUi.js';
import { setActiveTemplate } from '../templateSlash.js';
import { addMessage } from '../messages.js';
import { updateKB } from '../../ui/knowledgePanel.js';
import { activateMainView } from '../../ui/mainViewController.js';
import { clearComposer } from '../../composer/controller.ts';
import { updateComposerBtn } from '../../ui/topicSetup.js';
import { clearLegacyMsgListChildren } from '../../ui/messageListDom.js';
import { buildMessageContent, resetAttachments } from '../../attachments.js';
import { renderAttachmentChips } from '../../attachments/render.js';
import { formatMsg } from '../../render/markdown.ts';
import { publishReactChatRuntime } from '../../ui/reactBridge.js';
import { reportSwallow } from '../../util/reportSwallow.ts';

function patchFirstTurnAttachments(clientId, topic, attachments) {
  if (!attachments.length || !clientId) return;
  const messages = stateStore.read('messages');
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index] || messages[index].clientId !== clientId) continue;
    stateStore.dispatch({
      type: 'session/update-message',
      index,
      clientId,
      patch: {
        attachments,
        rawText: topic,
        html: formatMsg(topic),
      },
    });
    publishReactChatRuntime({ type: 'state-synced', reason: 'start-attachment-patch' });
    break;
  }
}

async function assembleAndSendFirstTurn(context, userClientId, initialSave, contentPromise) {
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

  if (context.deepResearchOn && typeof window.startDeepResearch === 'function') {
    await window.startDeepResearch(context.topicForModel);
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

export async function startChatSession(context) {
  activateMainView('chatView', document);
  try { clearComposer('topic'); }
  catch (error) { reportSwallow(error, 'chat/sessionBootstrap.clearTopicComposer'); }
  clearLegacyMsgListChildren();

  try {
    if (typeof window.__loadStreamingTurn === 'function') window.__loadStreamingTurn();
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
  const contentPromise = buildMessageContent(context.topicForModel, context.startAttachments)
    .catch((error) => {
      reportSwallow(error, 'chat/sessionBootstrap.buildFirstContent');
      return { parts: context.topicForModel, attachmentList: context.immediateAttachments };
    });

  let syncController = null;
  if (typeof window.addStreamingMessage === 'function') {
    try {
      syncController = await window.addStreamingMessage({
        async onRetry() {
          const built = await contentPromise;
          return askChatTurn(context.topic, built.parts);
        },
      });
    } catch (error) { reportSwallow(error, 'chat/sessionBootstrap.createFirstPlaceholder'); }
  }
  if (syncController) {
    try { window.__socratesSyncCtl = syncController; }
    catch (error) { reportSwallow(error, 'chat/sessionBootstrap.publishSyncController'); }
  }

  setTimeout(() => assembleAndSendFirstTurn(context, userClientId, initialSave, contentPromise), 0);
}
