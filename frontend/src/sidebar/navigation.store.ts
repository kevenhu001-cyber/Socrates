import { create } from 'zustand';
import type { SidebarNavKey } from '../react/sidebar/types';

interface NavigationState {
  activeDestination: SidebarNavKey;
  setActiveDestination: (destination: SidebarNavKey) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  activeDestination: null,
  setActiveDestination: (activeDestination) => set({ activeDestination }),
}));

export function getActiveDestination(): SidebarNavKey {
  return useNavigationStore.getState().activeDestination;
}

export function setActiveDestination(destination: SidebarNavKey): void {
  useNavigationStore.getState().setActiveDestination(destination);
}
