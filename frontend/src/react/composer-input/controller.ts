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
  focus(position?: 'start' | 'end'): void;
  getSelection(): ComposerSelection;
  isVisible(): boolean;
}

type Listener = (surface: ComposerSurface, value: string) => void;

const handles = new Map<ComposerSurface, ComposerHandle>();
const pending = new Map<ComposerSurface, string>();
const listeners = new Set<Listener>();

export function registerComposer(surface: ComposerSurface, handle: ComposerHandle): () => void {
  handles.set(surface, handle);
  if (pending.has(surface)) {
    handle.setMarkdown(pending.get(surface) ?? '');
    pending.delete(surface);
  }
  return () => {
    if (handles.get(surface) === handle) handles.delete(surface);
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
  return handles.get(surface) ?? null;
}

export function getComposerMarkdown(surface: ComposerSurface): string {
  return handles.get(surface)?.getMarkdown() ?? pending.get(surface) ?? '';
}

export function setComposerMarkdown(surface: ComposerSurface, value: string): void {
  const handle = handles.get(surface);
  if (handle) handle.setMarkdown(value);
  else pending.set(surface, value);
  notifyComposerChange(surface, value);
}

export function insertComposerText(surface: ComposerSurface, value: string): void {
  const handle = handles.get(surface);
  if (handle) handle.insertText(value);
  else setComposerMarkdown(surface, `${pending.get(surface) ?? ''}${value}`);
}

export function clearComposer(surface: ComposerSurface): void {
  const handle = handles.get(surface);
  if (handle) handle.clear();
  else pending.set(surface, '');
  notifyComposerChange(surface, '');
}

export function focusComposer(surface: ComposerSurface, position: 'start' | 'end' = 'end'): void {
  handles.get(surface)?.focus(position);
}

export function getVisibleComposerSurface(): ComposerSurface {
  if (handles.get('chat')?.isVisible()) return 'chat';
  return 'topic';
}

export function getComposerSelection(surface: ComposerSurface): ComposerSelection {
  return handles.get(surface)?.getSelection() ?? { from: 0, to: 0 };
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

