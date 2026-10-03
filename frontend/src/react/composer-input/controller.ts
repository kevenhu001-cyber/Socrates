import type { ComposerExtensionToken } from './types';

export type ComposerSurface = 'topic' | 'chat';

export interface ComposerSelection {
  from: number;
  to: number;
}

export interface ComposerHandle {
  getMarkdown(): string;
  setMarkdown(value: string): void;
  insertText(value: string): void;
  clear(): void;
  setExtensionToken(token: ComposerExtensionToken | null): void;
  getExtensionToken(): ComposerExtensionToken | null;
  focus(position?: 'start' | 'end'): void;
  getSelection(): ComposerSelection;
  isVisible(): boolean;
}

type Listener = (surface: ComposerSurface, value: string) => void;

/* P_composer-single — ONE live editor for the whole app. `currentHandle`
   is that editor once mounted; `stored` parks each surface's draft while
   it is not active, so flips restore exactly what each surface had (the
   two-box behaviour, without two boxes). Reads/writes that name the
   ACTIVE surface hit the live editor; ones that name the inactive
   surface read/write its stash — callers keep passing explicit surfaces
   and observe the same values as with two mounted editors. */
let currentHandle: ComposerHandle | null = null;
const stored = new Map<ComposerSurface, string>();
const storedExtensionTokens = new Map<ComposerSurface, ComposerExtensionToken | null>();
const listeners = new Set<Listener>();
let appliedInitialDraft = false;

function activeSurface(): ComposerSurface {
  return readComposerSurface();
}

export function registerComposer(surface: ComposerSurface, handle: ComposerHandle): () => void {
  currentHandle = handle;
  /* Pre-mount writes (session restore paths) land here exactly once; the
     flip path consumes its stash synchronously in swapComposerSurface, so
     later re-registrations find nothing and stay a no-op. */
  if (!appliedInitialDraft) {
    appliedInitialDraft = true;
    const surfaceNow = activeSurface();
    if (stored.has(surfaceNow)) {
      const value = stored.get(surfaceNow) ?? '';
      stored.delete(surfaceNow);
      try { handle.setMarkdown(value); } catch (_) { /* editor not ready */ }
    }
    if (storedExtensionTokens.has(surfaceNow)) {
      const token = storedExtensionTokens.get(surfaceNow) ?? null;
      storedExtensionTokens.delete(surfaceNow);
      try { handle.setExtensionToken(token); } catch (_) { /* editor not ready */ }
    }
  }
  void surface;
  return () => {
    if (currentHandle === handle) currentHandle = null;
  };
}

export function notifyComposerChange(surface: ComposerSurface, value: string): void {
  listeners.forEach((listener) => listener(surface, value));
}

export function subscribeComposer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getComposerHandle(surface: ComposerSurface): ComposerHandle | null {
  void surface;
  return currentHandle;
}

export function getComposerMarkdown(surface: ComposerSurface): string {
  if (surface === activeSurface() && currentHandle) {
    try { return currentHandle.getMarkdown(); } catch (_) { /* fall through to stash */ }
  }
  return stored.get(surface) ?? '';
}

export function setComposerMarkdown(surface: ComposerSurface, value: string): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.setMarkdown(value); } catch (_) { stored.set(surface, value); }
  } else {
    stored.set(surface, value);
  }
  notifyComposerChange(surface, value);
}

export function insertComposerText(surface: ComposerSurface, value: string): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.insertText(value); return; } catch (_) { /* fall through to stash */ }
  }
  setComposerMarkdown(surface, `${stored.get(surface) ?? ''}${value}`);
}

export function setComposerExtensionToken(
  surface: ComposerSurface,
  token: ComposerExtensionToken | null,
): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.setExtensionToken(token); return; } catch (_) { /* fall through to stash */ }
  }
  storedExtensionTokens.set(surface, token);
}

export function clearComposer(surface: ComposerSurface): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.clear(); } catch (_) { stored.set(surface, ''); }
  } else {
    stored.set(surface, '');
  }
  notifyComposerChange(surface, '');
}

export function focusComposer(surface: ComposerSurface, position: 'start' | 'end' = 'end'): void {
  if (surface !== activeSurface()) return;
  try { currentHandle?.focus(position); } catch (_) { /* editor not ready */ }
}

export function getVisibleComposerSurface(): ComposerSurface {
  try {
    if (currentHandle?.isVisible()) return activeSurface();
  } catch (_) { /* fall through */ }
  return 'topic';
}

/* Called synchronously by placeComposerForView inside the flip task:
   parks the live draft under the surface being left and installs the
   arriving surface's draft, so the first post-flip paint is already
   correct (no async register round-trip, no flash of stale text).
   Extension-token nodes ride the same path: the token is editor-doc
   content, so setMarkdown would wipe it — capture the live token under
   `from` and install `to`'s stashed token (or clear it), exactly like
   two editors each kept their own node. */
export function swapComposerSurface(from: ComposerSurface, to: ComposerSurface): void {
  if (from === to) return;
  try {
    if (currentHandle) {
      stored.set(from, currentHandle.getMarkdown());
      try { storedExtensionTokens.set(from, currentHandle.getExtensionToken()); } catch (_) { /* keep previous stash */ }
    }
  } catch (_) { /* keep the previous stash */ }
  const next = stored.get(to) ?? '';
  stored.delete(to);
  const nextToken = storedExtensionTokens.has(to) ? storedExtensionTokens.get(to) ?? null : null;
  storedExtensionTokens.delete(to);
  try { currentHandle?.setMarkdown(next); } catch (_) { stored.set(to, next); }
  try { currentHandle?.setExtensionToken(nextToken); } catch (_) { storedExtensionTokens.set(to, nextToken); }
  notifyComposerChange(to, next);
}

/* P_composer-single — ONE shell serves every surface, so submit/escape and
 * per-surface copy branch on the live view instead of a mount-time prop.
 * The chat view owns the chat surface; every other visible state (landing,
 * back-home, and views that hide the shell entirely) reads as topic.
 * placeComposerForView dispatches `socrates:composer-surface` with this
 * value in `detail.surface` whenever the shell moves; components that
 * render per-surface copy subscribe to it (see RichComposer). */
export const COMPOSER_SURFACE_EVENT = 'socrates:composer-surface';

export function readComposerSurface(doc?: Document): ComposerSurface {
  try {
    const d = doc || (typeof document !== 'undefined' ? document : undefined);
    const chatView = d ? d.getElementById('chatView') : null;
    if (chatView && !chatView.classList.contains('hidden')) return 'chat';
  } catch (_) { /* DOM unavailable — default below */ }
  return 'topic';
}

export function getComposerSelection(surface: ComposerSurface): ComposerSelection {
  if (surface === activeSurface() && currentHandle) {
    try { return currentHandle.getSelection(); } catch (_) { /* fall through */ }
  }
  return { from: 0, to: 0 };
}

export const composerController = {
  getMarkdown: getComposerMarkdown,
  setMarkdown: setComposerMarkdown,
  insertText: insertComposerText,
  clear: clearComposer,
  focus: focusComposer,
  getSelection: getComposerSelection,
  getVisibleSurface: getVisibleComposerSurface,
  subscribe: subscribeComposer,
};

declare global {
  interface Window {
    __socratesComposerController?: typeof composerController;
  }
}

if (typeof window !== 'undefined') {
  window.__socratesComposerController = composerController;
}

