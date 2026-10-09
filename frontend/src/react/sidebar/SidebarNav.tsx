import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getLegacyActions, t as _t } from '../legacy/gateway.ts';
import { openNav } from '../../sidebar/navigation.service';
import { useNavigationStore } from '../../sidebar/navigation.store';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import type { SidebarNavKey } from './types';

const NAV_ID = 'sidebarNav';

interface NavButtonSpec {
  key: SidebarNavKey | 'new' | 'skills';
  label: string;
  i18nKey: string;
  icon: string;
  /* Trailing badge next to the Sites label. */
  badgeKey?: string;
}

const BUTTONS: NavButtonSpec[] = [
  {
    key: 'new',
    label: 'New chat',
    i18nKey: 'sidebar.nav.new',
    icon: sidebarIcons.newChat,
  },
  {
    key: 'library',
    label: 'Library',
    i18nKey: 'sidebar.nav.library',
    icon: sidebarIcons.library,
  },
  {
    key: 'projects',
    label: 'Projects',
    i18nKey: 'sidebar.nav.projects',
    icon: sidebarIcons.projects,
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    i18nKey: 'sidebar.nav.scheduled',
    icon: sidebarIcons.scheduled,
  },
  {
    key: 'plugins',
    label: 'Plugins',
    i18nKey: 'sidebar.nav.plugins',
    icon: sidebarIcons.plugins,
  },
  {
    key: 'images',
    label: 'Images',
    i18nKey: 'sidebar.nav.images',
    icon: sidebarIcons.images,
  },
  {
    key: 'assistants',
    label: 'Assistants',
    i18nKey: 'sidebar.nav.assistants',
    icon: sidebarIcons.assistants,
  },
  {
    key: 'sites',
    label: 'Sites',
    i18nKey: 'sidebar.nav.sites',
    icon: sidebarIcons.sites,
    badgeKey: 'sidebar.nav.newBadge',
  },
  {
    key: 'exam',
    label: 'Exam',
    i18nKey: 'sidebar.nav.exam',
    icon: sidebarIcons.exam,
  },
  {
    key: 'more',
    label: 'More',
    i18nKey: 'sidebar.nav.more',
    icon: sidebarIcons.more,
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
  const active = useNavigationStore((state) => state.activeDestination);

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
                openNav(button.key);
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
