import type { MouseEvent } from 'react';
import { t as translate } from '../legacy/gateway.ts';
import { Button } from '../ui/shadcn/button';
import { navButtonId, type NavButtonSpec } from './sidebarNav.items';

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

/*
 * Geometry comes from the control ladder, not from shadcn's defaults:
 * a --ui-control-desktop row, the chatgpt.com 6/10 padding rhythm and the
 * --ui-radius-row radius. Everything else is the ghost variant's own paint.
 * `sidebar-nav-btn` survives only as the row marker the shell's structural
 * rules (collapsed rail, press tint, per-destination order) key off.
 */
const ROW_CLASS = [
  'sidebar-nav-btn',
  'relative flex w-full shrink-0 items-center justify-start max-[768px]:justify-center',
  'h-(--ui-control-desktop) min-h-(--ui-control-desktop)',
  'gap-1.5 border-0 rounded-[var(--ui-radius-row)] bg-transparent px-2.5 py-1.5',
  'text-base font-normal leading-[var(--ui-text-body-line)] text-foreground text-start',
  'whitespace-nowrap cursor-pointer select-none',
  'transition-colors duration-(--ui-duration-hover)',
  'hover:bg-accent focus-visible:bg-accent',
  'aria-[current=page]:bg-accent [&[aria-current=page]]:[font-weight:var(--ui-font-weight-medium)]',
  'active:not-aria-[haspopup]:translate-y-0',
  "[&_svg:not([class*='size-'])]:size-5",
].join(' ');

const GLYPH_CLASS = 'grid size-5 basis-5 shrink-0 place-items-center';
const LABEL_CLASS = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap';

export function SidebarNavButton({
  item,
  active,
  onClick,
}: {
  item: NavButtonSpec;
  active: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const label = i18n(item.i18nKey, item.label);
  return (
    <Button
      type="button"
      variant="ghost"
      className={`${ROW_CLASS}${active ? ' active' : ''}`}
      data-nav={item.key}
      id={navButtonId(item.key)}
      data-i18n-title={item.i18nKey}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className={GLYPH_CLASS} dangerouslySetInnerHTML={{ __html: item.icon }} />
      {item.badgeKey ? (
        <span className={`nav-label-wrap ${LABEL_CLASS}`}>
          <span data-i18n-key={item.i18nKey}>{label}</span>
          <span className="nav-new-badge" data-i18n-key={item.badgeKey}>{i18n(item.badgeKey, 'New')}</span>
        </span>
      ) : (
        <span className={LABEL_CLASS} data-i18n-key={item.i18nKey}>{label}</span>
      )}
      {item.key === 'new' ? <span className="nav-kbd hidden">{i18n('sidebar.nav.kbd', '⌘K')}</span> : null}
    </Button>
  );
}
