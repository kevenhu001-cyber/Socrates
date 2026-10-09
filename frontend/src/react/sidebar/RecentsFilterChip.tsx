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
      <button
        type="button"
        className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
        data-filter="all"
        aria-pressed={chip.active}
        onClick={() => onPick('all')}
      >
        <span data-i18n-key="sidebar.all">{t('sidebar.all')}</span>
      </button>
    );
  }
  if (chip.kind === 'project') {
    return (
      <button
        type="button"
        className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
        data-filter={chip.value}
        aria-pressed={chip.active}
        aria-label={t('session.filterByTag').replace('{tag}', chip.name)}
        onClick={() => onPick(chip.value)}
      >
        <span className="recents-filter-chip-icon">●</span>
        {chip.name}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`recents-filter-chip-btn${chip.active ? ' active' : ''}`}
      data-filter={chip.value}
      aria-pressed={chip.active}
      onClick={() => onPick(chip.value)}
    >
      {chip.label}
    </button>
  );
}
