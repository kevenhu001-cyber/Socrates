import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.ts';
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

export function commitSendInput(input, options) {
  let userClientId;
  if (input.isComposerSubmit) {
    playSendGlyph();
    userClientId = addMessage('user', input.text, null, null, input.immediateAttachments);
    /* P_composer-defer-clear — clearComposer() walks the TipTap doc
       and re-paints the chips; on a populated composer this can take
       5–10ms. Defer the destructive part to idle time so the click
       handler returns with the user bubble already committed. The
       addMessage() call above is what drives the visible transition
       (user bubble + stop button); the composer text is the only
       thing that changes here, and it does not block the
       transcript update. */
    scheduleIdleClearComposer('chat');
  } else {
    userClientId = addMessage('user', input.text, null, null, input.immediateAttachments);
  }

  if (input.isComposerSubmit) {
    if (options.blurAfterSend) blurChatComposer();
    else focusComposer('chat');
    resetAttachments();
    renderAttachmentChips();
    /* P_composer-btn-collapse — the click frame used to call
       updateComposerBtn() twice (once right after clearComposer, once
       after the chip reset). Each call walks the composer for visible
       artifacts and the toolbar's enabled state. One walk at the end
       is enough because the toolbar reads state after both clear and
       reset have settled. */
    updateComposerBtn();
  }
  // Release the submitted draft before lazy loading or attachment preparation.
  // Attachments added while those tasks run belong to the next turn.
  return { userClientId, precreatedTurn: createPrecreatedTurn(input) };
}

/* P_composer-defer-clear — schedule `clearComposer` for the next
   idle slot so the click handler can return without paying for a
   TipTap document walk. Falls back through rIC → setTimeout so Safari
   (which has rIC since 16.4 but not on all surfaces) and the test
   harness (no rIC) still clear. */
function scheduleIdleClearComposer(scope) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(function idleClear() { clearComposer(scope); }, { timeout: 0 });
    return;
  }
  var raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : null;
  if (raf) {
    raf(function rafClear() { clearComposer(scope); });
    return;
  }
  setTimeout(function () { clearComposer(scope); }, 0);
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
