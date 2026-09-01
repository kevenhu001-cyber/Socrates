import { createRoot, type Root } from 'react-dom/client';

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
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  },
  {
    key: 'projects',
    label: 'Projects',
    i18nKey: 'sidebar.nav.projects',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h12"/></svg>',
  },
  {
    key: 'library',
    label: 'Library',
    i18nKey: 'sidebar.nav.library',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    i18nKey: 'sidebar.nav.scheduled',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
  },
  {
    key: 'plugins',
    label: 'Plugins',
    i18nKey: 'sidebar.nav.plugins',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><rect x="5" y="10" width="6" height="4" rx="1"/><rect x="13" y="10" width="6" height="4" rx="1"/></svg>',
  },
  {
    key: 'exam',
    label: 'Exam',
    i18nKey: 'sidebar.nav.exam',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  },
  {
    key: 'skills',
    label: 'Skills & shortcuts',
    i18nKey: 'sidebar.more.skills',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>',
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
            onClick={() => {
              if (button.key === 'new') {
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
 * owns only its direct children (the 7 buttons).
 *
 * Callers claim the element through `dataset.mountedBy`. The React buttons
 * re-publish active state through the bridge, while legacy selectors keep
 * working because the buttons remain inside the same host.
 */
export function hydrateSidebarNav(): SidebarNavHandle | null {
  const nav = document.getElementById(NAV_ID);
  if (!nav) return null;
  if (nav.dataset.mountedBy === 'sidebar-nav') {
    throw new Error('Sidebar nav React runtime was initialized more than once.');
  }

  seedSidebarBridgesFromLegacy();

  const root = createRoot(nav);
  root.render(<SidebarNav />);
  nav.dataset.mountedBy = 'sidebar-nav';
  return {
    nav,
    root,
    destroy: () => {
      root.unmount();
      delete nav.dataset.mountedBy;
    },
  };
}
