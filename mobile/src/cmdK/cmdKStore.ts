/* Module-scoped store for the Cmd+K global palette.
 *
 * Mirrors `frontend/src/ui/cmdK.js`'s public surface (`openCmdK` /
 * `closeCmdK`) so feature code can request the palette without threading
 * props through every screen. Subscribers re-render on `open` flips. */
type Listener = (open: boolean) => void;

let open = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(open);
}

export const cmdKStore = {
  isOpen(): boolean {
    return open;
  },
  open(): void {
    if (open) return;
    open = true;
    emit();
  },
  close(): void {
    if (!open) return;
    open = false;
    emit();
  },
  toggle(): void {
    open = !open;
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
