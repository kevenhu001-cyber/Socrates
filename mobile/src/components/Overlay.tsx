import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { motionDuration, motionEasing, withAlpha } from '../theme/theme';
import { motionAllowed, useReducedMotion } from '../native/reducedMotion';
import { useT } from '../i18n';

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
  const t = useT();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(presentation === 'bottom' ? 28 : 12)).current;
  const previousVisible = useRef(false);
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible === previousVisible.current) {
      if (visible && (!motionAllowed(reducedMotion) || !activeAnimation.current)) {
        activeAnimation.current?.stop();
        activeAnimation.current = null;
        opacity.setValue(1);
        translate.setValue(0);
      }
      return undefined;
    }
    previousVisible.current = visible;
    if (!visible) return undefined;
    if (!motionAllowed(reducedMotion)) {
      opacity.setValue(1);
      translate.setValue(0);
      return undefined;
    }
    opacity.setValue(0);
    translate.setValue(presentation === 'bottom' ? 28 : 12);
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motionDuration.page,
        easing: motionEasing.out,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: motionDuration.layout,
        easing: motionEasing.out,
        useNativeDriver: true,
      }),
    ]);
    activeAnimation.current = animation;
    animation.start(() => { activeAnimation.current = null; });
    return () => {
      animation.stop();
      if (activeAnimation.current === animation) activeAnimation.current = null;
    };
  }, [opacity, presentation, reducedMotion, translate, visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, visible]);

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
            accessibilityLabel={t('common.close')}
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
              /* ChatGPT/material bottom-sheet parity: a 28px top radius on
               * bottom sheets; centered modals keep the web `radius.xl`. */
              borderRadius: presentation === 'bottom' ? 28 : radius.xl,
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
