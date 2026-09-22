import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getLegacyActions, t as _t } from '../legacy/gateway';
import { seedSidebarBridgesFromLegacy, useActiveNav, useSidebarNavCommands } from './sidebar.bridge';
import type { SidebarNavKey } from './types';

const NAV_ID = 'sidebarNav';

interface NavButtonSpec {
  key: SidebarNavKey | 'new' | 'skills';
  label: string;
  i18nKey: string;
  icon: string;
}

const BUTTONS: NavButtonSpec[] = [
  {
    key: 'new',
    label: 'New chat',
    i18nKey: 'sidebar.nav.new',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  },
  {
    key: 'library',
    label: 'Library',
    i18nKey: 'sidebar.nav.library',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  },
  {
    key: 'projects',
    label: 'Projects',
    i18nKey: 'sidebar.nav.projects',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14l-6.5-4L6 21z"/></svg>',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    i18nKey: 'sidebar.nav.scheduled',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  },
  {
    key: 'plugins',
    label: 'Plugins',
    i18nKey: 'sidebar.nav.plugins',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v3"/><path d="M15 3v3"/><path d="M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M9 11h6"/><path d="M9 15h4"/></svg>',
  },
  {
    key: 'more',
    label: 'More',
    i18nKey: 'sidebar.nav.more',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
  },
  {
    key: 'exam',
    label: 'Exam',
    i18nKey: 'sidebar.nav.exam',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  },
  {
    key: 'skills',
    label: 'Skills & shortcuts',
    i18nKey: 'sidebar.more.skills',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4.5 8.6 8.1 5 9.5l3.6 1.4L10 14.5l1.4-3.6L15 9.5l-3.6-1.4z"/><path d="M17.5 13.5l-.9 2.1-2.1.9 2.1.9.9 2.1.9-2.1 2.1-.9-2.1-.9z"/></svg>',
  },
];

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function navButtonId(key: SidebarNavKey | 'new' | 'skills'): string {
  if (key === 'new') return 'navNew';
  return `nav${(key as string)[0].toUpperCase()}${(key as string).slice(1)}`;
}

function SidebarNav() {
  const active = useActiveNav();
  const { open } = useSidebarNavCommands();

  return (
    <>
      {BUTTONS.map((button) => {
        const isActive = button.key !== 'new' && button.key !== 'skills' && active === button.key;
        const label = i18n(button.i18nKey, button.label);
        return (
          <button
            key={button.key}
            type="button"
            className={`sidebar-nav-btn${isActive ? ' active' : ''}`}
            data-nav={button.key}
            id={navButtonId(button.key)}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              if (button.key === 'new') {
                /* The ⌘K badge names the command palette shortcut, so a
                   click there must open the palette instead of resetting. */
                if (event.target instanceof Element && event.target.closest('.nav-kbd')) {
                  window.openCmdK?.();
                  return;
                }
                getLegacyActions().navigation.resetApp();
              } else if (button.key === 'skills') {
                getLegacyActions().navigation.openPromptTemplatesModal();
              } else if (button.key !== null) {
                open(button.key);
              }
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: button.icon }} />
            <span data-i18n-key={button.i18nKey}>{label}</span>
            {button.key === 'new' ? (
              <span className="nav-kbd">{i18n('sidebar.nav.kbd', '⌘K')}</span>
            ) : null}
          </button>
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
 * The React buttons re-publish active state through the bridge, while legacy
 * selectors keep working because the buttons remain inside the same host.
 */
export function hydrateSidebarNav(): SidebarNavHandle | null {
  const nav = document.getElementById(NAV_ID);
  if (!nav) return null;
  if (hostIsMountedBy(nav, 'sidebar-nav')) {
    throw new Error('Sidebar nav React runtime was initialized more than once.');
  }

  seedSidebarBridgesFromLegacy();

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
