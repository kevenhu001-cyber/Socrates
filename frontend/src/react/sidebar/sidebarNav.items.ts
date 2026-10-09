import { sidebarIcons } from '../../sidebar/sidebarIcons';
import type { SidebarNavKey } from './types';

export const NAV_ID = 'sidebarNav';

type NavButtonKey = Exclude<SidebarNavKey, null> | 'new' | 'skills';

export interface NavButtonSpec {
  key: NavButtonKey;
  label: string;
  i18nKey: string;
  icon: string;
  /** Trailing badge next to the Sites label. */
  badgeKey?: string;
}

export const BUTTONS: NavButtonSpec[] = [
  { key: 'new', label: 'New chat', i18nKey: 'sidebar.nav.new', icon: sidebarIcons.newChat },
  { key: 'library', label: 'Library', i18nKey: 'sidebar.nav.library', icon: sidebarIcons.library },
  { key: 'projects', label: 'Projects', i18nKey: 'sidebar.nav.projects', icon: sidebarIcons.projects },
  { key: 'scheduled', label: 'Scheduled', i18nKey: 'sidebar.nav.scheduled', icon: sidebarIcons.scheduled },
  { key: 'plugins', label: 'Plugins', i18nKey: 'sidebar.nav.plugins', icon: sidebarIcons.plugins },
  { key: 'images', label: 'Images', i18nKey: 'sidebar.nav.images', icon: sidebarIcons.images },
  { key: 'assistants', label: 'Assistants', i18nKey: 'sidebar.nav.assistants', icon: sidebarIcons.assistants },
  {
    key: 'sites',
    label: 'Sites',
    i18nKey: 'sidebar.nav.sites',
    icon: sidebarIcons.sites,
    badgeKey: 'sidebar.nav.newBadge',
  },
  { key: 'exam', label: 'Exam', i18nKey: 'sidebar.nav.exam', icon: sidebarIcons.exam },
  { key: 'more', label: 'More', i18nKey: 'sidebar.nav.more', icon: sidebarIcons.more },
];

export function navButtonId(key: NavButtonSpec['key']): string {
  if (key === 'new') return 'navNew';
  return `nav${key[0].toUpperCase()}${key.slice(1)}`;
}
