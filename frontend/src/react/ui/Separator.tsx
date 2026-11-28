import { type ComponentProps } from 'react';
import { Separator as ShadcnSeparator } from './v3';

/** Keep the native hr consumed by the existing sidebar and article styles. */
export function Separator(props: ComponentProps<'hr'>) {
  return <ShadcnSeparator render={<hr {...props} />} />;
}
