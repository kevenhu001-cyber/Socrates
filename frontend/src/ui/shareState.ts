import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export type ShareVisibility = 'public' | 'private';

export interface ShareSnapshot {
  /** Whether the share modal is on screen. React owns the overlay's
   *  visibility; the legacy module only publishes this flag. */
  open: boolean;
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
    open: false,
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
