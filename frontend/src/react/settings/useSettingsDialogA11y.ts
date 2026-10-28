import { useEffect } from 'react';
import { setModalOpen } from '../../ui/modalA11y.js';

/** shadcn Dialog owns keyboard focus, Escape and restoration. The registry
 * only coordinates shell inertness with remaining legacy/nested dialogs. */
export function useSettingsDialogA11y(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    setModalOpen('settingsOverlay', true, null, { focusManaged: true });
    return () => setModalOpen('settingsOverlay', false);
  }, [open]);
}
