import { createRoot, type Root } from 'react-dom/client';

import { t as _t } from '../legacy/gateway';
import {
  installMorePopoverBridge,
  useMorePopoverDispatch,
  useMorePopoverSnapshot,
} from './morePopover.bridge';
import type { MorePopoverAction } from './types';

const POPOVER_ID = 'moreNavPopover';

interface MenuItemSpec {
  action: MorePopoverAction;
  labelKey: string;
  labelFallback: string;
  icon: string;
  danger?: boolean;
}

const SETTINGS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const DISPLAY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="21" y1="6" x2="14" y2="6"/><line x1="10" y1="6" x2="3" y2="6"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="18" x2="16" y2="18"/><line x1="12" y1="18" x2="3" y2="18"/></svg>';
const SHORTCUTS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M6 16h12"/></svg>';
const SKILLS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>';
const SIGNOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
const PLUGINS_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><rect x="5" y="10" width="6" height="4" rx="1"/><rect x="13" y="10" width="6" height="4" rx="1"/></svg>';
const EXAM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>';

/* Plugins and Exam live here because the desktop sidebar nav is trimmed to
   five entries; they are destinations, so they sit above the settings group. */
const ITEMS: MenuItemSpec[] = [
  { action: 'plugins', labelKey: 'sidebar.nav.plugins', labelFallback: 'Plugins', icon: PLUGINS_ICON },
  { action: 'exam', labelKey: 'sidebar.nav.exam', labelFallback: 'Exam', icon: EXAM_ICON },
  { action: 'skills', labelKey: 'sidebar.more.skills', labelFallback: 'Skills & shortcuts', icon: SKILLS_ICON },
  { action: 'settings', labelKey: 'sidebar.more.settings', labelFallback: 'API settings', icon: SETTINGS_ICON },
  { action: 'display', labelKey: 'sidebar.more.display', labelFallback: 'Display & theme', icon: DISPLAY_ICON },
  { action: 'shortcuts', labelKey: 'sidebar.more.shortcuts', labelFallback: 'Keyboard shortcuts', icon: SHORTCUTS_ICON },
  { action: 'signout', labelKey: 'sidebar.more.signOut', labelFallback: 'Sign out', icon: SIGNOUT_ICON, danger: true },
];

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function MenuItem({ spec, onPick }: { spec: MenuItemSpec; onPick: (action: MorePopoverAction) => void }) {
  const label = i18n(spec.labelKey, spec.labelFallback);
  const className = spec.danger
    ? 'sidebar-more-item sidebar-more-item-danger'
    : 'sidebar-more-item';
  return (
    <button
      type="button"
      className={className}
      role="menuitem"
      onClick={() => onPick(spec.action)}
    >
      <span dangerouslySetInnerHTML={{ __html: spec.icon }} />
      <span>{label}</span>
    </button>
  );
}

function MorePopover() {
  // Subscribe so re-renders fire when the legacy module publishes open/close.
  useMorePopoverSnapshot();
  const { pick } = useMorePopoverDispatch();

  return (
    <>
      {ITEMS.map((item) => (
        <MenuItem key={item.action} spec={item} onPick={pick} />
      ))}
    </>
  );
}

export interface MorePopoverHandle {
  popover: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrate the legacy `#moreNavPopover` element with React. Idempotent.
 * The popover element keeps its id, classes, and CSS styling (including
 * the `.hidden` class toggled by the legacy module); React owns only
 * its direct children (the menu item buttons).
 *
 * The legacy `toggleMorePopover()` / `closeMorePopover()` still manage
 * the popover's position and open/close state via the `.hidden` class.
 * React subscribes to the bridge to stay in sync.
 */
export function hydrateMorePopover(): MorePopoverHandle | null {
  const popover = document.getElementById(POPOVER_ID);
  if (!popover) return null;
  /* M2 sentinel: replaced the legacy `data-react-migration-runtime`
     attribute with `dataset.mountedBy`. */
  if (popover.dataset.mountedBy === 'more-popover') {
    throw new Error('More popover React runtime was initialized more than once.');
  }

  installMorePopoverBridge();

  const root = createRoot(popover);
  root.render(<MorePopover />);
  popover.dataset.mountedBy = 'more-popover';
  return {
    popover,
    root,
    destroy: () => {
      root.unmount();
      delete popover.dataset.mountedBy;
    },
  };
}
