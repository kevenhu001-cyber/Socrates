import { stateStore } from '../../state/store.js';
import { turnState } from '../turnState.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { showToast } from '../../ui/toast.js';
import { stripTemplateBodyPrefix, blurChatComposer } from '../templateSlash.js';
import { clearComposer, focusComposer, getComposerMarkdown } from '../../composer/controller.ts';
import type { ComposerSurface } from '../../composer/controller.ts';
import { selectedComposerPlugins } from '../../composer/pluginSelection.ts';
import { serializeSelectedPluginContext } from '../../composer/pluginCatalog.ts';
import { buildMessageContent, resetAttachments, snapshotAttachments } from '../../attachments.js';
import { renderAttachmentChips } from '../../attachments/render.js';
import { updateComposerBtn } from '../../ui/topicSetup.js';
import { addMessage } from '../messages.ts';
import { playSendGlyph } from '../../ui/sendGlyph.js';
import {
  addStreamingMessage,
  askChatTurn,
  getAppMode,
  isDeepResearchOn,
  translate,
} from './runtime.ts';
import type { ActiveChatController } from '../turnState.ts';

/** The composer snapshot a send is built from, captured before the clear. */
export interface SendInput {
  text: string;
  textForModel: string;
  isComposerSubmit: boolean;
  turnAttachments: unknown[];
  immediateAttachments: unknown[];
}

/** The streaming message created ahead of the network call. */
export interface PrecreatedTurn {
  controller: ActiveChatController | null;
  setRetryTarget(target: () => unknown): void;
}

export interface CommittedSendInput {
  userClientId: string | null;
  precreatedTurn: Promise<PrecreatedTurn | null>;
}

export interface SendPayload {
  chatContent: unknown;
  attachments: unknown[];
}

export interface CommitSendOptions {
  blurAfterSend?: boolean;
  bypassQueue?: boolean;
}

/** Legacy bridges the send path reads. */
interface SendInputWindow extends Window {
  _activeTemplate?: unknown;
  attachments?: unknown[] | null;
  publishReactChatRuntime?: (event: { type: string; reason: string }) => void;
}

export function captureSendInput(textOverride?: string | null): SendInput | null {
  const rawText = textOverride != null ? textOverride : getComposerMarkdown('chat');
  let text = rawText.trim();
  if ((window as SendInputWindow)._activeTemplate && textOverride == null) {
    text = stripTemplateBodyPrefix(rawText).trim();
    if (!text) {
      try { showToast(translate('toast.typeTextFirst')); }
      catch (error) { reportSwallow(error, 'sendPipeline.typeTextFirst'); }
      return null;
    }
  }

  const composerAttachments = (window as SendInputWindow).attachments;
  const hasAttachments = Array.isArray(composerAttachments) && composerAttachments.length > 0;
  if (!text && !hasAttachments) return null;

  const textForModel = serializeSelectedPluginContext(selectedComposerPlugins('chat').slice(), text);
  const isComposerSubmit = textOverride == null;
  const turnAttachments: unknown[] = isComposerSubmit ? snapshotAttachments() : [];
  const immediateAttachments = turnAttachments.slice(0, 20)
    .map((attachment) => Object.assign({}, attachment));
  return { text, textForModel, isComposerSubmit, turnAttachments, immediateAttachments };
}

async function createPrecreatedTurn(input: SendInput): Promise<PrecreatedTurn | null> {
  if (getAppMode() !== 'chat' || isDeepResearchOn()) return null;
  const supersededController = turnState.activeChatCtl;
  let retryTarget = (): unknown => askChatTurn(input.text, input.textForModel);
  let controller: ActiveChatController | null;
  try {
    controller = await addStreamingMessage({ onRetry: () => retryTarget() });
  } catch {
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

export function commitSendInput(input: SendInput, options: CommitSendOptions): CommittedSendInput {
  let userClientId: string | null;
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
   harness (no rIC) still clear.

   The clear is deferred, so by the time it runs the composer may already
   hold the next message — on a busy main thread the idle slot arrives
   late, and an unconditional clear wiped whatever the user had typed in
   the meantime. Compare against what was sent: clear only while the
   composer still holds it. */
function scheduleIdleClearComposer(scope: ComposerSurface): void {
  const sent = getComposerMarkdown(scope);
  const clearIfUnchanged = () => {
    try {
      if (getComposerMarkdown(scope) === sent) clearComposer(scope);
    } catch (error) { reportSwallow(error, 'send/input.scheduleIdleClearComposer'); }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(function idleClear() { clearIfUnchanged(); }, { timeout: 0 });
    return;
  }
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : null;
  if (raf) {
    raf(function rafClear() { clearIfUnchanged(); });
    return;
  }
  setTimeout(function () { clearIfUnchanged(); }, 0);
}

function patchCommittedAttachments(userClientId: string | null, attachments: unknown[]): void {
  if (!userClientId) return;
  const messages = stateStore.read('messages');
  if (!Array.isArray(messages)) return;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { clientId?: string } | null | undefined;
    if (!message || message.clientId !== userClientId) continue;
    stateStore.dispatch({
      type: 'session/update-message',
      index,
      clientId: userClientId,
      patch: { attachments },
    });
    try {
      const win = window as SendInputWindow;
      if (typeof win.publishReactChatRuntime === 'function') {
        win.publishReactChatRuntime({ type: 'state-synced', reason: 'send-attachment-patch' });
      }
    } catch (error) { reportSwallow(error, 'sendPipeline.publishAttachmentPatch'); }
    break;
  }
}

export async function assembleSendPayload(
  input: SendInput,
  userClientId: string | null,
): Promise<SendPayload> {
  if (!input.turnAttachments.length) {
    return { chatContent: input.textForModel, attachments: input.immediateAttachments };
  }

  let built: { rawText?: unknown; parts?: unknown; attachmentList?: unknown[] };
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
