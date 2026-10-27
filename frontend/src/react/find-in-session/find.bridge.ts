/** Module-owned find state, shared by actions and React subscribers. */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import type {
  FindInSessionBridge,
  FindInSessionSnapshot,
} from './types';

const CLOSED: FindInSessionSnapshot = {
  isOpen: false,
  query: '',
  matchCount: 0,
  activeIndex: -1,
};

type Action = FindInSessionSnapshot;

const factoryBridge = createImmutableBridge<FindInSessionSnapshot & { revision: number }, Action>({
  initial: { ...CLOSED, revision: 0 },
  reducer: (_state, action) => action,
});

const bridge: FindInSessionBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as FindInSessionBridge;

export function installFindInSessionBridge(): FindInSessionBridge {
  return bridge;
}

export function getFindInSessionSnapshot(): FindInSessionSnapshot {
  const { revision: _ignored, ...rest } = factoryBridge.getSnapshot();
  return rest;
}

export function subscribeToFindInSession(listener: () => void): () => void {
  return installFindInSessionBridge().subscribe(listener);
}

export function useFindInSessionSnapshot(): FindInSessionSnapshot {
  const full = useBridge(factoryBridge);
  const { revision: _ignored, ...rest } = full;
  return rest;
}
