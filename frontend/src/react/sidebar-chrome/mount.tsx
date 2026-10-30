/* Sidebar chrome mount — the header and user footer share module state, so
   they render under a single React root: the footer is portaled into its
   own static host element. One reconciliation tree, two DOM hosts. */

import { createPortal } from 'react-dom';

import { clearHostMounted, markHostMountedBy } from '../lib/boot/ownership';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { SidebarHeader } from './SidebarHeader';
import { SidebarFooter } from './SidebarFooter';
import { RecentsHeader } from './RecentsHeader';

const rootSlot = createRootSlot('sidebar-chrome');
let portalHosts: { footer: HTMLElement; recents: HTMLElement | null } | null = null;

export function mountSidebarChrome(): void {
  const headHost = document.getElementById('sidebarHeader');
  const footHost = document.getElementById('sidebarUserRow');
  const recentsHost = document.querySelector<HTMLElement>('#recentsPanel .recents-header');
  if (!headHost || !footHost) { rootSlot.destroy(); portalHosts = null; return; }
  if (portalHosts && (portalHosts.footer !== footHost || portalHosts.recents !== recentsHost)) rootSlot.destroy();
  portalHosts = { footer: footHost, recents: recentsHost };
  rootSlot.mount(headHost,
    <>
      <SidebarHeader />
      {createPortal(<SidebarFooter />, footHost)}
      {recentsHost ? createPortal(<RecentsHeader />, recentsHost) : null}
    </>,
    () => {
      // Portals append, so remove fallback markup only on the first mount.
      footHost.replaceChildren();
      recentsHost?.replaceChildren();
      markHostMountedBy(footHost, 'sidebar-chrome');
      return () => clearHostMounted(footHost);
    },
  );
}
