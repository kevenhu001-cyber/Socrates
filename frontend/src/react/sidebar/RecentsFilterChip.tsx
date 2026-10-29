import { Button } from '../ui/shadcn/button';
import { t } from '../legacy/gateway.ts';
import type { ChipDescriptor } from './recentsFilterChips.model';

/* The chip classes retain geometry markers; pressed-state paint comes from
 * the shadcn ghost recipe and the Neutral semantic roles. */
const CHIP = 'recents-filter-chip-btn';

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
        className={CHIP}
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
        className={CHIP}
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
      className={CHIP}
      data-filter={chip.value}
      aria-pressed={chip.active}
      onClick={() => onPick(chip.value)}
    >
      {chip.label}
    </Button>
  );
}
