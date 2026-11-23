import { useEffect, type CSSProperties, type ComponentProps, type ReactNode } from 'react';
import { cn } from 'cn';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../ui/shadcn/dialog';
import { setModalOpen } from '../../legacy/modalA11y';

/** Socrates keeps overlay geometry and motion. Base UI owns modal interaction;
 * the legacy registry only coordinates shell inertness with unmigrated modals. */
export function FoundationDialog({
  id,
  open,
  onOpenChange,
  overlayClassName,
  className,
  initialFocus,
  finalFocus,
  role = 'dialog',
  contentStyle,
  'aria-label': ariaLabel,
  'data-i18n-aria': dataI18nAria,
  keepMounted = false,
  children,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overlayClassName: string;
  className: string;
  initialFocus?: ComponentProps<typeof DialogPopup>['initialFocus'];
  finalFocus?: ComponentProps<typeof DialogPopup>['finalFocus'];
  role?: 'dialog' | 'alertdialog';
  contentStyle?: CSSProperties;
  'aria-label'?: string;
  'data-i18n-aria'?: string;
  keepMounted?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    setModalOpen(id, true, null, { focusManaged: true });
    return () => setModalOpen(id, false);
  }, [id, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal keepMounted={keepMounted}>
        <DialogOverlay
          surface
          data-ui-motion="scrim"
          id={id}
          className={cn(overlayClassName, !open && 'hidden')}
          data-state={open ? 'open' : 'closing'}
          inert={!open}
          aria-label={ariaLabel}
          data-i18n-aria={dataI18nAria}
          style={{ zIndex: 'var(--ui-z-modal)' }}
        >
          <DialogPopup
            data-ui-motion="dialog"
            role={role}
            aria-modal="true"
            className={className}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            data-state={open ? 'open' : 'closing'}
            style={{
              maxHeight: 'calc(100dvh - 2 * var(--ui-space-lg))',
              overflowY: 'auto',
              ...contentStyle,
            }}
          >
            {children}
          </DialogPopup>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

export function FoundationDialogTitle(props: ComponentProps<typeof DialogTitle>) {
  return <DialogTitle {...props} render={<div />} />;
}

export function FoundationDialogDescription(props: ComponentProps<typeof DialogDescription>) {
  return <DialogDescription {...props} render={<div />} />;
}

export function FoundationDialogClose(props: ComponentProps<typeof DialogClose>) {
  return <DialogClose type="button" {...props} />;
}
