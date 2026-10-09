import React, { type ComponentProps } from 'react';
import { Pressable } from 'react-native';
import { Sidebar } from '@socrates/ui';
import type { ThemeMode } from '@socrates/theme';
import { styles } from './appStyles';

interface AppSidebarLayerProps {
  open: boolean;
  compact: boolean;
  mode: ThemeMode;
  backdropLabel: string;
  sidebar: ComponentProps<typeof Sidebar>;
  onClose(): void;
}

/** Sidebar and its phone-sized dismiss surface. */
export function AppSidebarLayer({ open, compact, mode, backdropLabel, sidebar, onClose }: AppSidebarLayerProps) {
  return (
    <>
      {open ? <Sidebar {...sidebar} /> : null}
      {compact && open ? (
        <Pressable
          nativeID="socrates-sidebar-backdrop"
          accessibilityRole="button"
          accessibilityLabel={backdropLabel}
          onPress={onClose}
          style={[styles.sidebarBackdrop, { backgroundColor: mode === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.4)' }]}
        />
      ) : null}
    </>
  );
}
