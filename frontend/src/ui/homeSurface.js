/* ui/homeSurface.js — LobeHub-style landing shortcuts.
 * The home surface is plain markup inside #topicSetup; this module only owns
 * its click affordances so the visual layer stays declarative. */

import { toggleWebSearch } from '../pickers.js';

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

    const navTarget = event.target.closest?.('[data-home-nav]');
    if (navTarget) {
      event.preventDefault();
      const destination = navTarget.dataset.homeNav;
      if (!destination) return;
      if (typeof window.openNav === 'function') window.openNav(destination);
      else if (typeof window[`open${destination[0].toUpperCase()}${destination.slice(1)}`] === 'function') {
        window[`open${destination[0].toUpperCase()}${destination.slice(1)}`]();
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
      /* Keep the entry point on the real composer tools control so the
         existing upload flow and the OpenConnector menu stay in one place. */
      const toolsButton = document.getElementById('topicComposerToolsBtn');
      if (toolsButton) {
        toolsButton.click();
      } else {
        document.getElementById('topicAttachInput')?.click();
      }
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

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const dismissTarget = event.target.closest?.('[data-home-dismiss]');
    if (!dismissTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const row = dismissTarget.closest('.home-quick-action');
    if (row) row.hidden = true;
  });
}
