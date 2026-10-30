/* ui/homeSurface.ts — Contextual landing shortcuts.
 * React renders the home controls; this module delegates their existing
 * composer and web-search actions from the stable #topicSetup host. */

import { focusComposer, getComposerMarkdown, setComposerMarkdown } from '../composer/controller.ts';
import { toggleWebSearch } from '../pickers.ts';
import { openAttachmentPicker } from '../attachments/render.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function applyHomePrompt(promptTarget: HTMLElement) {
  const key = `home.tutor.${promptTarget.dataset.homePrompt}.prompt`;
  const prompt = browserWindow.t?.(key);
  if (!prompt || prompt === key) return;
  const draft = getComposerMarkdown('topic').trimEnd();
  setComposerMarkdown('topic', draft ? `${draft}\n\n${prompt}` : prompt);
  focusComposer('topic');
}

function dismissQuickAction(dismissTarget: HTMLElement, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  const row = dismissTarget.closest<HTMLElement>('.home-quick-action');
  if (!row) return;
  const next = (row.nextElementSibling || row.previousElementSibling) as HTMLElement | null;
  row.hidden = true;
  const remaining = next?.querySelector<HTMLElement>('.home-quick-action-primary');
  if (next && remaining && !next.hidden) remaining.focus();
  else focusComposer('topic');
}

function handleHomeAction(actionTarget: HTMLElement, syncSearch: () => void) {
  const action = actionTarget.dataset.homeAction;
  if (!action) return;
  if (action === 'upload') {
    openAttachmentPicker('composerAttachInput');
    return;
  }
  if (action === 'research') {
    /* The reference row is a real web-search toggle. Calling the picker
       directly keeps the existing state/search-context side effects while
       avoiding a second extension entry that would drift from the
       composer tools menu. */
    toggleWebSearch();
    syncSearch();
    focusComposer('topic');
    return;
  }
  if (action === 'write' && typeof browserWindow.__socratesExtensionDispatch === 'function') browserWindow.__socratesExtensionDispatch('composeAction');
}

export function installHomeSurface() {
  const home = document.getElementById('topicSetup');
  if (!home) return;
  const syncSearch = () => home.querySelector('[data-home-action="research"]')
    ?.setAttribute('aria-pressed', String(!!browserWindow.webSearchOn));
  syncSearch();
  document.addEventListener('socrates:homeactionsready', syncSearch);
  document.addEventListener('socrates:websearchchange', syncSearch);

  home.addEventListener('click', (event) => {
    const promptTarget = (event.target as Element | null)?.closest<HTMLElement>('[data-home-prompt]');
    if (promptTarget) {
      applyHomePrompt(promptTarget);
      return;
    }
    const dismissTarget = (event.target as Element | null)?.closest<HTMLElement>('[data-home-dismiss]');
    if (dismissTarget) {
      dismissQuickAction(dismissTarget, event);
      return;
    }

    const actionTarget = (event.target as Element | null)?.closest<HTMLElement>('[data-home-action]');
    if (!actionTarget) return;
    event.preventDefault();
    handleHomeAction(actionTarget, syncSearch);
  });
}
