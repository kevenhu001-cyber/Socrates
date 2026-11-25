import { t as translate } from '../../ui/legacyI18n.ts';
import { SidebarNavRow } from '@socrates/ui/shell';
import type { UiGlyphName, TextStyle } from '@socrates/ui/primitives';
import { useMobileViewport } from '../sidebar-chrome/useMobileViewport';
import { webClass } from '../rn/webHost';
import { navButtonId, type NavButtonSpec } from './sidebarNav.items';

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

/* The shared shell draws glyphs from the shared interface icon set. */
const GLYPHS: Record<NavButtonSpec['key'], UiGlyphName> = {
  new: 'compose',
  search: 'search',
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
   phone step (polish/mobile-sidebar.css sets --nav-label-size under
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
  const mobile = useMobileViewport();
  const label = i18n(item.i18nKey, item.label);
  // The web renderer selects the verified OpenAI geometry for these keys.
  // Viewport size changes the footprint, never the icon's shape.
  const glyph = GLYPHS[item.key] ?? 'compose';
  return (
    <SidebarNavRow
      id={navButtonId(item.key)}
      navKey={item.key}
      icon={glyph}
      iconSize={mobile ? 24 : 20}
      iconStrokeWidth={1.5}
      label={label}
      i18nKey={item.i18nKey}
      badge={item.badgeKey ? i18n(item.badgeKey, 'New') : undefined}
      badgeI18nKey={item.badgeKey}
      active={active}
      menu={
        item.key === 'more'
          ? { expanded: Boolean(expanded), controls: 'moreNavPopover' }
          : undefined
      }
      activeShadow="none"
      backgroundVar="--sidebar-nav-bg"
      hostStyle={webClass('sidebar-nav-btn', active && 'active')}
      badgeStyle={webClass('nav-new-badge')}
      labelStyle={LABEL_STYLE}
      onPress={onClick}
    />
  );
}
