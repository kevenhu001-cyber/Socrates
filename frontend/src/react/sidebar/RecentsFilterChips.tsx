import { createRoot, type Root } from 'react-dom/client';

import { getKnownTagsFromSessions } from '../../ui/recentsHelpers.js';
import { getLegacyStateValue, t } from '../legacy/gateway';
import {
  useRecentsFilter,
  useRecentsFilterCommands,
  useRecentsFilterSnapshot,
} from './sidebar.bridge';

const TARGET_ID = 'recentsFilterChips';

interface ProjectChip {
  kind: 'project';
  id: string;
  name: string;
  value: string;
}

interface TagChip {
  kind: 'tag';
  value: string;
  label: string;
}

interface AllChip {
  kind: 'all';
}

type ChipDescriptor = (AllChip | ProjectChip | TagChip) & { active: boolean };

function readProjects(): ReadonlyArray<{ id: string; name: string }> {
  const cache = getLegacyStateValue('__projectsCache', []);
  return Array.isArray(cache) ? cache as ReadonlyArray<{ id: string; name: string }> : [];
}

function readTags(): string[] {
  const sessions = getLegacyStateValue('SERVER_SESSIONS', []);
  return getKnownTagsFromSessions(Array.isArray(sessions) ? sessions as Array<{ tags?: string[] }> : []).slice(0, 8);
}

function buildChips(currentFilter: string | null): ChipDescriptor[] {
  const chips: ChipDescriptor[] = [];
  const activeAll = !currentFilter || currentFilter === 'all';
  chips.push({ kind: 'all', active: activeAll });

  const projects = readProjects();
  projects.forEach((project) => {
    const value = `project:${project.id}`;
    chips.push({
      kind: 'project',
      id: project.id,
      name: project.name,
      value,
      active: currentFilter === value,
    });
  });

  const tags = readTags();
  const tagSet = new Set(tags);
  if (
    currentFilter &&
    currentFilter.indexOf('project:') !== 0 &&
    !tagSet.has(currentFilter)
  ) {
    tags.push(currentFilter);
  }
  tags.forEach((tag) => {
    chips.push({ kind: 'tag', value: tag, label: `#${tag}`, active: currentFilter === tag });
  });

  return chips;
}

function ChipButton({
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

function RecentsFilterChips() {
  useRecentsFilterSnapshot(); // subscribe so re-renders fire on filter change
  const filter = useRecentsFilter();
  const { pick } = useRecentsFilterCommands();
  const chips = buildChips(filter);

  const projectChips = chips.filter((c) => c.kind === 'project');
  const tagChips = chips.filter((c) => c.kind === 'tag');
  const allChip = chips.find((c) => c.kind === 'all');

  return (
    <>
      {allChip ? <ChipButton chip={allChip} onPick={pick} /> : null}
      {projectChips.length > 0 ? (
        <>
          <span className="recents-filter-chips-sep" />
          {projectChips.map((chip) => (
            <ChipButton key={chip.value} chip={chip} onPick={pick} />
          ))}
        </>
      ) : null}
      {tagChips.length > 0 ? (
        <>
          <span className="recents-filter-chips-sep" />
          {tagChips.map((chip) => (
            <ChipButton key={chip.value} chip={chip} onPick={pick} />
          ))}
        </>
      ) : null}
    </>
  );
}

export interface RecentsChipsHandle {
  target: HTMLElement;
  root: Root;
  destroy: () => void;
}

/**
 * Hydrate the legacy `#recentsFilterChips` element with React. Idempotent.
 * The chip-bar element keeps its id, classes, and CSS styling; React owns
 * only its direct children (the chip buttons + separators). The legacy
 * renderer is suppressed by a data-attribute guard so the two never fight.
 */
export function hydrateRecentsFilterChips(): RecentsChipsHandle | null {
  const target = document.getElementById(TARGET_ID);
  if (!target) return null;
  if (target.dataset.mountedBy === 'recents-filter-chips') {
    throw new Error('Recents filter chips React runtime was initialized more than once.');
  }

  const root = createRoot(target);
  root.render(<RecentsFilterChips />);
  target.dataset.mountedBy = 'recents-filter-chips';
  return {
    target,
    root,
    destroy: () => {
      root.unmount();
      delete target.dataset.mountedBy;
    },
  };
}
