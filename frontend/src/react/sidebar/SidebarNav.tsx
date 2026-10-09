import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getLegacyActions } from '../legacy/gateway.ts';
import { openNav } from '../../sidebar/navigation.service';
import { useNavigationStore } from '../../sidebar/navigation.store';
import { SidebarNavButton } from './SidebarNavButton';
import { BUTTONS, NAV_ID } from './sidebarNav.items';

function SidebarNav() {
  const active = useNavigationStore((state) => state.activeDestination);

  return (
    <>
      {BUTTONS.map((button) => {
        const isActive = button.key !== 'new' && button.key !== 'skills' && active === button.key;
        return (
          <SidebarNavButton
            key={button.key}
            item={button}
            active={isActive}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              if (button.key === 'new') {
                /* The ⌘K badge names the command palette shortcut, so a
                   click there must open the palette instead of resetting. */
                if (event.target instanceof Element && event.target.closest('.nav-kbd')) {
                  getLegacyActions().cmdK.openCmdK();
                  return;
                }
                getLegacyActions().navigation.startNewChat();
              } else if (button.key === 'skills') {
                getLegacyActions().navigation.openPromptTemplatesModal();
              } else {
                openNav(button.key);
              }
            }}
          />
        );
      })}
    </>
  );
}

export interface SidebarNavHandle {
  nav: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrate the legacy `#sidebarNav` element with React. Idempotent — a
 * second call returns the existing handle. The nav element itself is
 * preserved (same id, same `aria-label`, same nav DOM siblings); React
 * owns only its direct children (the 8 buttons). The /admin operator
 * console is intentionally NOT a sidebar destination: it is a
 * standalone page reached by direct URL (legacy WORKSPACE_ROUTES +
 * openAdmin), so the admin surface is not advertised in the nav.
 *
 * Callers claim the element through the module-private ownership registry.
 * React reads active destination state from the typed navigation store.
 */
export function hydrateSidebarNav(): SidebarNavHandle | null {
  const nav = document.getElementById(NAV_ID);
  if (!nav) return null;
  if (hostIsMountedBy(nav, 'sidebar-nav')) {
    throw new Error('Sidebar nav React runtime was initialized more than once.');
  }

  const root = createRoot(nav);
  root.render(<SidebarNav />);
  markHostMountedBy(nav, 'sidebar-nav');
  return {
    nav,
    root,
    destroy: () => {
      root.unmount();
      clearHostMounted(nav);
    },
  };
}
