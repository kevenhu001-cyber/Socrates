import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { AnimatedPressable } from './AnimatedPressable';
import { useAppDrawer } from './AppDrawer';
import { useT } from '../i18n';

type Props = {
  title?: string;
  mode?: 'chat' | 'tutor';
  showModeSwitch?: boolean;
  conversationActive?: boolean;
  activeModelName?: string;
  isIncognito?: boolean;
  onModeChange?: (mode: 'chat' | 'tutor') => void;
  onNewChat?: () => void;
  onOpenModelPicker?: () => void;
  onToggleIncognito?: () => void;
  onSearchInSession?: () => void;
  onShare?: () => void;
  onMore?: () => void;
};

export function AppHeader({
  title,
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
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const { openDrawer } = useAppDrawer();

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 6, backgroundColor: colors.background }]}>
      {/* Left Action: Navigation Drawer */}
      <AnimatedPressable
        accessibilityLabel={t('common.openNavigation') || 'Open navigation'}
        onPress={openDrawer}
        style={[styles.circleBtn, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
      >
        <Ionicons name="menu-outline" size={24} color={colors.text} />
      </AnimatedPressable>

      {/* Center: Mode segmented switch or Title */}
      {showModeSwitch ? (
        <View style={[styles.modeSegment, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.pill }]}>
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
                  { borderRadius: radius.pill },
                  selected && [styles.modeButtonActive, { backgroundColor: colors.surfacePressed, borderColor: colors.borderStrong }],
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    {
                      color: selected ? colors.accent : colors.textMuted,
                      fontFamily: selected ? typography.semibold : typography.medium,
                    },
                  ]}
                >
                  {value === 'chat' ? (t('sidebar.nav.chat') || 'Chat') : (t('sidebar.nav.tutor') || 'Tutor')}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : title ? (
        <View style={styles.titleContainer}>
          <Text numberOfLines={1} style={[styles.titleText, { color: colors.text, fontFamily: typography.semibold }]}>
            {title}
          </Text>
        </View>
      ) : <View style={styles.spacer} />}

      {/* Right Actions */}
      <View style={styles.rightGroup}>
        {conversationActive ? (
          <View style={[styles.actionPill, { borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill }]}>
            {onSearchInSession ? (
              <AnimatedPressable
                accessibilityLabel="Find in conversation"
                onPress={onSearchInSession}
                style={styles.pillBtn}
              >
                <Ionicons name="search-outline" size={19} color={colors.text} />
              </AnimatedPressable>
            ) : null}
            {onShare ? (
              <AnimatedPressable
                accessibilityLabel={t('common.share') || 'Share'}
                onPress={onShare}
                style={styles.pillBtn}
              >
                <Ionicons name="share-outline" size={19} color={colors.text} />
              </AnimatedPressable>
            ) : null}
            <AnimatedPressable
              accessibilityLabel={t('common.more') || 'More'}
              onPress={onMore || openDrawer}
              style={styles.pillBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={19} color={colors.text} />
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.landingActions}>
            {onOpenModelPicker ? (
              <AnimatedPressable
                accessibilityLabel="Select Model"
                onPress={onOpenModelPicker}
                style={[
                  styles.modelChip,
                  {
                    backgroundColor: colors.surfaceRaised,
                    borderColor: colors.border,
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <Ionicons name="sparkles" size={13} color={colors.accent} />
                <Text numberOfLines={1} style={[styles.modelChipText, { color: colors.text, fontFamily: typography.medium }]}>
                  {activeModelName || 'Model'}
                </Text>
                <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}

            {onToggleIncognito ? (
              <AnimatedPressable
                accessibilityLabel="Incognito mode"
                onPress={onToggleIncognito}
                style={[
                  styles.circleBtn,
                  {
                    borderColor: isIncognito ? colors.accent : colors.border,
                    backgroundColor: isIncognito ? colors.accentSoft : colors.surfaceRaised,
                  },
                ]}
              >
                <Ionicons
                  name={isIncognito ? 'glasses' : 'glasses-outline'}
                  size={20}
                  color={isIncognito ? colors.accent : colors.textMuted}
                />
              </AnimatedPressable>
            ) : null}

            {onNewChat ? (
              <AnimatedPressable
                accessibilityLabel={t('sidebar.nav.new') || 'New chat'}
                onPress={onNewChat}
                style={[styles.circleBtn, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]}
              >
                <Ionicons name="create-outline" size={21} color={colors.text} />
              </AnimatedPressable>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSegment: {
    flexDirection: 'row',
    padding: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  modeText: {
    fontSize: 14,
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
  spacer: {
    flex: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  landingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    maxWidth: 160,
  },
  modelChipText: {
    fontSize: 13,
    flexShrink: 1,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    paddingHorizontal: 4,
    borderWidth: 1,
  },
  pillBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
