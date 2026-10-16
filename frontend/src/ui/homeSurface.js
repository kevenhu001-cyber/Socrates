/* ui/homeSurface.js — Contextual landing shortcuts.
 * The home surface is plain markup inside #topicSetup; this module only owns
 * its click affordances so the visual layer stays declarative. */

import { focusComposer, getComposerMarkdown, setComposerMarkdown } from '../composer/controller.ts';
import { toggleWebSearch } from '../pickers.js';
import { openAttachmentPicker } from '../attachments/render.js';

export function installHomeSurface() {
  const home = document.getElementById('topicSetup');
  if (!home) return;
  const search = home.querySelector('[data-home-action="research"]');
  const syncSearch = () => search?.setAttribute('aria-pressed', String(!!window.webSearchOn));
  syncSearch();
  document.addEventListener('socrates:websearchchange', syncSearch);

  home.addEventListener('click', (event) => {
    const promptTarget = event.target.closest?.('[data-home-prompt]');
    if (promptTarget) {
      const key = `home.tutor.${promptTarget.dataset.homePrompt}.prompt`;
      const prompt = window.t?.(key);
      if (!prompt || prompt === key) return;
      const draft = getComposerMarkdown('topic').trimEnd();
      setComposerMarkdown('topic', draft ? `${draft}\n\n${prompt}` : prompt);
      focusComposer('topic');
      return;
    }
    const dismissTarget = event.target.closest?.('[data-home-dismiss]');
    if (dismissTarget) {
      event.preventDefault();
      event.stopPropagation();
      const row = dismissTarget.closest('.home-quick-action');
      if (row) {
        const next = row.nextElementSibling || row.previousElementSibling;
        row.hidden = true;
        const remaining = next?.querySelector('.home-quick-action-primary');
        if (remaining && !next.hidden) remaining.focus();
        else focusComposer('topic');
      }
      return;
    }

    const actionTarget = event.target.closest?.('[data-home-action]');
    if (!actionTarget) return;
    event.preventDefault();
    const action = actionTarget.dataset.homeAction;
    const delegates = {
      write: 'composeAction',
    };
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

    const delegate = delegates[action];
    if (delegate && typeof window[delegate] === 'function') {
      window[delegate]();
    }
  });
}
