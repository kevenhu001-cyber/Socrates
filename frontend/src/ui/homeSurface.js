/* ui/homeSurface.js — LobeHub-style landing shortcuts.
 * The home surface is plain markup inside #topicSetup; this module only owns
 * its click affordances so the visual layer stays declarative. */

import { toggleWebSearch } from '../pickers.js';
import { openAttachmentPicker } from '../attachments/render.js';

export function installHomeSurface() {
  document.addEventListener('click', (event) => {
    const dismissTarget = event.target.closest?.('[data-home-dismiss]');
    if (dismissTarget) {
      event.preventDefault();
      event.stopPropagation();
      const row = dismissTarget.closest('.home-quick-action');
      if (row) row.hidden = true;
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
      return;
    }

    const delegate = delegates[action];
    if (delegate && typeof window[delegate] === 'function') {
      window[delegate]();
    }
  });
}
