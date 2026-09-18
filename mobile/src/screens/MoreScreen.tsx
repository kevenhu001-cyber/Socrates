import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'More'>;

type MoreItemAction = 'plugins' | 'exam' | 'skills' | 'settings' | 'display' | 'shortcuts' | 'signout';

interface MenuItemSpec {
  action: MoreItemAction;
  labelKey: string;
  labelFallback: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
}

/**
 * 1:1 Parity with frontend `frontend/src/react/morePopover/MorePopover.tsx:39-47`.
 * Plugins and Exam live here because the desktop sidebar nav is trimmed to
 * five entries; they sit above the settings group.
 */
const ITEMS: MenuItemSpec[] = [
  { action: 'plugins', labelKey: 'sidebar.nav.plugins', labelFallback: 'Plugins', icon: 'extension-puzzle-outline' },
  { action: 'exam', labelKey: 'sidebar.nav.exam', labelFallback: 'Exam', icon: 'clipboard-outline' },
  { action: 'skills', labelKey: 'sidebar.more.skills', labelFallback: 'Skills & shortcuts', icon: 'sparkles-outline' },
  { action: 'settings', labelKey: 'sidebar.more.settings', labelFallback: 'API settings', icon: 'settings-outline' },
  { action: 'display', labelKey: 'sidebar.more.display', labelFallback: 'Display & theme', icon: 'options-outline' },
  { action: 'shortcuts', labelKey: 'sidebar.more.shortcuts', labelFallback: 'Keyboard shortcuts', icon: 'keypad-outline' },
  { action: 'signout', labelKey: 'sidebar.more.signOut', labelFallback: 'Sign out', icon: 'log-out-outline', danger: true },
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
  const [signoutArmed, setSignoutArmed] = useState(false);

  const handleAction = (action: MoreItemAction) => {
    switch (action) {
      case 'plugins':
        navigation.navigate('Embedded', { target: 'plugins', title: t('sidebar.nav.plugins') || 'Plugins' });
        break;
      case 'exam':
        navigation.navigate('Embedded', { target: 'exam', title: t('sidebar.nav.exam') || 'Exam' });
        break;
      case 'skills':
        navigation.navigate('Embedded', {
          target: 'skills',
          title: t('sidebar.more.skills') || 'Skills & shortcuts',
        });
        break;
      case 'settings':
        navigation.navigate('Embedded', { target: 'api-settings', title: t('sidebar.more.settings') || 'API settings' });
        break;
      case 'display':
        navigation.navigate('Display');
        break;
      case 'shortcuts':
        navigation.navigate('Embedded', { target: 'shortcuts', title: t('sidebar.more.shortcuts') || 'Keyboard shortcuts' });
        break;
      case 'signout':
        setSignoutArmed(true);
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
              const isDanger = Boolean(item.danger);
              return (
                <AnimatedPressable
                  key={item.action}
                  scale={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => handleAction(item.action)}
                  style={[
                    styles.menuItem,
                    isDanger && styles.menuItemDanger,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={isDanger ? colors.danger : colors.textSubtle}
                    style={styles.menuIcon}
                  />
                  <Text
                    style={[
                      styles.menuText,
                      {
                        color: isDanger ? colors.danger : colors.text,
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
      <Modal
        visible={shortcutsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setShortcutsOpen(false)}
      >
        <Pressable
          accessibilityLabel={t('common.close') || 'Close'}
          onPress={() => setShortcutsOpen(false)}
          style={[styles.modalBackdrop, { backgroundColor: colors.scrim }]}
        >
          <View
            style={[
              styles.shortcutsModal,
              {
                backgroundColor: colors.surface,
                borderColor: withAlpha(colors.border, 0.25),
                borderRadius: 14,
              },
            ]}
          >
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
        </Pressable>
      </Modal>

      {/* Sign out confirmation dialog */}
      <ConfirmDialog
        visible={signoutArmed}
        title={t('sidebar.more.signOut') || 'Sign out'}
        message={t('auth.signOutConfirm') || 'Are you sure you want to sign out?'}
        confirmLabel={t('sidebar.more.signOut') || 'Sign out'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setSignoutArmed(false)}
        onConfirm={() => {
          setSignoutArmed(false);
          void appStore.logout();
        }}
      />
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
  menuItemDanger: {
    marginTop: 4,
  },
  menuIcon: {
    width: 16,
    textAlign: 'center',
  },
  menuText: {
    fontSize: 13,
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  shortcutsModal: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 0.5,
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
