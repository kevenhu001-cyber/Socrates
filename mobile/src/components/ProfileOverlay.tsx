import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';
import { appStore } from '../stores/appStore';
import type { User } from '@socrates/contracts';

export interface ProfileOverlayProps {
  visible: boolean;
  onClose: () => void;
  user: User | null;
}

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  verified?: boolean;
}

function buildRows(user: User | null, t: (key: string) => string): Row[] {
  if (!user) return [];
  const rows: Row[] = [
    { icon: 'mail-outline', label: t('profile.email') || 'Email', value: user.email },
  ];
  if (user.displayName) {
    rows.push({
      icon: 'person-outline',
      label: t('profile.displayName') || 'Display name',
      value: user.displayName,
    });
  }
  if (user.plan || user.tier) {
    rows.push({
      icon: 'ribbon-outline',
      label: t('profile.plan') || 'Plan',
      value: String(user.plan || user.tier || ''),
    });
  }
  if (user.verifiedAt) {
    rows.push({
      icon: 'checkmark-circle-outline',
      label: t('profile.verified') || 'Verified',
      value: new Date(user.verifiedAt).toLocaleDateString(),
      verified: true,
    });
  } else if (!user.isGuest) {
    rows.push({
      icon: 'alert-circle-outline',
      label: t('profile.verified') || 'Verified',
      value: t('profile.unverified') || 'Not verified',
    });
  }
  if (user.createdAt) {
    rows.push({
      icon: 'calendar-outline',
      label: t('profile.memberSince') || 'Member since',
      value: new Date(user.createdAt).toLocaleDateString(),
    });
  }
  if (user.defaultModel) {
    rows.push({
      icon: 'hardware-chip-outline',
      label: t('profile.defaultModel') || 'Default model',
      value: user.defaultModel,
    });
  }
  return rows;
}

export function ProfileOverlay({ visible, onClose, user }: ProfileOverlayProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const rows = buildRows(user, t);
  const displayName = user?.displayName || user?.email?.split('@')[0] || t('more.learner') || 'Learner';
  const initial = (displayName || 'U')[0].toUpperCase();

  return (
    <Overlay
      visible={visible}
      onClose={onClose}
      maxWidth={360}
      testID="profile-overlay"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}
    >
      <View style={[styles.header, { backgroundColor: colors.surfaceRaised }]}>
        <View style={[styles.avatar, { backgroundColor: colors.textSecondary }]}>
          <Text style={[styles.avatarText, { color: colors.background, fontFamily: typography.semibold }]}>
            {initial}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text, fontFamily: typography.semibold }]}>
          {displayName}
        </Text>
        <Text style={[styles.email, { color: colors.textMuted }]}>
          {user?.email || t('profile.signedOutHint') || 'Signed out'}
        </Text>
      </View>

      <View style={styles.body}>
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {t('profile.empty') || 'No account data available'}
          </Text>
        ) : (
          rows.map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              style={[
                styles.row,
                {
                  borderBottomColor: colors.borderSubtle,
                  borderBottomWidth: index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{row.label}</Text>
              <Text style={[styles.rowValue, { color: colors.text, fontFamily: typography.medium }]}>
                {row.value}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.actions}>
        <AnimatedPressable
          accessibilityLabel={t('common.signOut') || 'Sign out'}
          onPress={() => {
            onClose();
            void appStore.logout();
          }}
          style={[styles.btn, { backgroundColor: colors.surfaceHover }]}
        >
          <Text style={[styles.btnText, { color: colors.danger, fontFamily: typography.medium }]}>
            {t('common.signOut') || 'Sign out'}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          accessibilityLabel={t('common.close') || 'Close'}
          onPress={onClose}
          style={[styles.btn, { backgroundColor: colors.surfaceRaised }]}
        >
          <Text style={[styles.btnText, { color: colors.textMuted, fontFamily: typography.medium }]}>
            {t('common.close') || 'Close'}
          </Text>
        </AnimatedPressable>
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  /* frontend `.profile-modal`: max-width 360px, border-radius 16px. */
  card: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: {
    fontSize: 24,
  },
  name: {
    fontSize: 17,
    textAlign: 'center',
  },
  email: {
    fontSize: 13,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
  },
  btn: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 13,
  },
});
