import type { ComponentPropsWithRef } from 'react';
import { cn } from 'cn';

/**
 * PageFrame — the one page column for standard app pages.
 *
 * Owns width, gutter and vertical rhythm so an individual page never
 * re-declares `max-width` or page padding. Geometry comes from the page
 * tokens; the frame is deliberately layout-only.
 */
export function PageFrame({ className, children, ...props }: ComponentPropsWithRef<'section'>) {
  return (
    <section className={cn('ui-page-frame', className)} data-page-frame="" {...props}>
      {children}
    </section>
  );
}
