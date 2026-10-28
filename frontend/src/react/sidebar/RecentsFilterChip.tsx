import { Button } from '../ui/shadcn/button';
import { t } from '../legacy/gateway.ts';
import type { ChipDescriptor } from './recentsFilterChips.model';

/*
 * The chips keep their legacy class as the row marker (border-radius, 10px
 * label, the 1.5px active tick) while the primitive underneath is the shadcn
 * button. Its base sits in @layer utilities, so the unlayered chip rules still
 * own the paint until they are retired.
 */
const CHIP = 'recents-filter-chip-btn active:not-aria-[haspopup]:translate-y-0';

export function RecentsFilterChip({
  chip,
  onPick,
}: {
  chip: ChipDescriptor;
  onPick: (value: string) => void;
}) {
  if (chip.kind === 'all') {
    return (
      <Button
        variant="ghost"
        type="button"
        className={`${CHIP}${chip.active ? ' active' : ''}`}
        data-filter="all"
        aria-pressed={chip.active}
        onClick={() => onPick('all')}
      >
        <span data-i18n-key="sidebar.all">{t('sidebar.all')}</span>
      </Button>
    );
  }
  if (chip.kind === 'project') {
    return (
      <Button
        variant="ghost"
        type="button"
        className={`${CHIP}${chip.active ? ' active' : ''}`}
        data-filter={chip.value}
        aria-pressed={chip.active}
        aria-label={t('session.filterByProject').replace('{project}', chip.name)}
        onClick={() => onPick(chip.value)}
      >
        <span className="recents-filter-chip-icon">●</span>
        {chip.name}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      type="button"
      className={`${CHIP}${chip.active ? ' active' : ''}`}
      data-filter={chip.value}
      aria-pressed={chip.active}
      onClick={() => onPick(chip.value)}
    >
      {chip.label}
    </Button>
  );
}
