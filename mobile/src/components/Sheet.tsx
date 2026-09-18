import React from 'react';
import { Overlay, type OverlayProps } from './Overlay';

export function Sheet(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="bottom" />;
}

