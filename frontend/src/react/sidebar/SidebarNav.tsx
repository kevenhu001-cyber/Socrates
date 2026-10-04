import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getLegacyActions, t as _t } from '../legacy/gateway.ts';
import { seedSidebarBridgesFromLegacy, useActiveNav, useSidebarNavCommands } from './sidebar.bridge';
import type { SidebarNavKey } from './types';

const NAV_ID = 'sidebarNav';

interface NavButtonSpec {
  key: SidebarNavKey | 'new' | 'skills';
  label: string;
  i18nKey: string;
  icon: string;
  /* Trailing affordances copied from the chatgpt.com drawer: a pill badge
     next to the label (Sites "New") and a row-end + button (Projects). */
  badgeKey?: string;
  addTarget?: boolean;
}

const ADD_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

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
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
  },
  {
    key: 'projects',
    label: 'Projects',
    i18nKey: 'sidebar.nav.projects',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    addTarget: true,
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
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3a1 1 0 0 0 1-1V5a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1a2 2 0 0 0-4 0v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H4a2 2 0 0 1 0-4h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1z"/></svg>',
  },
  {
    key: 'images',
    label: 'Images',
    i18nKey: 'sidebar.nav.images',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 3 3 2-2 6 6"/></svg>',
  },
  {
    key: 'assistants',
    label: 'Assistants',
    i18nKey: 'sidebar.nav.assistants',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 10h.01M15 10h.01M9 15c1.8 1.6 4.2 1.6 6 0"/></svg>',
  },
  {
    key: 'sites',
    label: 'Sites',
    i18nKey: 'sidebar.nav.sites',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    badgeKey: 'sidebar.nav.newBadge',
  },
  {
    key: 'exam',
    label: 'Exam',
    i18nKey: 'sidebar.nav.exam',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  },
  {
    key: 'more',
    label: 'More',
    i18nKey: 'sidebar.nav.more',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
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
            className={`btn btn-ghost btn-touch sidebar-nav-btn${isActive ? ' active' : ''}`}
            data-nav={button.key}
            id={navButtonId(button.key)}
            data-i18n-title={button.i18nKey}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              /* The row-end + affordance (Projects) opens the create flow
                 instead of just navigating, same as chatgpt.com's drawer. */
              const addTarget = event.target instanceof Element
                && event.target.closest('.nav-item-add');
              if (addTarget && button.key === 'projects') {
                open('projects');
                getLegacyActions().workspace.openCreateProject();
                return;
              }
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
              } else if (button.key !== null) {
                open(button.key);
              }
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: button.icon }} />
            {button.badgeKey ? (
              /* The badge hugs the label text like the reference drawer, so
                 both live in one label cell — applyI18n only writes
                 textContent on the leaf spans, leaving the badge intact. */
              <span className="nav-label-wrap">
                <span data-i18n-key={button.i18nKey}>{label}</span>
                <span className="nav-new-badge" data-i18n-key={button.badgeKey}>{i18n(button.badgeKey, 'New')}</span>
              </span>
            ) : (
              <span data-i18n-key={button.i18nKey}>{label}</span>
            )}
            {button.addTarget ? (
              <span
                className="nav-item-add"
                role="button"
                title={i18n('sidebar.spaces.create', 'New project')}
                aria-label={i18n('sidebar.spaces.create', 'New project')}
                data-i18n-title="sidebar.spaces.create"
                data-i18n-aria="sidebar.spaces.create"
                dangerouslySetInnerHTML={{ __html: ADD_ICON }}
              />
            ) : null}
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
