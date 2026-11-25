import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';

import { Button } from './button';
import { Icon } from '../../../legacy/Icon';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  surface = false,
  ...props
}: DialogPrimitive.Backdrop.Props & { surface?: boolean }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={
        surface
          ? cn(className)
          : cn('fixed inset-0 isolate z-(--ui-z-modal) bg-(--ui-backdrop) duration-200', className)
      }
      {...props}
    />
  );
}

// Product dialogs retain their measured geometry while sharing shadcn's
// semantic surface and Base UI's focus/escape/scroll-lock implementation.
function DialogPopup({ className, ...props }: DialogPrimitive.Popup.Props) {
  return <DialogPrimitive.Popup data-slot="dialog-content" className={cn(className)} {...props} />;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  keepMounted = false,
  backdropProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  keepMounted?: boolean;
  backdropProps?: DialogPrimitive.Backdrop.Props;
}) {
  const popup = (
    <DialogPrimitive.Popup
      data-slot="dialog-content"
      className={cn(
        'fixed top-1/2 left-1/2 z-(--ui-z-modal) -translate-x-1/2 -translate-y-1/2 rounded-(--ui-radius-dialog) bg-popover text-sm text-popover-foreground shadow-(--ui-shadow-dialog) ring-1 ring-foreground/10 duration-200',
        'grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto gap-4 p-4 sm:max-w-sm',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close
          data-slot="dialog-close"
          render={<Button variant="ghost" className="absolute top-2 right-2" size="icon-sm" />}
        >
          <Icon name="close" size={18} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Popup>
  );
  return (
    <DialogPortal keepMounted={keepMounted}>
      {backdropProps ? (
        <DialogOverlay {...backdropProps}>{popup}</DialogOverlay>
      ) : (
        <>
          <DialogOverlay />
          {popup}
        </>
      )}
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-(--ui-radius-dialog) border-t border-border bg-transparent p-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-snug font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
};
