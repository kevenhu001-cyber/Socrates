import { create } from 'zustand';

interface SendGlyphState {
  isSending: boolean;
  setSending(isSending: boolean): void;
}

export const useSendGlyphStore = create<SendGlyphState>((set) => ({
  isSending: false,
  setSending: (isSending) => set({ isSending }),
}));
