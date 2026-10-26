import { useEffect, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { setModalOpen } from '../../ui/modalA11y';

/** Socrates keeps overlay geometry and motion. Base UI owns modal interaction;
 * the legacy registry only coordinates shell inertness with unmigrated modals. */
export function FoundationDialog({ id, open, onOpenChange, overlayClassName, className, initialFocus, finalFocus, role = 'dialog', contentStyle, children }: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overlayClassName: string;
  className: string;
  initialFocus?: ComponentProps<typeof Dialog.Popup>['initialFocus'];
  finalFocus?: ComponentProps<typeof Dialog.Popup>['finalFocus'];
  role?: 'dialog' | 'alertdialog';
  contentStyle?: CSSProperties;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    setModalOpen(id, true, null, { focusManaged: true });
    return () => setModalOpen(id, false);
  }, [id, open]);

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop data-ui-motion="scrim" id={id} className={overlayClassName} data-state={open ? 'open' : 'closing'}
        inert={!open} style={{ zIndex: 'var(--ui-z-modal)' }}>
        <Dialog.Popup data-ui-motion="dialog" role={role} aria-modal="true" className={className} initialFocus={initialFocus} finalFocus={finalFocus}
          data-state={open ? 'open' : 'closing'}
          style={{ maxHeight: 'calc(100dvh - 2 * var(--ui-space-lg))', overflowY: 'auto', ...contentStyle }}>
          {children}
        </Dialog.Popup>
      </Dialog.Backdrop>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function FoundationDialogTitle(props: ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title {...props} render={<div />} />;
}

export function FoundationDialogDescription(props: ComponentProps<typeof Dialog.Description>) {
  return <Dialog.Description {...props} render={<div />} />;
}

export function FoundationDialogClose(props: ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close type="button" {...props} />;
}
