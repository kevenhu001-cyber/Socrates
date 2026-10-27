import { useSyncExternalStore } from 'react';

export type WorkbenchArtifactType = 'code' | 'chart' | 'whiteboard' | 'document' | 'geometry' | 'math' | 'custom';
export type WorkbenchTab = 'preview' | 'code';

export interface WorkbenchArtifact {
  id: string;
  title: string;
  /** Translation key for built-in titles; user-provided titles stay literal. */
  titleKey?: string;
  type: WorkbenchArtifactType;
  language?: string;
  code?: string;
  previewHtml?: string;
  previewElement?: HTMLElement | null;
  version?: number;
  onIterate?: (instruction: string) => void;
}

export interface WorkbenchState {
  isOpen: boolean;
  activeTab: WorkbenchTab;
  isFullscreen: boolean;
  artifact: WorkbenchArtifact | null;
}

let state: WorkbenchState = {
  isOpen: false,
  activeTab: 'preview',
  isFullscreen: false,
  artifact: null,
};

const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
  // Sync backdrop & workbench visibility on DOM
  const host = document.getElementById('artifactsWorkbench');
  const backdrop = document.getElementById('artifactsBackdrop');
  if (host) {
    host.classList.toggle('hidden', !state.isOpen);
    host.setAttribute('aria-hidden', state.isOpen ? 'false' : 'true');
    host.classList.toggle('is-fullscreen', state.isFullscreen);
  }
  if (backdrop) {
    backdrop.classList.toggle('hidden', !state.isOpen);
    backdrop.setAttribute('aria-hidden', state.isOpen ? 'false' : 'true');
  }
  const appShell = document.getElementById('appShell');
  if (appShell) {
    appShell.classList.toggle('has-workbench-open', state.isOpen);
  }
}

export function openWorkbench(artifact: WorkbenchArtifact, initialTab: WorkbenchTab = 'preview'): void {
  state = {
    ...state,
    isOpen: true,
    activeTab: initialTab,
    artifact,
  };
  emitChange();
}

export function closeWorkbench(): void {
  state = {
    ...state,
    isOpen: false,
    isFullscreen: false,
  };
  emitChange();
}

export function setWorkbenchTab(tab: WorkbenchTab): void {
  if (state.activeTab === tab) return;
  state = {
    ...state,
    activeTab: tab,
  };
  emitChange();
}

export function toggleWorkbenchFullscreen(): void {
  state = {
    ...state,
    isFullscreen: !state.isFullscreen,
  };
  emitChange();
}

export function getWorkbenchState(): WorkbenchState {
  return state;
}

export function subscribeWorkbench(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWorkbench(): WorkbenchState {
  return useSyncExternalStore(subscribeWorkbench, getWorkbenchState);
}
