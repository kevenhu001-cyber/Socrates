import React, { useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { displayPrefsStore } from '../displayPrefs/displayPrefsStore';

/* P0 android-edge-to-edge: the window decor now opts out of "fits system
 * windows" (see MainActivity.kt + styles.xml), so the React Native surface
 * paints under the status and navigation bars. Each top-level screen owns
 * its own header (AppHeader) which is responsible for honouring the top
 * inset — pushing that onto SafeAreaView here would double-pad the header
 * (Screen.top + AppHeader.paddingTop) and leave a visible band between the
 * status bar and the app content. We therefore only pad the horizontal
 * edges here, keeping the bottom safe area for the gesture bar. */
const SCREEN_EDGES: Edge[] = ['left', 'right', 'bottom'];

/* P0 perf — the grid is pure decoration: memoised so parent screens that
 * re-render every streaming flush (ChatScreen at 64ms cadence) don't
 * rebuild the SVG tree each time. */
const BackgroundGrid = React.memo(function BackgroundGrid() {
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
});

export function Screen({ children, scroll = false, style, ...props }: ViewProps & { scroll?: boolean }) {
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

  /* The old `keyboard` prop wrapped the whole screen in a KeyboardAvoidingView
   * with `translate-with-padding` on Android. That double-compensated the IME:
   * the activity window already resizes (`windowSoftInputMode=adjustResize`),
   * so the KAV translated every element up while the keyboard animated, then
   * snapped them back once the resize landed — the visible "page lifts, then
   * falls" glitch. Keyboard compensation now belongs to the individual
   * screens (e.g. `KeyboardStickyView` around just the composer cluster), so
   * only the input area ever moves. */
  return (
    <SafeAreaView edges={SCREEN_EDGES} style={[styles.safe, { backgroundColor: colors.background }]}>
      {displayPrefs.gridEnabled ? <BackgroundGrid /> : null}
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20 },
});
