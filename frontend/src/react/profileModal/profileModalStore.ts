import type {
  ProfileBridge,
  ProfileSnapshot,
} from './types';

type Listener = () => void;

const INITIAL_USER = Object.freeze({
  initials: '',
  displayName: '',
  email: '',
  joinedAt: '',
  verifiedAt: null,
  userId: '',
  tier: 'diophantus',
  subEnd: null,
});

const HIDDEN: ProfileSnapshot = Object.freeze({
  isOpen: false,
  user: INITIAL_USER,
  webSearchOn: false,
  currentLang: 'en',
  instResponse: '',
  instAbout: '',
  instSaveState: null,
  revision: 0,
});

let snapshot: ProfileSnapshot = HIDDEN;
const listeners = new Set<Listener>();

function commit(next: Omit<ProfileSnapshot, 'revision'>): void {
  snapshot = Object.freeze({
    ...next,
    user: Object.freeze({ ...next.user }),
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function getSnapshot(): ProfileSnapshot {
  return snapshot;
}

function publish(next: Omit<ProfileSnapshot, 'revision'>): void {
  commit(next);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: ProfileBridge = {
  getSnapshot,
  publish,
  subscribe,
};

export function installProfileBridge(): ProfileBridge {
  const existing = window.__socratesProfileBridge;
  if (existing) return existing;
  window.__socratesProfileBridge = bridge;
  return bridge;
}

export function getProfileSnapshot(): ProfileSnapshot {
  return installProfileBridge().getSnapshot();
}

export function subscribeToProfile(listener: Listener): () => void {
  return installProfileBridge().subscribe(listener);
}
