/**
 * Shared contracts for the confirm-dialog React migration boundary.
 *
 * M4 step 4.5c: React owns the overlay skeleton (title, message, Cancel/OK
 * buttons). Legacy `ui/confirm.js` keeps the Promise semantics — it
 * publishes `{ open, title, msg, danger }` on open and `{ open: false }`
 * on close, and resolves the in-flight `showConfirm(...)` promise from
 * `closeConfirm(resolveWith)`. React mirrors visibility and button copy.
 */

export interface ConfirmSnapshot {
  open: boolean;
  title: string;
  msg: string;
  danger: boolean;
  revision: number;
}

export interface ConfirmBridge {
  getSnapshot: () => ConfirmSnapshot;
  publish: (snapshot: Omit<ConfirmSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesConfirmBridge?: ConfirmBridge;
    closeConfirm?: (resolveWith?: boolean) => void;
  }
}
