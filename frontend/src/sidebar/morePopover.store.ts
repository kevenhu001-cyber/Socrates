import { create } from 'zustand';

interface MorePopoverState {
  isOpen: boolean;
  setOpen(isOpen: boolean): void;
  toggle(): void;
}

export const useMorePopoverStore = create<MorePopoverState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));
