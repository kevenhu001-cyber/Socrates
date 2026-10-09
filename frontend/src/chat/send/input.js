import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { showToast } from '../../ui/toast.js';
import { stripTemplateBodyPrefix, blurChatComposer } from '../templateSlash.js';
import { clearComposer, focusComposer, getComposerMarkdown } from '../../composer/controller.ts';
import { selectedComposerPlugins } from '../../react/composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../../react/composer/pluginCatalog.ts';
import { buildMessageContent, resetAttachments, snapshotAttachments } from '../../attachments.js';
import { renderAttachmentChips } from '../../attachments/render.js';
import { updateComposerBtn } from '../../ui/topicSetup.js';
import { addMessage } from '../messages.js';
import { playSendGlyph } from '../../ui/sendGlyph.js';
import {
  addStreamingMessage,
  askChatTurn,
  getAppMode,
  isDeepResearchOn,
  translate,
} from './runtime.js';

export function captureSendInput(textOverride) {
  const rawText = textOverride != null ? textOverride : getComposerMarkdown('chat');
  let text = rawText.trim();
  if (window._activeTemplate && textOverride == null) {
    text = stripTemplateBodyPrefix(rawText).trim();
    if (!text) {
      try { showToast(translate('toast.typeTextFirst')); }
      catch (error) { reportSwallow(error, 'sendPipeline.typeTextFirst'); }
      return null;
    }
  }

  const hasAttachments = Array.isArray(window.attachments) && window.attachments.length > 0;
  if (!text && !hasAttachments) return null;

  const textForModel = serializeSelectedPluginContext(selectedComposerPlugins('chat').slice(), text);
  const isComposerSubmit = textOverride == null;
  const turnAttachments = isComposerSubmit ? snapshotAttachments() : [];
  const immediateAttachments = turnAttachments.slice(0, 20).map((attachment) => Object.assign({}, attachment));
  return { text, textForModel, isComposerSubmit, turnAttachments, immediateAttachments };
}

async function createPrecreatedTurn(input) {
  if (getAppMode() !== 'chat' || isDeepResearchOn()) return null;
  const supersededController = turnState.activeChatCtl;
  let retryTarget = () => askChatTurn(input.text, input.textForModel);
  let controller;
  try {
    controller = await addStreamingMessage({ onRetry: () => retryTarget() });
  } catch (_) {
    controller = null;
  }
  if (supersededController && supersededController !== controller
      && typeof supersededController.abort === 'function') {
    try { supersededController.abort(); }
    catch (error) { reportSwallow(error, 'sendPipeline.precreate.abortSuperseded'); }
  }
  return {
    controller,
    setRetryTarget(target) { retryTarget = target; },
  };
}

export async function commitSendInput(input, options) {
  let userClientId;
  if (input.isComposerSubmit) {
    playSendGlyph();
    userClientId = addMessage('user', input.text, null, null, input.immediateAttachments);
    clearComposer('chat');
    updateComposerBtn();
  } else {
    userClientId = addMessage('user', input.text, null, null, input.immediateAttachments);
  }

  const precreatedTurn = await createPrecreatedTurn(input);
  if (input.isComposerSubmit) {
    if (options.blurAfterSend) blurChatComposer();
    else focusComposer('chat');
    resetAttachments();
    renderAttachmentChips();
    updateComposerBtn();
  }
  return { userClientId, precreatedTurn };
}

function patchCommittedAttachments(userClientId, attachments) {
  if (!userClientId) return;
  const messages = stateStore.read('messages');
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index] || messages[index].clientId !== userClientId) continue;
    stateStore.dispatch({
      type: 'session/update-message',
      index,
      clientId: userClientId,
      patch: { attachments },
    });
    try {
      if (typeof window.publishReactChatRuntime === 'function') {
        window.publishReactChatRuntime({ type: 'state-synced', reason: 'send-attachment-patch' });
      }
    } catch (error) { reportSwallow(error, 'sendPipeline.publishAttachmentPatch'); }
    break;
  }
}

export async function assembleSendPayload(input, userClientId) {
  if (!input.turnAttachments.length) {
    return { chatContent: input.textForModel, attachments: input.immediateAttachments };
  }

  let built;
  try {
    built = await buildMessageContent(input.textForModel, input.turnAttachments);
  } catch (error) {
    reportSwallow(error, 'sendPipeline.buildMessageContent');
    built = {
      rawText: input.textForModel,
      parts: input.textForModel,
      attachmentList: input.immediateAttachments,
    };
  }
  const attachments = built.attachmentList || input.immediateAttachments;
  patchCommittedAttachments(userClientId, attachments);
  return { chatContent: built.parts, attachments };
}
