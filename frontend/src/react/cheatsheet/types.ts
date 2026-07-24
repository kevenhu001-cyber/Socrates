export interface CheatsheetSnapshot {
  open: boolean;
  revision: number;
}

export interface CheatsheetBridge {
  getSnapshot: () => CheatsheetSnapshot;
  publish: (snapshot: Omit<CheatsheetSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesCheatsheetBridge?: CheatsheetBridge;
    closeCheatsheet?: () => void;
  }
}
