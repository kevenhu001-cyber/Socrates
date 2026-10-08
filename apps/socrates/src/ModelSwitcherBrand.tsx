import React from 'react';
import { Text } from 'react-native';
import { fontStyle } from '@socrates/theme';
import type { UiLanguage } from '@socrates/ui';

export function ModelSwitcherBrand({ label, color, compact, language }: { label: string; color: string; compact: boolean; language: UiLanguage }) {
  return <Text nativeID="socrates-model-name" testID="socrates-model-name" numberOfLines={1} style={[{ color, fontSize: compact ? 15 : 18, lineHeight: compact ? 24 : 28, fontWeight: '600', flexShrink: compact ? 0 : 1 }, fontStyle('semibold', language)]}>{label}</Text>;
}
