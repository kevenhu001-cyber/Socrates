import type { ReactNode } from 'react';
import { cn } from 'cn';

/** PageToolbar — search / filter / view controls, one row, one order. */
export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('ui-page-toolbar', className)} data-page-toolbar>
      {children}
    </div>
  );
}
