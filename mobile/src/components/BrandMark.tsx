import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

const BRAND_SOURCE = require('../../../assets/buildResources/icon_1024.png');

export function BrandMark({ size = 28, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Image source={BRAND_SOURCE} resizeMode="contain" style={{ width: size, height: size }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#000000' },
});
