/* chat/sendPipeline.ts — public entry point for submitting a chat turn. */
import { turnState } from './turnState.ts';
import { loadWebSearch } from './webSearchLoader.ts';
import { shouldRefreshSearch } from './webSearchPolicy.ts';
import { shouldAutoSearchTutor } from '../tutor/policy.js';
import { stateStore } from '../state/store.js';
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
