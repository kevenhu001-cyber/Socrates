import { forwardRef, type ComponentPropsWithRef } from 'react';
import { cn } from 'cn';

/** Native form controls retain their input ref, checked/value events, browser
 * picker, and FormData contract. Text inputs use shadcn Input instead. */
export const NativeControl = forwardRef<HTMLInputElement, ComponentPropsWithRef<'input'>>(
  function NativeControl({ className, type, ...props }, ref) {
    return <input {...props} ref={ref} type={type} data-slot={`native-${type || 'input'}`}
      className={cn('socrates-native-control', className)} />;
  },
);
