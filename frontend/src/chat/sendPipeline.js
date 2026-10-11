/* chat/sendPipeline.js — public entry point for submitting a chat turn. */
import { turnState } from './turnState.js';
import { loadWebSearch } from './webSearchLoader.js';
import { shouldRefreshSearch } from './webSearchPolicy.js';
import { shouldAutoSearchTutor } from '../tutor/policy.js';
import { stateStore } from '../state/store.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  assembleSendPayload,
  captureSendInput,
  commitSendInput,
} from './send/input.js';
import {
  dispatchSendTurn,
  scheduleSendTurn,
} from './send/dispatch.js';
import {
  askChatTurn,
  isWebSearchOn,
  prefetchStreamingTurn,
} from './send/runtime.js';

function refreshTutorWebContext(text) {
  const topic = stateStore.read('topic');
  if (!isWebSearchOn() || !topic || !shouldRefreshSearch()) return;
  if (!shouldAutoSearchTutor(topic + ' ' + text)) return;
  void loadWebSearch()
    .then(({ fetchWebContext }) => fetchWebContext(topic + ' ' + text, { background: true }))
    .catch((error) => reportSwallow(error, 'chat/sendPipeline.refreshTutorWebContext'));
}

export async function submitChatMessage(textOverride, options) {
  const sendOptions = options || {};
  prefetchStreamingTurn();

  const input = captureSendInput(textOverride);
  if (!input) return;

  const committed = await commitSendInput(input, sendOptions);
  const payload = await assembleSendPayload(input, committed.userClientId);

  if (committed.precreatedTurn) {
    committed.precreatedTurn.setRetryTarget(() => askChatTurn(input.text, payload.chatContent));
  }

  turnState.pendingChatContent = payload.chatContent;
  turnState.pendingAttachments = payload.attachments;

  refreshTutorWebContext(input.text);

  const dispatch = () => dispatchSendTurn({
    text: input.text,
    chatContent: payload.chatContent,
    precreatedController: committed.precreatedTurn?.controller || null,
    options: sendOptions,
    submitChatMessage,
  });
  scheduleSendTurn(dispatch);
}
