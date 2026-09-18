import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { motionEasing, withAlpha } from '../theme/theme';

export type OverlayPresentation = 'center' | 'bottom';

export interface OverlayProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  presentation?: OverlayPresentation;
  maxWidth?: number;
  testID?: string;
  dismissOnBackdrop?: boolean;
  /** Scrim tier override — defaults to `colors.scrimModal`; confirm dialogs
   * pass `colors.scrimConfirm`. */
  scrimColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The native equivalent of the web app's overlay stack.
 *
 * All product modals use the same scrim, easing, border and surface role. A
 * single primitive prevents each screen from re-implementing a subtly
 * different `Modal` (which was the source of most Android visual drift).
 */
export function Overlay({
  visible,
  onClose,
  children,
  presentation = 'center',
  maxWidth = 560,
  testID,
  dismissOnBackdrop = true,
  scrimColor,
  style,
}: OverlayProps) {
  const { colors, radius, shadows } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(presentation === 'bottom' ? 28 : 12)).current;

  useEffect(() => {
    if (!visible) return undefined;
    opacity.setValue(0);
    translate.setValue(presentation === 'bottom' ? 28 : 12);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: motionEasing.out,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 220,
        easing: motionEasing.out,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, presentation, translate, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.root, presentation === 'bottom' && styles.bottomRoot]}>
        <Animated.View pointerEvents="box-none" style={[styles.backdrop, { opacity }]}>
          <Pressable
            accessibilityLabel="Close"
            disabled={!dismissOnBackdrop}
            onPress={dismissOnBackdrop ? onClose : undefined}
            style={[StyleSheet.absoluteFill, { backgroundColor: scrimColor ?? colors.scrimModal }]}
          />
        </Animated.View>
        <Animated.View
          testID={testID}
          style={[
            styles.surface,
            presentation === 'bottom' ? styles.bottomSurface : styles.centerSurface,
            presentation === 'center' && shadows.modal,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: withAlpha(colors.border, 0.35),
              borderRadius: presentation === 'bottom' ? radius.lg : radius.xl,
              maxWidth,
              opacity,
              transform: [{ translateY: translate }],
            },
            style,
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  bottomRoot: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  surface: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  centerSurface: {
    /* flexShrink alone does not bound a child that measures taller than the
     * screen — cap the sheet so tall content (profile rows, pickers) clips to
     * an inner ScrollView instead of overflowing the viewport. */
    flexShrink: 1,
    maxHeight: '85%',
  },
  bottomSurface: {
    maxHeight: '92%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});
