import React from 'react';
import { Overlay, type OverlayProps } from './Overlay';

export function Popover(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="center" maxWidth={props.maxWidth ?? 380} />;
}

