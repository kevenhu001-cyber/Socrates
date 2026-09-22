export type MorePopoverAction =
  | 'plugins'
  | 'exam'
  | 'skills'
  | 'incognito'
  | 'settings'
  | 'display'
  | 'shortcuts'
  | 'signout';

export interface MorePopoverSnapshot {
  isOpen: boolean;
  revision: number;
}

export interface MorePopoverBridge {
  getSnapshot: () => MorePopoverSnapshot;
  publish: (snapshot: Omit<MorePopoverSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesMorePopoverBridge?: MorePopoverBridge;
  }
}
