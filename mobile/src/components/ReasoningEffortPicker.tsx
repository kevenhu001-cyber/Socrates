import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import type { ReasoningEffort } from './Composer';

export interface EffortPickerAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  value: ReasoningEffort;
  anchor?: EffortPickerAnchor | null;
  onChange: (value: ReasoningEffort) => void;
  onClose: () => void;
}

export function ReasoningEffortPicker({
  visible,
  value,
  anchor,
  onChange,
  onClose,
}: Props) {
  const { colors, typography } = useTheme();
  const t = useT();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, visible]);

  const rows: Array<{ value: ReasoningEffort; label: string }> = [
    { value: 'high', label: t('effort.high') || 'High' },
    { value: 'medium', label: t('effort.medium') || 'Medium' },
    { value: 'low', label: t('effort.low') || 'Low' },
  ];

  const menuWidth = 142;
  const menuHeight = 3 * 38 + 6;
  const desiredLeft = anchor
    ? anchor.x + anchor.width - menuWidth
    : viewportWidth - menuWidth - 16;
  const left = Math.max(8, Math.min(viewportWidth - menuWidth - 8, desiredLeft));
  const desiredTop = anchor ? anchor.y - menuHeight - 6 : viewportHeight - menuHeight - 96;
  const top = Math.max(8, Math.min(viewportHeight - menuHeight - 8, desiredTop));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.menu,
          {
            top,
            left,
            width: menuWidth,
            backgroundColor: colors.background,
            borderColor: withAlpha(colors.border, 0.4),
            opacity: progress,
            transform: [{
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 0],
              }),
            }],
          },
        ]}
      >
        {rows.map((row) => {
          const selected = row.value === value;
          return (
            <AnimatedPressable
              key={row.value}
              scale={0.985}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              accessibilityState={{ selected }}
              onPress={() => {
                onChange(row.value);
                onClose();
              }}
              style={[
                styles.item,
                selected ? { backgroundColor: withAlpha(colors.accent, 0.08) } : null,
              ]}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: selected ? colors.accent : colors.textSecondary,
                    fontFamily: typography.medium,
                  },
                ]}
              >
                {row.label}
              </Text>
              {selected ? <Ionicons name="checkmark" size={15} color={colors.accent} /> : <View style={styles.checkSpace} />}
            </AnimatedPressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 8,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 14,
  },
  item: {
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 13,
  },
  checkSpace: {
    width: 15,
    height: 15,
  },
});
