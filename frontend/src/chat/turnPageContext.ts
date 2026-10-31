import { turnState } from './turnState.ts';
import {
  CHAT_PAGE_CONTEXT_TIMEOUT_MS,
  extractHttpUrls,
  fetchPagesForContext,
  looksLikeUserMentionedSite,
  type FetchedPage,
} from './webLinks.ts';
import { buildLinkPreviewItems } from '../ui/linkPreviews.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { stateStore } from '../state/store.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import type { LegacyChatMessage } from '../react/types/domain';

export interface TurnPageContext {
  urls: string[];
  blocks: string[];
  results: FetchedPage[];
  mentionedSite: boolean;
}

function updateLatestUserMessage(userMessage: string, patch: Record<string, unknown>): void {
  try {
    const messages = stateStore.read('messages') as LegacyChatMessage[];
    let index = -1;
    for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
      const message = messages[cursor];
      if (message.role === 'user' && message.rawText === userMessage) {
        index = cursor;
        break;
      }
    }
    if (index < 0) return;
    const message = messages[index];
    stateStore.dispatch({
      type: 'session/update-message',
      index,
      ...(message.clientId ? { clientId: message.clientId } : {}),
      patch,
    });
    publishReactChatRuntime({ type: 'state-synced', reason: 'user-link-preview-updated' });
  } catch (error) { reportSwallow(error, 'chat/turnPageContext.updateLatestUserMessage'); }
}

export async function prepareTurnPageContext(
  userMessage: string,
  turnWasCancelled: () => boolean,
): Promise<TurnPageContext | null> {
  const urls = extractHttpUrls(userMessage);
  const mentionedSite = looksLikeUserMentionedSite(userMessage);
  let blocks: string[] = [];
  let results: FetchedPage[] = [];

  if (urls.length) {
    const preparation = new AbortController();
    const abortPreparation = () => preparation.abort();
    turnState.activePagePreparationAbort = abortPreparation;
    turnState.activeChatAbort = abortPreparation;
    try {
      const fetched = await fetchPagesForContext(urls, {
        signal: preparation.signal,
        timeoutMs: CHAT_PAGE_CONTEXT_TIMEOUT_MS,
      });
      blocks = fetched.blocks || [];
      results = fetched.results || [];
    } catch {
      blocks = [];
      results = [];
    } finally {
      if (turnState.activePagePreparationAbort === abortPreparation) {
        turnState.activePagePreparationAbort = null;
      }
      if (turnState.activeChatAbort === abortPreparation) turnState.activeChatAbort = null;
    }
    if (preparation.signal.aborted || turnWasCancelled()) return null;
    updateLatestUserMessage(userMessage, { pageLinkPreviews: buildLinkPreviewItems(urls, results), pageLinkHint: false });
  } else if (mentionedSite) {
    updateLatestUserMessage(userMessage, { pageLinkPreviews: [], pageLinkHint: true });
  }

  return { urls, blocks, results, mentionedSite };
}
