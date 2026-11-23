import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from 'cn';

export interface ActionBarProps extends ComponentPropsWithoutRef<'footer'> {
  children: ReactNode;
  className?: string;
}

/**
 * ActionBar — standardized bottom action bar for exam, long forms, and settings.
 */
export function ActionBar({ children, className, ...props }: ActionBarProps) {
  return (
    <footer className={cn('ui-action-bar', className)} data-action-bar {...props}>
      {children}
    </footer>
  );
}
