import type { SidebarChromeBridge, SidebarChromeSnapshot, UserInfo } from './types';

type Listener = () => void;

const GUEST_USER: UserInfo = Object.freeze({
  initials: '?',
  displayName: 'Guest',
  email: '',
  tier: 'diophantus',
  tierLabel: 'Free',
  isSignedIn: false,
});

const INITIAL_SNAPSHOT: SidebarChromeSnapshot = Object.freeze({
  user: GUEST_USER,
  revision: 0,
});

let snapshot: SidebarChromeSnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<Listener>();

function commit(next: Omit<SidebarChromeSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): SidebarChromeSnapshot {
  return snapshot;
}

function publish(next: Omit<SidebarChromeSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: SidebarChromeBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installSidebarChromeBridge(): SidebarChromeBridge {
  const existing = window.__socratesSidebarChromeBridge;
  if (existing) return existing;
  window.__socratesSidebarChromeBridge = bridge;
  return bridge;
}

export function getSidebarChromeSnapshot(): SidebarChromeSnapshot {
  return installSidebarChromeBridge().getSnapshot();
}

export function subscribeToSidebarChrome(listener: Listener): () => void {
  return installSidebarChromeBridge().subscribe(listener);
}
