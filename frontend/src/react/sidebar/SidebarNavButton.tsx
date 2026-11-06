import { t as translate } from '../legacy/gateway.ts';
import { SidebarNavRow } from '@socrates/ui/shell';
import type { UiGlyphName } from '@socrates/ui/primitives';
import type { TextStyle } from 'react-native';
import { webClass } from '../rn/webHost';
import { navButtonId, type NavButtonSpec } from './sidebarNav.items';

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

/* The shared shell draws glyphs from its own dot-free line set. */
const GLYPHS: Record<NavButtonSpec['key'], UiGlyphName> = {
  new: 'compose',
  library: 'library',
  projects: 'folder',
  scheduled: 'clock',
  plugins: 'puzzle',
  images: 'image',
  assistants: 'assistant',
  sites: 'site',
  exam: 'exam',
  skills: 'skills',
  more: 'more',
} as Record<NavButtonSpec['key'], UiGlyphName>;

/* The label size is a CSS role so the phone drawer can take the reference's
   17px step (polish/mobile-sidebar.css sets --nav-label-size under
   768px); everywhere else it resolves to the shared 14px body-sm step. */
const LABEL_STYLE = {
  fontSize: 'var(--nav-label-size, var(--ui-font-size-sm))',
} as unknown as TextStyle;

/*
 * RN-7 — one primary destination, drawn by the shared RN shell row
 * (packages/ui/src/shell/Sidebar.tsx). `sidebar-nav-btn` / `active` stay as
 * class hooks: the shell CSS keys the collapsed rail, the phone drawer and
 * the per-destination order off them, and e2e reads `active` as the
 * selected-state marker.
 */
export function SidebarNavButton({
  item,
  active,
  expanded,
  onClick,
}: {
  item: NavButtonSpec;
  active: boolean;
  expanded?: boolean;
  onClick: () => void;
}) {
  const label = i18n(item.i18nKey, item.label);
  return (
    <SidebarNavRow
      id={navButtonId(item.key)}
      navKey={item.key}
      icon={GLYPHS[item.key] ?? 'compose'}
      label={label}
      i18nKey={item.i18nKey}
      badge={item.badgeKey ? i18n(item.badgeKey, 'New') : undefined}
      badgeI18nKey={item.badgeKey}
      active={active}
      menu={item.key === 'more' ? { expanded: Boolean(expanded), controls: 'moreNavPopover' } : undefined}
      activeShadow="var(--ui-elevation-raised)"
      hostStyle={webClass('sidebar-nav-btn', active && 'active')}
      badgeStyle={webClass('nav-new-badge')}
      labelStyle={LABEL_STYLE}
      onPress={onClick}
    />
  );
}
