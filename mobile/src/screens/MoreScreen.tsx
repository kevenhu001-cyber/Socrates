import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Overlay } from '../components/Overlay';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'More'>;

type MoreItemAction = 'exam' | 'skills' | 'shortcuts';

interface MenuItemSpec {
  action: MoreItemAction;
  labelKey: string;
  labelFallback: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/**
 * 1:1 Parity with frontend `frontend/src/react/morePopover/MorePopover.tsx:39-47`.
 * Exam and Skills are hidden behind Customize in the web sidebar. Plugins,
 * API settings, display/theme, and account actions keep their own primary or
 * footer affordances and therefore are not duplicated in this menu.
 */
const ITEMS: MenuItemSpec[] = [
  { action: 'exam', labelKey: 'sidebar.nav.exam', labelFallback: 'Exam', icon: 'clipboard-outline' },
  { action: 'skills', labelKey: 'sidebar.more.skills', labelFallback: 'Skills & shortcuts', icon: 'sparkles-outline' },
  { action: 'shortcuts', labelKey: 'sidebar.more.shortcuts', labelFallback: 'Keyboard shortcuts', icon: 'keypad-outline' },
];

const SHORTCUTS_LIST = [
  { key: '⌘ K / Ctrl K', desc: 'Command palette' },
  { key: '⌘ Shift O / Ctrl Shift O', desc: 'New chat session' },
  { key: '⌘ F / Ctrl F', desc: 'Find in conversation' },
  { key: '⌘ , / Ctrl ,', desc: 'Settings & preferences' },
  { key: 'Esc', desc: 'Close dialogs and overlays' },
];

export function MoreScreen({ navigation }: Props) {
  const { colors, radius, typography, spacing } = useTheme();
  const t = useT();
  const state = useAppStore();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const handleAction = (action: MoreItemAction) => {
    switch (action) {
      case 'exam':
        navigation.navigate('ExamSession');
        break;
      case 'skills':
        navigation.navigate('Embedded', {
          target: 'skills',
          title: t('sidebar.more.skills') || 'Skills & shortcuts',
        });
        break;
      case 'shortcuts':
        setShortcutsOpen(true);
        break;
    }
  };

  const displayName = state.user?.displayName || state.user?.email?.split('@')[0] || t('more.learner') || 'Learner';
  const initial = (displayName || 'S')[0].toUpperCase();

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('more.heading') || 'More'} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.container}>
          {/* User profile summary card */}
          <View style={[styles.profile, { backgroundColor: colors.surface, borderColor: withAlpha(colors.border, 0.25), borderRadius: radius.lg, padding: spacing.md }]}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              <Text style={[styles.avatarText, { color: colors.background, fontFamily: typography.semibold }]}>{initial}</Text>
            </View>
            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={[styles.profileName, { color: colors.text, fontFamily: typography.semibold }]}>{displayName}</Text>
              <Text numberOfLines={1} style={[styles.profileEmail, { color: colors.textMuted }]}>{state.user?.email || ''}</Text>
            </View>
          </View>

          {/* Popover menu card — 1:1 presentation of frontend `.sidebar-more-popover` (styles.css:697-706) */}
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: withAlpha(colors.border, 0.5),
                borderRadius: 10,
              },
            ]}
          >
            {ITEMS.map((item) => {
              const label = t(item.labelKey) || item.labelFallback;
              return (
                <AnimatedPressable
                  key={item.action}
                  scale={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => handleAction(item.action)}
                  style={styles.menuItem}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={colors.textSubtle}
                    style={styles.menuIcon}
                  />
                  <Text
                    style={[
                      styles.menuText,
                      {
                        color: colors.text,
                        fontFamily: typography.body,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Keyboard shortcuts modal */}
      <Overlay
        visible={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        maxWidth={380}
        testID="keyboard-shortcuts-dialog"
      >
        <View style={styles.shortcutsModal}>
            <View style={styles.shortcutsHeader}>
              <Text style={[styles.shortcutsTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                {t('sidebar.more.shortcuts') || 'Keyboard shortcuts'}
              </Text>
              <AnimatedPressable
                accessibilityLabel={t('common.close') || 'Close'}
                onPress={() => setShortcutsOpen(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
            <View style={styles.shortcutsBody}>
              {SHORTCUTS_LIST.map((sc, idx) => (
                <View
                  key={sc.key}
                  style={[
                    styles.shortcutRow,
                    idx < SHORTCUTS_LIST.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: withAlpha(colors.border, 0.12),
                    },
                  ]}
                >
                  <Text style={[styles.shortcutDesc, { color: colors.text, fontFamily: typography.body }]}>
                    {sc.desc}
                  </Text>
                  <View style={[styles.shortcutKeyBadge, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.border, 0.3) }]}>
                    <Text style={[styles.shortcutKeyText, { color: colors.textMuted, fontFamily: typography.mono }]}>
                      {sc.key}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
        </View>
      </Overlay>

    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  content: { paddingHorizontal: 18, paddingBottom: 28 },
  container: { width: '100%', maxWidth: 360, alignSelf: 'center' },
  profile: {
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 15,
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 3,
  },
  menuCard: {
    borderWidth: 0.5,
    padding: 6,
    gap: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 7,
    minHeight: 38,
  },
  menuIcon: {
    width: 16,
    textAlign: 'center',
  },
  menuText: {
    fontSize: 13,
    flex: 1,
  },
  shortcutsModal: {
    padding: 18,
  },
  shortcutsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  shortcutsTitle: {
    fontSize: 15,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutsBody: {
    marginTop: 6,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    gap: 12,
  },
  shortcutDesc: {
    fontSize: 13,
    flex: 1,
  },
  shortcutKeyBadge: {
    borderWidth: 0.5,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  shortcutKeyText: {
    fontSize: 11,
  },
});
