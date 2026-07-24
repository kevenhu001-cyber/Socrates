export type ShareVisibility = 'public' | 'private';

export interface ShareSnapshot {
  isOpen: boolean;
  visibility: ShareVisibility;
  shareToken: string | null;
  shareUrl: string;
  status: string;
  error: string;
  revision: number;
}

export interface ShareBridge {
  getSnapshot: () => ShareSnapshot;
  publish: (snapshot: Omit<ShareSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesShareBridge?: ShareBridge;
  }
}
