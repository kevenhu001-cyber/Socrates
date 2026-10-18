/* Sidebar chrome mount — the header and the user footer share one bridge
   snapshot, so they render under a single React root: the footer is
   portaled into its own static host element. One reconciliation tree,
   one bridge install, two DOM hosts. */

import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

import { markHostMountedBy } from '../lib/boot/ownership';
import { SidebarHeader } from './SidebarHeader';
import { SidebarFooter } from './SidebarFooter';
import { RecentsHeader } from './RecentsHeader';
import { installSidebarChromeBridge } from './sidebarChrome.bridge';

export function mountSidebarChrome(): void {
  const headHost = document.getElementById('sidebarHeader');
  const footHost = document.getElementById('sidebarUserRow');
  const recentsHost = document.querySelector<HTMLElement>('#recentsPanel .recents-header');
  if (!headHost || !footHost) return;
  installSidebarChromeBridge();
  /* createPortal appends into the host — unlike createRoot().render() it
     does not clear the legacy fallback markup first, so empty it here. */
  footHost.replaceChildren();
  recentsHost?.replaceChildren();
  createRoot(headHost).render(
    <>
      <SidebarHeader />
      {createPortal(<SidebarFooter />, footHost)}
      {recentsHost ? createPortal(<RecentsHeader />, recentsHost) : null}
    </>,
  );
  markHostMountedBy(footHost, 'sidebar-chrome');
}
