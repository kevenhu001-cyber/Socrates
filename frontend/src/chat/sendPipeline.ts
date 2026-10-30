/* chat/sendPipeline.ts — public entry point for submitting a chat turn. */
import { turnState, shouldQueueChatSend } from './turnState.ts';
import { loadWebSearch } from './webSearchLoader.ts';
import { shouldRefreshSearch } from './webSearchPolicy.ts';
import { shouldAutoSearchTutor } from '../tutor/policy.ts';
import { stateStore } from '../state/store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  assembleSendPayload,
  captureSendInput,
  commitSendInput,
} from './send/input.ts';
import type { CommitSendOptions } from './send/input.ts';
import {
  dispatchSendTurn,
  scheduleSendTurn,
} from './send/dispatch.ts';
import {
  askChatTurn,
  isWebSearchOn,
  prefetchStreamingTurn,
} from './send/runtime.ts';
import { enqueuePrompt } from './promptQueue.ts';
import { clearComposer } from '../composer/controller.ts';
import { resetAttachments } from '../attachments.ts';
import { renderAttachmentChips } from '../attachments/render.ts';
import { updateComposerBtn } from '../ui/topicSetup.ts';

function refreshTutorWebContext(text: string): void {
  const topic = stateStore.read('topic');
  if (!isWebSearchOn() || !topic || !shouldRefreshSearch()) return;
  const query = String(topic) + ' ' + text;
  if (!shouldAutoSearchTutor(query)) return;
  void loadWebSearch()
    .then(({ fetchWebContext }) => fetchWebContext(query, { background: true }))
    .catch((error) => reportSwallow(error, 'chat/sendPipeline.refreshTutorWebContext'));
}

let _prefetchScheduled = false;
function schedulePrefetchStreamingTurn(): void {
  if (_prefetchScheduled) return;
  _prefetchScheduled = true;
  const run = (): void => {
    _prefetchScheduled = false;
    prefetchStreamingTurn();
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 1000 });
  } else if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 0);
  }
}

export async function submitChatMessage(
  textOverride?: string | null,
  options?: CommitSendOptions,
): Promise<void> {
  const sendOptions = options || {};

  /* Prompt Queueing (ChatGPT-style) — when a streaming turn is in flight,
     follow-up prompts from the user are queued instead of aborting the stream.
     When the stream finishes naturally, the queued prompt is automatically dequeued. */
  if (shouldQueueChatSend() && !sendOptions.bypassQueue) {
    const input = captureSendInput(textOverride);
    if (!input || !input.text.trim()) return;
    const currentSessionId = (stateStore.read('currentSessionId') as string) || null;
    enqueuePrompt({ text: input.text, sessionId: currentSessionId });
    if (input.isComposerSubmit) {
      clearComposer('chat');
      resetAttachments();
      renderAttachmentChips();
      updateComposerBtn();
    }
    return;
  }

  /* P_send-prefetch-defer — prefetchStreamingTurn() warms the
     dynamic import for the streaming turn module so the first
     click doesn't pay the parse cost. Calling it on every click
     frame is wasted work after the first call (the import is
     cached). Defer it to the next idle slot so the click frame
     stays focused on the user bubble / Stop button transition. */
  schedulePrefetchStreamingTurn();

  const input = captureSendInput(textOverride);
  if (!input) return;

  const committed = commitSendInput(input, sendOptions);
  // Upload completion and the streaming chunk load are independent.
  const [precreatedTurn, payload] = await Promise.all([
    committed.precreatedTurn,
    assembleSendPayload(input, committed.userClientId),
  ]);

  if (precreatedTurn) {
    precreatedTurn.setRetryTarget(() => askChatTurn(input.text, payload.chatContent));
  }

  turnState.pendingChatContent = payload.chatContent;
  turnState.pendingAttachments = payload.attachments;

  refreshTutorWebContext(input.text);

  const dispatch = (): Promise<void> => dispatchSendTurn({
    text: input.text,
    chatContent: payload.chatContent,
    precreatedController: precreatedTurn?.controller || null,
    options: sendOptions,
    submitChatMessage,
  });
  scheduleSendTurn(dispatch);
}
