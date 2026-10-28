import { turnState } from './turnState.ts';
import {
  CHAT_PAGE_CONTEXT_TIMEOUT_MS,
  extractHttpUrls,
  fetchPagesForContext,
  looksLikeUserMentionedSite,
  type FetchedPage,
} from './webLinks.ts';
import { renderLinkPreviews, renderNoUrlHint } from '../ui/linkPreviews.ts';
import { reportSwallow } from '../util/reportSwallow.ts';

export interface TurnPageContext {
  urls: string[];
  blocks: string[];
  results: FetchedPage[];
  mentionedSite: boolean;
}

interface TurnPageWindow extends Window {
  _activeChatAbort?: ((reason?: unknown) => void) | null;
}

function renderFetchedLinks(urls: string[], results: FetchedPage[]): void {
  try {
    const list = document.getElementById('msgList');
    const last = list && list.lastElementChild;
    if (last && last.classList.contains('user')) renderLinkPreviews(last as HTMLElement, urls, results);
  } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#7'); }
}

function renderMissingLinkHint(): void {
  try {
    const list = document.getElementById('msgList');
    const last = list && list.lastElementChild;
    if (last && last.classList.contains('user')) renderNoUrlHint(last as HTMLElement);
  } catch (error) { reportSwallow(error, 'chat/turnController.askChatTurn#8'); }
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
    const win = window as TurnPageWindow;
    win._activeChatAbort = abortPreparation;
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
      if (win._activeChatAbort === abortPreparation) win._activeChatAbort = null;
    }
    if (preparation.signal.aborted || turnWasCancelled()) return null;
    renderFetchedLinks(urls, results);
  } else if (mentionedSite) {
    renderMissingLinkHint();
  }

  return { urls, blocks, results, mentionedSite };
}
