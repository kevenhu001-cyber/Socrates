import type { CSSProperties, ComponentProps, ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from 'cn';
import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogDescription,
  FoundationDialogTitle,
} from './FoundationDialog';
import type { DialogPopup } from '../ui/shadcn/dialog';

export type DialogFrameSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface DialogFrameProps {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: DialogFrameSize;
  showClose?: boolean;
  closeClassName?: string;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
  role?: 'dialog' | 'alertdialog';
  initialFocus?: ComponentProps<typeof DialogPopup>['initialFocus'];
  finalFocus?: ComponentProps<typeof DialogPopup>['finalFocus'];
  contentStyle?: CSSProperties;
  'aria-label'?: string;
  'data-i18n-aria'?: string;
  keepMounted?: boolean;
}

/**
 * DialogFrame — standardized modal dialog frame (Phase 5 convergence).
 * Wraps FoundationDialog with unified geometry: sm (400) / md (520) / lg (720) / xl (960) / full,
 * 24px radius, 20/28 header, 24px body padding, and accessible close button.
 */
export function DialogFrame({
  id,
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  showClose = true,
  closeClassName,
  headerActions,
  footer,
  children,
  className,
  overlayClassName,
  bodyClassName,
  role = 'dialog',
  initialFocus,
  finalFocus,
  contentStyle,
  'aria-label': ariaLabel,
  'data-i18n-aria': dataI18nAria,
  keepMounted = false,
}: DialogFrameProps) {
  const hasHeader = Boolean(title || description || showClose || headerActions);

  return (
    <FoundationDialog
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      overlayClassName={cn('ui-dialog-overlay', overlayClassName)}
      className={cn('ui-dialog-frame', `size-${size}`, className)}
      role={role}
      initialFocus={initialFocus}
      finalFocus={finalFocus}
      contentStyle={contentStyle}
      aria-label={ariaLabel}
      data-i18n-aria={dataI18nAria}
      keepMounted={keepMounted}
    >
      {hasHeader ? (
        <div className="ui-dialog-header">
          <div className="ui-dialog-heading">
            {title ? (
              <FoundationDialogTitle className="ui-dialog-title">{title}</FoundationDialogTitle>
            ) : null}
            {description ? (
              <FoundationDialogDescription className="ui-dialog-description">
                {description}
              </FoundationDialogDescription>
            ) : null}
          </div>
          <div className="ui-dialog-header-actions">
            {headerActions}
            {showClose ? (
              <FoundationDialogClose
                className={cn('ui-dialog-close', closeClassName)}
                aria-label="Close"
              >
                <X size={16} strokeWidth={2} />
              </FoundationDialogClose>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn('ui-dialog-body', bodyClassName)}>{children}</div>
      {footer ? <div className="ui-dialog-footer">{footer}</div> : null}
    </FoundationDialog>
  );
}
