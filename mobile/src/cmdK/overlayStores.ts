/* Tiny module-scoped signals for overlays (Usage, Storage) that need to
 * be opened from the Cmd+K palette but are rendered by their host screens
 * (App drawer / settings). Mirrors the `profileOverlay` pattern exported
 * from `components/AppDrawer`. */

type Listener = (open: boolean) => void;

function makeSignal() {
  let listeners: Listener[] = [];
  return {
    open() {
      for (const l of listeners) l(true);
    },
    close() {
      for (const l of listeners) l(false);
    },
    subscribe(l: Listener) {
      listeners.push(l);
      return () => {
        listeners = listeners.filter((x) => x !== l);
      };
    },
  };
}

export const usageOverlay = makeSignal();
export const storageOverlay = makeSignal();
