import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function ListRow({
  title,
  detail,
  left,
  right,
  onPress,
  testID,
  style,
}: {
  title: string;
  detail?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, typography } = useTheme();
  const content = (
    <View style={[styles.row, style]}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.medium }]}>{title}</Text>
        {detail ? <Text numberOfLines={2} style={[styles.detail, { color: colors.textMuted, fontFamily: typography.body }]}>{detail}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
  return onPress ? <Pressable testID={testID} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>{content}</Pressable> : <View testID={testID}>{content}</View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  left: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 14 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  right: { alignItems: 'flex-end', justifyContent: 'center' },
});

