import { getCurrentUser } from '../app/lifecycle/index.ts';
import { isIncognitoOn } from '../app/lifecycle/incognitoState.ts';
import { isBrowserStorageBlocked } from '../batchStorage.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { getComposerMarkdown, setComposerMarkdown } from './controller.ts';

const STORAGE_KEY = 'socrates-composer-reload-drafts';
const SURFACES = ['topic', 'chat'] as const;

export function canReloadComposer(): boolean {
  return Boolean(getCurrentUser()?.id) && !isIncognitoOn() && !isBrowserStorageBlocked();
}

/** Explicit reload starts a new browser module map. Save only text, in this tab. */
export function reloadWithComposerDrafts(): boolean {
  if (!canReloadComposer()) return false;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: getCurrentUser()?.id,
        url: location.href,
        topic: getComposerMarkdown('topic'),
        chat: getComposerMarkdown('chat'),
      }),
    );
    location.reload();
    return true;
  } catch (error) {
    reportSwallow(error, 'composer:save-reload-drafts');
    return false;
  }
}

/** Apply the handoff after the routed session has finished clearing old drafts. */
export function restoreComposerReloadDrafts(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(STORAGE_KEY);
    const draft = JSON.parse(raw) as {
      userId?: unknown;
      url?: unknown;
      topic?: unknown;
      chat?: unknown;
    };
    if (
      draft?.userId !== getCurrentUser()?.id ||
      draft?.url !== location.href ||
      !canReloadComposer()
    )
      return;
    for (const surface of SURFACES) {
      const text = draft[surface];
      if (typeof text === 'string' && text && !getComposerMarkdown(surface))
        setComposerMarkdown(surface, text);
    }
  } catch (error) {
    reportSwallow(error, 'composer:restore-reload-drafts');
  }
}
