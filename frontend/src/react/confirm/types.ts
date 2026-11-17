export type { ConfirmSnapshot } from '../../legacy/confirmState.ts';

declare global {
  interface Window {
    closeConfirm?: (resolveWith?: boolean) => void;
  }
}
