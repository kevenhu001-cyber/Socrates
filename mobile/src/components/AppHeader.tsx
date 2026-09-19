import React, { memo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppDrawer } from './AppDrawer';
import { useT } from '../i18n';
import { useResponsive } from '../theme/responsive';

type Props = {
  title?: string;
  /** Compact directory pages place their heading beside the hamburger. */
  leadingTitle?: string;
  /** Optional action rendered in the top bar's trailing slot. */
  headerAction?: React.ReactNode;
  /** Hide the compact navigation affordance when the permanent rail owns it. */
  showNavigation?: boolean;
  showIncognito?: boolean;
  mode?: 'chat' | 'tutor';
  showModeSwitch?: boolean;
  conversationActive?: boolean;
  activeModelName?: string;
  isIncognito?: boolean;
  onModeChange?: (mode: 'chat' | 'tutor') => void;
  onNewChat?: () => void;
  onOpenModelPicker?: (anchor?: { x: number; y: number; width: number; height: number }) => void;
  onToggleIncognito?: () => void;
  onSearchInSession?: () => void;
  onShare?: () => void;
  onMore?: () => void;
};

function HamburgerLines({ color }: { color: string }) {
  return (
    <View style={headerStyles.hamburger} pointerEvents="none">
      <View style={[headerStyles.line, { width: 14, backgroundColor: color }]} />
      <View style={[headerStyles.line, { width: 9, backgroundColor: color }]} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  hamburger: {
    gap: 4,
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: 14,
    height: 10,
  },
  line: {
    height: 2,
    borderRadius: 1,
  },
});

/* P0 perf — AppHeader is memoised so the parent screen re-rendering on
 * unrelated store commits (e.g. ChatScreen on every streamed token) does
 * not re-render the entire top bar with its segmented control and chip
 * buttons. The header has no internal mutable state of its own — every
 * value comes from props — so React.memo's shallow compare is enough. */
function AppHeaderImpl({
  title,
  leadingTitle,
  headerAction,
  showNavigation = true,
  showIncognito = true,
  mode = 'chat',
  showModeSwitch = false,
  conversationActive = false,
  activeModelName,
  isIncognito = false,
  onModeChange,
  onNewChat,
  onOpenModelPicker,
  onToggleIncognito,
  onSearchInSession,
  onShare,
  onMore,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const t = useT();
  const { openDrawer } = useAppDrawer();
  const { isCompact } = useResponsive();
  // The final mobile web cascade force-keeps the shared Chat / Tutor
  // segmented control on the empty landing surface. Earlier mobile CSS used
  // a dropdown, which is why the native implementation used to hide this.
  const renderModeSwitch = showModeSwitch;
  const renderTitle = Boolean(title) && !(isCompact && conversationActive);
  const titleModelAnchor = useRef<View>(null);
  const landingModelAnchor = useRef<View>(null);

  const openModelPickerFrom = (ref: React.RefObject<View | null>) => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      onOpenModelPicker?.();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      onOpenModelPicker?.({ x, y, width, height });
    });
  };

  /* P1-2 alignment: every value below is sourced from the canonical
   * `@socrates/theme` palette so the AppHeader matches `frontend`'s
   * `.sidebar-header` / topbar tokens. The previous dark-only literals
   * (`#262626`, `#1a1a1a`, `#d9d9d9`, `rgba(255,255,255,0.06)`) were
   * legacy pre-align values; the residual `'#000'` shadowColor further
   * down is RN's required literal for the active-tab elevation and is
   * not a color token. */
  const circleBg = colors.surface;
  const activeTabBg = colors.surfaceHover;

  return (
    <View
      style={[
        styles.header,
        isCompact ? styles.headerCompact : null,
        {
          /* P0 android-edge-to-edge: Screen no longer pads the top edge
           * (the window draws under the status bar). This header is now the
           * sole owner of the top safe-area inset, so we add `insets.top`
           * here and a small visual gap underneath. The compact branch sits
           * flush against the top of the device so the hamburger / chip
           * never strays into the status bar; the wider branch keeps a
           * 4px visual cushion matching the desktop top bar. */
          paddingTop: isCompact ? insets.top + 8 : insets.top + 10,
          backgroundColor: colors.background,
        },
      ]}
    >
      {/* Left Action: Navigation Drawer (Two-line hamburger matching cur-mobile-home.png) */}
      {showNavigation ? (
        leadingTitle && isCompact ? (
          <View style={styles.leadingGroup}>
            <AnimatedPressable
              accessibilityLabel={t('common.openNavigation') || 'Open navigation'}
              onPress={openDrawer}
              hitSlop={8}
              scale={0.94}
              style={[styles.circleBtn, styles.circleBtnCompact, { borderColor: 'transparent', backgroundColor: 'transparent' }]}
            >
              <HamburgerLines color={colors.text} />
            </AnimatedPressable>
            <Text numberOfLines={1} style={[styles.leadingTitle, { color: colors.text, fontFamily: typography.semibold }]}>{leadingTitle}</Text>
          </View>
        ) : (
          <AnimatedPressable
            accessibilityLabel={t('common.openNavigation') || 'Open navigation'}
            onPress={openDrawer}
            hitSlop={isCompact ? 8 : undefined}
            scale={isCompact ? 0.94 : 0.92}
            style={[
              styles.circleBtn,
              isCompact ? styles.circleBtnCompact : null,
              {
                borderColor: isCompact ? 'transparent' : colors.border,
                backgroundColor: isCompact ? 'transparent' : circleBg,
              },
            ]}
          >
            <HamburgerLines color={colors.text} />
          </AnimatedPressable>
        )
      ) : <View style={styles.circleBtn} />}

      {/* Center: Mode segmented switch or Title */}
      {renderModeSwitch ? (
        <View
          style={[
            styles.modeSegment,
            {
              backgroundColor: isCompact ? colors.modeTabsBg : circleBg,
              borderColor: colors.border,
            },
          ]}
        >
          {(['chat', 'tutor'] as const).map((value) => {
            const selected = value === mode;
            return (
              <AnimatedPressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onModeChange?.(value)}
                style={[
                  styles.modeButton,
                  selected && [
                    styles.modeButtonActive,
                    {
                      backgroundColor: activeTabBg,
                      borderColor: colors.border,
                    },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    isCompact ? styles.modeTextCompact : null,
                    {
                      color: selected ? colors.text : colors.textMuted,
                      fontFamily: typography.medium,
                      fontWeight: '500',
                    },
                  ]}
                >
                  {value === 'chat' ? (t('sidebar.nav.chat') || 'Chat') : (t('sidebar.nav.tutor') || 'Tutor')}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : renderTitle ? (
        <View style={styles.titleContainer}>
          <Text numberOfLines={1} style={[styles.titleText, { color: colors.text, fontFamily: typography.semibold }]}>
            {title}
          </Text>
          {/* P1 1:1 — model picker chip mirrors frontend `.model-picker-trigger`
           * (`frontend/src/styles.css:1104`). Previously `activeModelName` /
           * `onOpenModelPicker` were accepted as props but never rendered. */}
          {onOpenModelPicker && !isCompact ? (
            <View ref={titleModelAnchor} collapsable={false}>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={activeModelName || t('settings.model') || 'Model'}
                onPress={() => openModelPickerFrom(titleModelAnchor)}
                style={[styles.modelChip, { borderColor: colors.border }]}
              >
                <Text numberOfLines={1} style={[styles.modelChipText, { color: colors.textMuted, fontFamily: typography.medium }]}>
                  {activeModelName || t('settings.model') || 'Model'}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.spacer} />
      )}

      {/* Right Actions */}
      <View style={styles.rightGroup}>
        {headerAction ? <View style={styles.headerAction}>{headerAction}</View> : null}
        {conversationActive ? (
          /* Web `.top-bar-right` renders separate `.find-btn` / `.share-btn`
           * square hairline buttons (28px, 6px radius) — not a joined pill. */
          <View style={styles.actionGroup}>
            {onSearchInSession ? (
              <AnimatedPressable
                accessibilityLabel="Find in conversation"
                onPress={onSearchInSession}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="search-outline" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
            {onShare ? (
              <AnimatedPressable
                accessibilityLabel={t('common.share') || 'Share'}
                onPress={onShare}
                style={[styles.actionBtn, { borderColor: colors.border }]}
              >
                <Ionicons name="share-outline" size={15} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
            <AnimatedPressable
              accessibilityLabel={t('common.more') || 'More'}
              onPress={onMore || openDrawer}
              style={[styles.actionBtn, { borderColor: colors.border }]}
            >
              <Ionicons name="ellipsis-horizontal" size={15} color={colors.textMuted} />
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.landingActions}>
            {/* P1 1:1 — landing model trigger (frontend shows the model
             * picker next to the landing composer). Visible when the
             * parent wires `onOpenModelPicker`, e.g. NewChatScreen. */}
            {onOpenModelPicker && !isCompact ? (
              <View ref={landingModelAnchor} collapsable={false}>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel={activeModelName || t('settings.model') || 'Model'}
                  onPress={() => openModelPickerFrom(landingModelAnchor)}
                  style={[styles.modelChipInline, { borderColor: colors.border, backgroundColor: circleBg }]}
                >
                  <Text numberOfLines={1} style={[styles.modelChipText, { color: colors.textMuted, fontFamily: typography.medium }]}>
                    {activeModelName || t('settings.model') || 'Model'}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            ) : null}
            {showIncognito ? <AnimatedPressable
              accessibilityLabel={isIncognito ? 'Incognito active' : (t('sidebar.nav.new') || 'Conversation')}
              onPress={onToggleIncognito || onNewChat}
              hitSlop={isCompact ? 8 : undefined}
              scale={isCompact ? 0.94 : 0.92}
              style={[
                styles.circleBtn,
                isCompact ? styles.circleBtnCompact : null,
                {
                  borderColor: isCompact ? 'transparent' : (isIncognito ? colors.accent : colors.border),
                  backgroundColor: isIncognito
                    ? colors.accentSoft
                    : isCompact
                      ? 'transparent'
                      : circleBg,
                },
              ]}
            >
              <Ionicons name="glasses-outline" size={isCompact ? 16 : 19} color={isIncognito ? colors.accent : colors.textMuted} />
            </AnimatedPressable> : null}
          </View>
        )}
      </View>
    </View>
  );
}

export const AppHeader = memo(AppHeaderImpl);

const styles = StyleSheet.create({
  /* frontend `.top-bar { padding: 8px 14px; min-height: 44px; gap: 12px }` */
  header: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    minHeight: 44,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  /* Web mobile `.top-bar`: min-height 56px, padding 8px 10px
   * (mobile-parity.css:533-536). */
  headerCompact: {
    minHeight: 56,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  /* P2-1 alignment: outer pill/circle buttons drop from 38 → 32 to
   * match `frontend`'s `.icon-btn` (32 × 32). The 38 value was a
   * pre-align touch-target overshoot. */
  /* frontend `.icon-btn`: 32x32 with an 8px radius (rounded square,
   * not a pill). */
  circleBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Web mobile forces the top-bar affordances to 40px transparent rounded
   * squares (mobile-parity.css:557-587). */
  circleBtnCompact: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  /* Web mobile `.top-mode-tabs`: 168x40, radius 999, 2px padding, #131313
   * pill (mobile-parity.css:538-555). */
  modeSegment: {
    flexDirection: 'row',
    height: 40,
    width: 168,
    borderRadius: 999,
    padding: 2,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButton: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  /* Web mobile `.app-mode-toggle`: 15px, weight 500 (mobile-parity.css:554). */
  modeText: {
    fontSize: 15,
  },
  modeTextCompact: {
    fontSize: 15,
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  titleText: {
    fontSize: 16,
    textAlign: 'center',
  },
  /* frontend `.model-picker-trigger`: inline-flex, gap 6px, padding
   * 5px 10px, radius 6px, 13px text. Rendered under the title so the
   * conversation header stays one row on narrow phones. */
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 4,
    maxWidth: 220,
  },
  modelChipText: {
    fontSize: 13,
    lineHeight: 16,
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  leadingTitle: {
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  headerAction: {
    alignItems: 'flex-end',
  },
  landingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelChipInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: 160,
    minHeight: 32,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /* frontend `.find-btn` / `.share-btn` (styles.css:957-960,
   * .top-bar-right overrides:9231-9239): 28x28, 6px radius, hairline
   * border, transparent fill, muted glyph. */
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
