import React from 'react';
import { Text, View } from 'react-native';
import { fontStyle } from '@socrates/theme';
import type { UiLanguage } from '@socrates/ui';

export function SidebarLogoText({ label, color, language }: { label: string; color: string; language: UiLanguage }) {
  return <Text nativeID="socrates-sidebar-logo-text" numberOfLines={1} style={[{ color, fontSize: 15, lineHeight: 20, letterSpacing: -0.45 }, fontStyle('semibold', language)]}>{label}</Text>;
}

export function SidebarNavLabelBadge({
  label, badge, color, badgeColor, borderColor, itemKey, language, compact,
}: { label: string; badge: string; color: string; badgeColor: string; borderColor: string; itemKey: string; language: UiLanguage; compact: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
      <Text numberOfLines={1} style={[{ color, fontSize: 14, lineHeight: 20, flexShrink: 1 }, fontStyle('regular', language)]}>{label}</Text>
      <View style={{ marginLeft: compact ? 4 : 6, paddingHorizontal: 6, paddingTop: compact ? 1 : 2, paddingBottom: 2, borderWidth: 1, borderColor, borderRadius: 999 }}>
        <Text nativeID={`socrates-sidebar-nav-badge-${itemKey}`} style={[{ color: badgeColor, fontSize: 10, lineHeight: compact ? 16 : 14, letterSpacing: 0.2 }, fontStyle('semibold', language)]}>{badge}</Text>
      </View>
    </View>
  );
}
