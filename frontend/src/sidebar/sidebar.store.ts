import { create } from 'zustand';

interface SidebarState {
  recentsFilter: string | null;
  recentsFilterLoaded: boolean;
  recentsVersion: number;
}

export const useSidebarStore = create<SidebarState>(() => ({ recentsFilter: null, recentsFilterLoaded: false, recentsVersion: 0 }));

export function setSidebarRecentsFilter(filter: string | null): void {
  useSidebarStore.setState({ recentsFilter: filter, recentsFilterLoaded: true });
}

export function bumpRecentsVersion(): void {
  useSidebarStore.setState((state) => ({ recentsVersion: state.recentsVersion + 1 }));
}
