import React from 'react';
import { View } from 'react-native';
import { Icon } from '@socrates/ui';

export interface ModelCaretProps {
  size: number;
  color: string;
}

export function ModelCaret({ size, color }: ModelCaretProps) {
  return (
    <View style={{ width: size, height: size, flexShrink: 0 }}>
      <Icon name="model-caret" size={size} color={color} />
    </View>
  );
}
