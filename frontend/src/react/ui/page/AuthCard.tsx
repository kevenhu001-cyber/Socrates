import type { ComponentPropsWithoutRef } from 'react';
import { cn } from 'cn';

/** Shared focused-page card for sign-in and other credential gates. */
export function AuthCard({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('auth-card', className)} data-auth-card {...props} />;
}
