export interface UsageSnapshot {
  isOpen: boolean;
  bodyHtml: string;
  period: 'year' | 'month';
  revision: number;
}

export interface UsageBridge {
  getSnapshot: () => UsageSnapshot;
  publish: (snapshot: Omit<UsageSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesUsageBridge?: UsageBridge;
  }
}
