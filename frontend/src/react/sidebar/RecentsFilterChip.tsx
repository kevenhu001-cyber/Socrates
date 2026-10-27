import { Button } from '../ui/Button';
import { t } from '../legacy/gateway.ts';
import type { ChipDescriptor } from './recentsFilterChips.model';

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
        type="button"
        className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
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
        type="button"
        className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
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
      type="button"
      className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
      data-filter={chip.value}
      aria-pressed={chip.active}
      onClick={() => onPick(chip.value)}
    >
      {chip.label}
    </Button>
  );
}
