import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import type { Root } from 'react-dom/client';
import { useEffect, useReducer, useSyncExternalStore } from 'react';

import { getKnownTagsFromSessions } from '../../ui/recentsHelpers.ts';
import { serverCache } from '../../session/serverCache.ts';
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
  const [, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
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
 * renderer reads the ownership registry so the two never fight.
 */
export function hydrateRecentsFilterChips(): RecentsChipsHandle | null {
  const target = document.getElementById(TARGET_ID);
  if (!target) return null;
  return { target, ...mountOwnedRoot(target, 'recents-filter-chips', <RecentsFilterChips />, hydrateRecentsFilterState) };
}
