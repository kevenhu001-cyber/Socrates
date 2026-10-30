import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export type ShareVisibility = 'public' | 'private';

export interface ShareSnapshot {
  visibility: ShareVisibility;
  shareToken: string | null;
  shareUrl: string;
  status: string;
  error: string;
  revision: number;
}

type ShareUpdate = Omit<ShareSnapshot, 'revision'>;

export const shareState = createImmutableBridge<ShareSnapshot, ShareUpdate>({
  initial: {
    visibility: 'public',
    shareToken: null,
    shareUrl: '',
    status: '',
    error: '',
    revision: 0,
  },
  reducer: (_state, update) => update,
});

export function publishShareState(update: ShareUpdate): void {
  shareState.dispatch(update);
}
