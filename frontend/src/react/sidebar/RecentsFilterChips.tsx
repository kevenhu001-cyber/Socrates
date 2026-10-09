import { clearHostMounted, hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { createRoot, type Root } from 'react-dom/client';
import { useSyncExternalStore } from 'react';

import { getKnownTagsFromSessions } from '../../ui/recentsHelpers.js';
import { serverCache } from '../../session/serverCache.js';
import {
  getProjectCacheSnapshot,
  subscribeToProjectCache,
} from '../../projects/projectCache.ts';
import { onRecentsFilterChipClick, hydrateRecentsFilterState } from '../../sidebar/sidebar.service';
import { useSidebarStore } from '../../sidebar/sidebar.store';
import { RecentsFilterChip } from './RecentsFilterChip';
import { buildChips } from './recentsFilterChips.model';

const TARGET_ID = 'recentsFilterChips';

function RecentsFilterChips() {
  const filter = useSidebarStore((state) => state.recentsFilter);
  useSidebarStore((state) => state.recentsVersion);
  const pick = onRecentsFilterChipClick;
  const projects = useSyncExternalStore(
    subscribeToProjectCache,
    getProjectCacheSnapshot,
    getProjectCacheSnapshot,
  ) ?? [];
  const tags = getKnownTagsFromSessions(serverCache.sessions);
  const chips = buildChips(filter, projects, tags);

  const projectChips = chips.filter((c) => c.kind === 'project');
  const tagChips = chips.filter((c) => c.kind === 'tag');
  const allChip = chips.find((c) => c.kind === 'all');

  return (
    <>
      {allChip ? <RecentsFilterChip chip={allChip} onPick={pick} /> : null}
      {projectChips.length > 0 ? (
        <>
          <span className="recents-filter-chips-sep" />
          {projectChips.map((chip) => (
            <RecentsFilterChip key={chip.value} chip={chip} onPick={pick} />
          ))}
        </>
      ) : null}
      {tagChips.length > 0 ? (
        <>
          <span className="recents-filter-chips-sep" />
          {tagChips.map((chip) => (
            <RecentsFilterChip key={chip.value} chip={chip} onPick={pick} />
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
  if (hostIsMountedBy(target, 'recents-filter-chips')) {
    throw new Error('Recents filter chips React runtime was initialized more than once.');
  }

  hydrateRecentsFilterState();
  const root = createRoot(target);
  root.render(<RecentsFilterChips />);
  markHostMountedBy(target, 'recents-filter-chips');
  return {
    target,
    root,
    destroy: () => {
      root.unmount();
      clearHostMounted(target);
    },
  };
}
