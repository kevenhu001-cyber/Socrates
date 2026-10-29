import type { MouseEvent } from 'react';
import { t as translate } from '../legacy/gateway.ts';
import { Button } from '../ui/shadcn/button';
import { Badge } from '../ui/shadcn/badge';
import { navButtonId, type NavButtonSpec } from './sidebarNav.items';

function i18n(key: string, fallback: string): string {
  const value = translate(key);
  return value !== key ? value : fallback;
}

/* Keep the measured row size and shell hook; shadcn's ghost recipe owns the
 * control skin and interaction states. */
const ROW_CLASS = [
  'sidebar-nav-btn',
  'relative flex max-[768px]:grid w-full shrink-0 items-center justify-start max-[768px]:justify-center',
  'h-(--ui-control-desktop) min-h-(--ui-control-desktop) max-[768px]:h-(--ui-mobile-row) max-[768px]:min-h-(--ui-mobile-row)',
  'gap-1.5 max-[768px]:gap-x-3 px-2.5 py-1.5 max-[768px]:px-4 max-[768px]:py-0',
  'text-start',
  'whitespace-nowrap cursor-pointer select-none',
  'aria-[current=page]:font-medium',
  "[&_svg:not([class*='size-'])]:size-5",
].join(' ');

const GLYPH_CLASS = 'grid size-5 basis-5 shrink-0 place-items-center';
const LABEL_CLASS = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap';

function visibilityClass(key: NavButtonSpec['key']): string {
  if (key === 'images') return 'min-[769px]:hidden max-[768px]:grid';
  if (key === 'assistants' || key === 'exam' || key === 'skills') return 'hidden';
  return '';
}

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
      variant={item.key === 'new' ? 'secondary' : 'ghost'}
      className={`${ROW_CLASS} ${visibilityClass(item.key)}`}
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
          <Badge variant="secondary" className="nav-new-badge" data-i18n-key={item.badgeKey}>{i18n(item.badgeKey, 'New')}</Badge>
        </span>
      ) : (
        <span className={LABEL_CLASS} data-i18n-key={item.i18nKey}>{label}</span>
      )}
      {item.key === 'new' ? <span className="nav-kbd hidden">{i18n('sidebar.nav.kbd', '⌘K')}</span> : null}
    </Button>
  );
}
