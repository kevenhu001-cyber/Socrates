import { useMorePopoverStore } from '../../sidebar/morePopover.store.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { MorePopoverAction } from './types';

export function useMorePopoverSnapshot() {
  return useMorePopoverStore((state) => state.isOpen);
}

export function useMorePopoverDispatch(): { pick: (action: MorePopoverAction) => void } {
  const nav = getLegacyActions().navigation;
  return {
    pick: (action: MorePopoverAction) => {
      nav.closeMorePopover();
      switch (action) {
        case 'images':
          nav.openNav('images');
          return;
        case 'assistants':
          nav.openNav('assistants');
          return;
        /* The desktop shell trims the sidebar nav to the five primary
           destinations, so Plugins and Exam route through here — without them the
           two panels had no entry point at all above 768px. */
        case 'plugins':
          nav.openNav('plugins');
          return;
        case 'exam':
          nav.openNav('exam');
          return;
        case 'skills':
          nav.openPromptTemplatesModal();
          return;
        case 'incognito':
          nav.toggleIncognito();
          return;
        case 'settings':
          nav.openSettings();
          return;
        case 'display':
          nav.toggleDisplayPrefs();
          return;
        case 'shortcuts':
          nav.openCheatsheet();
          return;
        case 'signout':
          nav.signOut();
          return;
      }
    },
  };
}
