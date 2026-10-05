import type { ComposerExtensionToken, ComposerSurface } from './types';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  composerLifecycleStore,
  resetComposerLifecycleState,
  writeComposerDraft,
  writeComposerExtensionToken,
  writeComposerSurface,
} from './lifecycle.store.ts';

export type { ComposerSurface } from './types';

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

/* React mounts exactly one editor. This controller keeps that editor handle
   and a typed store holds each surface's independent markdown/token state. */
let currentHandle: ComposerHandle | null = null;
const listeners = new Set<Listener>();
let appliedInitialDraft = false;
let surfaceTransitionInProgress = false;

function activeSurface(): ComposerSurface {
  return composerLifecycleStore.getState().surface;
}

function activeDraft(surface: ComposerSurface): string {
  return composerLifecycleStore.getState().drafts[surface];
}

function activeToken(surface: ComposerSurface): ComposerExtensionToken | null {
  return composerLifecycleStore.getState().extensionTokens[surface];
}

export function registerComposer(surface: ComposerSurface, handle: ComposerHandle): () => void {
  currentHandle = handle;
  if (!appliedInitialDraft) {
    appliedInitialDraft = true;
    const state = composerLifecycleStore.getState();
    try { handle.setMarkdown(state.drafts[state.surface]); }
    catch (error) { reportSwallow(error, 'controller.registerComposer.setMarkdown'); }
    try { handle.setExtensionToken(state.extensionTokens[state.surface]); }
    catch (error) { reportSwallow(error, 'controller.registerComposer.setExtensionToken'); }
  }
  void surface;
  return () => {
    if (currentHandle === handle) currentHandle = null;
  };
}

export function notifyComposerChange(surface: ComposerSurface, value: string): void {
  const owner = surface === activeSurface() ? surface : activeSurface();
  writeComposerDraft(owner, value);
  if (currentHandle) {
    try { writeComposerExtensionToken(owner, currentHandle.getExtensionToken()); }
    catch (error) { reportSwallow(error, 'controller.notifyComposerChange.readToken'); }
  }
  listeners.forEach((listener) => listener(owner, value));
}

export function subscribeComposer(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getComposerHandle(surface: ComposerSurface): ComposerHandle | null {
  void surface;
  return currentHandle;
}

export function isComposerSurfaceTransitioning(): boolean {
  return surfaceTransitionInProgress;
}

export function getComposerMarkdown(surface: ComposerSurface): string {
  if (surface === activeSurface() && currentHandle) {
    try { return currentHandle.getMarkdown(); }
    catch (error) { reportSwallow(error, 'controller.getComposerMarkdown'); }
  }
  return activeDraft(surface);
}

export function setComposerMarkdown(surface: ComposerSurface, value: string): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.setMarkdown(value); }
    catch { writeComposerDraft(surface, value); }
  } else {
    writeComposerDraft(surface, value);
    listeners.forEach((listener) => listener(surface, value));
    return;
  }
  notifyComposerChange(activeSurface(), value);
}

export function insertComposerText(surface: ComposerSurface, value: string): void {
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.insertText(value); return; }
    catch (error) { reportSwallow(error, 'controller.insertComposerText'); }
  }
  setComposerMarkdown(surface, `${activeDraft(surface)}${value}`);
}

export function setComposerExtensionToken(
  surface: ComposerSurface,
  token: ComposerExtensionToken | null,
): void {
  writeComposerExtensionToken(surface, token);
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.setExtensionToken(token); }
    catch (error) { reportSwallow(error, 'controller.setComposerExtensionToken'); }
  }
}

export function getComposerExtensionToken(surface: ComposerSurface): ComposerExtensionToken | null {
  if (surface === activeSurface() && currentHandle) {
    try { return currentHandle.getExtensionToken(); }
    catch (error) { reportSwallow(error, 'controller.getComposerExtensionToken'); }
  }
  return activeToken(surface);
}

export function clearComposer(surface: ComposerSurface): void {
  writeComposerDraft(surface, '');
  writeComposerExtensionToken(surface, null);
  if (surface === activeSurface() && currentHandle) {
    try { currentHandle.clear(); }
    catch (error) { reportSwallow(error, 'controller.clearComposer'); }
    try { currentHandle.setExtensionToken(null); }
    catch (error) { reportSwallow(error, 'controller.clearComposer.clearToken'); }
  }
  if (surface === activeSurface()) notifyComposerChange(surface, '');
  else listeners.forEach((listener) => listener(surface, ''));
}

export function clearComposerDrafts(): void {
  clearComposer('topic');
  clearComposer('chat');
}

export function focusComposer(surface: ComposerSurface, position: 'start' | 'end' = 'end'): void {
  if (surface !== activeSurface()) return;
  try { currentHandle?.focus(position); }
  catch (error) { reportSwallow(error, 'controller.focusComposer'); }
}

export function getVisibleComposerSurface(): ComposerSurface {
  try {
    if (currentHandle?.isVisible()) return activeSurface();
  } catch (error) { reportSwallow(error, 'controller.getVisibleComposerSurface.isVisible'); }
  return 'topic';
}

function moveComposerShell(surface: ComposerSurface, doc?: Document): void {
  const d = doc || (typeof document !== 'undefined' ? document : undefined);
  if (!d) return;
  const shell = d.getElementById('composerInputWrap');
  const slot = d.getElementById(surface === 'chat' ? 'chatComposerSlot' : 'topicComposerSlot');
  if (shell && slot && shell.parentNode !== slot) slot.appendChild(shell);
}

/** Switches the editor surface and keeps the existing single editor mounted. */
export function activateComposerSurface(surface: ComposerSurface, doc?: Document): void {
  const previousSurface = activeSurface();
  if (previousSurface !== surface) {
    if (currentHandle) {
      try { writeComposerDraft(previousSurface, currentHandle.getMarkdown()); }
      catch (error) { reportSwallow(error, 'controller.activateSurface.saveDraft'); }
      try { writeComposerExtensionToken(previousSurface, currentHandle.getExtensionToken()); }
      catch (error) { reportSwallow(error, 'controller.activateSurface.saveToken'); }
    }
    writeComposerSurface(surface);
    surfaceTransitionInProgress = true;
    try {
      try { currentHandle?.setMarkdown(activeDraft(surface)); }
      catch (error) { reportSwallow(error, 'controller.activateSurface.restoreDraft'); }
      try { currentHandle?.setExtensionToken(activeToken(surface)); }
      catch (error) { reportSwallow(error, 'controller.activateSurface.restoreToken'); }
    } finally {
      surfaceTransitionInProgress = false;
    }
    notifyComposerChange(surface, activeDraft(surface));
  }
  moveComposerShell(surface, doc);
}

export function resetComposerControllerState(): void {
  currentHandle = null;
  appliedInitialDraft = false;
  listeners.clear();
  resetComposerLifecycleState();
}

export function readComposerSurface(doc?: Document): ComposerSurface {
  void doc;
  return activeSurface();
}

export function getComposerSelection(surface: ComposerSurface): ComposerSelection {
  if (surface === activeSurface() && currentHandle) {
    try { return currentHandle.getSelection(); }
    catch (error) { reportSwallow(error, 'controller.getComposerSelection'); }
  }
  return { from: 0, to: 0 };
}

export const composerController = {
  getMarkdown: getComposerMarkdown,
  setMarkdown: setComposerMarkdown,
  insertText: insertComposerText,
  setExtensionToken: setComposerExtensionToken,
  getExtensionToken: getComposerExtensionToken,
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

if (typeof window !== 'undefined') window.__socratesComposerController = composerController;
