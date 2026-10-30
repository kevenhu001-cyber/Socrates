export type { ConfirmSnapshot } from '../../ui/confirmState.ts';

declare global {
  interface Window {
    closeConfirm?: (resolveWith?: boolean) => void;
  }
}
