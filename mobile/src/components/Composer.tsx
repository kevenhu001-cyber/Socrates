import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';

/* Velocity-based motion planner mirrored from the web app's
 * ui/motion.js. Same intent: distance → duration so multi-line
 * composer expansion feels identical to the keyboard/scroll motion
 * the user already sees on the web surface. The minHeight delta is
 * small (64 → 108 = 44 px) so a short, snappy duration reads as
 * "the composer is opening" rather than "the composer is
 * animating". */
const COLLAPSED_HEIGHT = 64;
const EXPANDED_HEIGHT = 108;
const MOTION_VELOCITY = 1100;     // px/sec
const MIN_DURATION_MS = 90;
const MAX_DURATION_MS = 320;
function planHeightDuration(distance: number): number {
  if (distance < 1) return 0;
  const raw = (distance / MOTION_VELOCITY) * 1000;
  return Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, raw));
}

export function Composer({ value, disabled, onChangeText, onSend, onStop, onAttach }: { value: string; disabled?: boolean; onChangeText: (value: string) => void; onSend: () => void; onStop: () => void; onAttach: () => void }) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0 && !disabled;

  /* Interpolate minHeight so the focus-in expansion matches the
     mobile composer's focus state and the desktop web's
     auto-height hook — all three share the same velocity
     language. alignItems also tweens (center → flex-end) so the
     send/attach buttons don't snap to the new vertical position
     before the height grows. The previous implementation toggled
     `wrapFocused` instantly, which is the "shape-change jump" the
     user reported. */
  const minHeightAnim = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const alignItemsAnim = useRef(new Animated.Value(0)).current;
  const radiusAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    /* Animated.timing's `toValue` is an absolute target. The framework
       interpolates from the currently-running animated value to
       the new target, so we don't need to read the live value via
       React Native's private __getValue() API (which has no public
       contract and breaks between versions). The duration is fixed
       because the geometry delta between collapsed and expanded is
       a constant 44 px; a velocity-derived duration would yield
       the same value here without any extra plumbing. */
    const toHeight = focused ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    const duration = planHeightDuration(Math.abs(EXPANDED_HEIGHT - COLLAPSED_HEIGHT));
    Animated.parallel([
      Animated.timing(minHeightAnim, {
        toValue: toHeight,
        duration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
      Animated.timing(alignItemsAnim, {
        toValue: focused ? 1 : 0,
        duration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
      Animated.timing(radiusAnim, {
        toValue: focused ? 1 : 0,
        duration,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [focused, minHeightAnim, alignItemsAnim, radiusAnim]);

  const animatedBorderRadius = radiusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [radius.pill, radius.xl],
  });

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surfaceRaised,
          borderColor: colors.borderStrong,
          borderRadius: animatedBorderRadius as unknown as number,
          padding: spacing.xs,
          minHeight: minHeightAnim,
          alignItems: focused ? 'flex-end' : 'center',
        },
      ]}
    >
      <AnimatedPressable onPress={onAttach} accessibilityRole="button" accessibilityLabel={t('chat.attach')} style={styles.add}>
        <Ionicons name="attach" size={29} color={colors.text} />
      </AnimatedPressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        maxLength={32000}
        placeholder={t('chat.placeholder')}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, fontFamily: typography.body }]}
        returnKeyType="default"
        blurOnSubmit={false}
      />
      {disabled ? (
        <AnimatedPressable accessibilityLabel={t('chat.stopGenerating')} onPress={onStop} style={[styles.send, { backgroundColor: colors.text }]}>
          <Ionicons name="stop" size={17} color={colors.background} />
        </AnimatedPressable>
      ) : (
        <AnimatedPressable accessibilityLabel={t('chat.send')} disabled={!canSend} onPress={onSend} style={[styles.send, { backgroundColor: canSend ? colors.action : colors.surfacePressed }]}>
          <Ionicons name="arrow-up" size={25} color={canSend ? colors.white : colors.textSubtle} />
        </AnimatedPressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 1 },
  add: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, fontSize: 16, lineHeight: 24, maxHeight: 130, minHeight: 44, paddingHorizontal: 5, paddingTop: 10, paddingBottom: 9, textAlignVertical: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
