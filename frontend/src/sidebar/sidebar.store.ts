import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  activePanel: SidebarPanelView;
  recentsFilter: string | null;
  recentsFilterLoaded: boolean;
  recentsVersion: number;
}

export type SidebarPanelView = 'recents' | 'knowledge' | 'mistakes';

export const useSidebarStore = create<SidebarState>(() => ({
  isOpen: true,
  activePanel: 'recents',
  recentsFilter: null,
  recentsFilterLoaded: false,
  recentsVersion: 0,
}));

export function setSidebarOpen(isOpen: boolean): void {
  if (useSidebarStore.getState().isOpen === isOpen) return;
  useSidebarStore.setState({ isOpen });
}

export function setSidebarPanelView(activePanel: SidebarPanelView): void {
  if (useSidebarStore.getState().activePanel === activePanel) return;
  useSidebarStore.setState({ activePanel });
}

export function toggleSidebarPanelView(view: Exclude<SidebarPanelView, 'recents'>): SidebarPanelView {
  const activePanel = useSidebarStore.getState().activePanel === view ? 'recents' : view;
  setSidebarPanelView(activePanel);
  return activePanel;
}

export function setSidebarRecentsFilter(filter: string | null): void {
  useSidebarStore.setState({ recentsFilter: filter, recentsFilterLoaded: true });
}

export function bumpRecentsVersion(): void {
  useSidebarStore.setState((state) => ({ recentsVersion: state.recentsVersion + 1 }));
}
