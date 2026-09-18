import React, { useSyncExternalStore } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { displayPrefsStore } from '../displayPrefs/displayPrefsStore';

const WITH_BOTTOM: Edge[] = ['top', 'left', 'right', 'bottom'];

function BackgroundGrid() {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="screen-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <Path
              d="M24 0H0V24"
              fill="none"
              stroke={withAlpha(colors.borderStrong, 0.18)}
              strokeWidth={StyleSheet.hairlineWidth}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#screen-grid)" />
      </Svg>
    </View>
  );
}

export function Screen({ children, scroll = false, keyboard = false, style, ...props }: ViewProps & { scroll?: boolean; keyboard?: boolean }) {
  const { colors } = useTheme();
  const displayPrefs = useSyncExternalStore(
    displayPrefsStore.subscribe,
    displayPrefsStore.get,
    displayPrefsStore.get,
  );
  /* `style` describes the content box in both modes: on the scroll path it
   * belongs on `contentContainerStyle` (the ScrollView itself is the flex
   * child). Remaining ViewProps (testID, accessibility, pointerEvents, …) were
   * previously dropped whenever `scroll` was set — spread them on the
   * ScrollView so the two modes accept the same props. */
  const content = scroll
    ? (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, style]}
        keyboardShouldPersistTaps="handled"
        {...props}
      >
        {children}
      </ScrollView>
    )
    : <View style={[styles.content, style]} {...props}>{children}</View>;

  /* React Native's built-in KeyboardAvoidingView only receives
   * keyboardDidShow/keyboardDidHide on Android, so its height jumps after the
   * IME has already reached the final frame. Keyboard Controller follows the
   * native inset animation on the UI thread. translate-with-padding keeps the
   * header visually fixed while the flexible body and composer move together. */
  const wrapped = keyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'android' ? 'translate-with-padding' : 'padding'}
      automaticOffset
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;

  return (
    <SafeAreaView edges={WITH_BOTTOM} style={[styles.safe, { backgroundColor: colors.background }]}>
      {displayPrefs.gridEnabled ? <BackgroundGrid /> : null}
      {wrapped}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20 },
});
