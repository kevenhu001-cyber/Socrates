import type { ComponentProps, ReactNode } from 'react';
import { Button } from '../ui/shadcn/button';

export type ActionButtonProps = ComponentProps<typeof Button> & { children: ReactNode };

export function ActionButton(props: ActionButtonProps) {
  return <Button {...props} />;
}
