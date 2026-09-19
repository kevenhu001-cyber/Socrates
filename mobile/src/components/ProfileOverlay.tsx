import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n, useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { Overlay } from './Overlay';
import { toast } from './Toast';
import { appStore, useAppStore } from '../stores/appStore';
import { usersApi } from '../data/api/client';
import { native } from '../native/native';
import { storageOverlay, usageOverlay } from '../cmdK/overlayStores';
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
  return rows;
}

function SectionTitle({ title }: { title: string }) {
  const { colors, typography } = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.textMuted, fontFamily: typography.semibold }]}>{title}</Text>;
}

/* `customInstructions` is one string with two labelled sections, exactly as
 * `buildCustomInstructionsString` writes it on the web. */
const RESPONSE_MARKER = '[How to respond]';
const ABOUT_MARKER = '[About the user]';

function parseCustomInstructions(raw: string | null | undefined): { response: string; about: string } {
  const out = { response: '', about: '' };
  for (const chunk of String(raw || '').split('\n\n')) {
    if (chunk.startsWith(RESPONSE_MARKER)) out.response = chunk.slice(RESPONSE_MARKER.length).trim();
    else if (chunk.startsWith(ABOUT_MARKER)) out.about = chunk.slice(ABOUT_MARKER.length).trim();
  }
  return out;
}

function buildCustomInstructions(response: string, about: string): string {
  const parts: string[] = [];
  if (response) parts.push(`${RESPONSE_MARKER}\n${response}`);
  if (about) parts.push(`${ABOUT_MARKER}\n${about}`);
  return parts.join('\n\n');
}

/**
 * Web `.profile-modal` Preferences: language segment, web-search switch and
 * the two custom-instruction textareas with a debounced PATCH on `/users/me`.
 */
function PreferencesSection({ user }: { user: User | null }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const { language, setLanguage } = useI18n();
  const webSearchEnabled = useAppStore((s) => s.webSearchEnabled);
  const initial = parseCustomInstructions(user?.customInstructions);
  const [response, setResponse] = useState(initial.response);
  const [about, setAbout] = useState(initial.about);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const savedAt = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const queueSave = (nextResponse: string, nextAbout: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSaveState('idle');
    timer.current = setTimeout(() => {
      setSaveState('saving');
      void usersApi
        .updateMe({ customInstructions: buildCustomInstructions(nextResponse, nextAbout) })
        .then((updated) => {
          appStore.setUser(updated);
          savedAt.current = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setSaveState('saved');
        })
        .catch((error) => {
          setSaveState('idle');
          toast.show(error instanceof Error ? error.message : t('profile.saveFailed'), 'error');
        });
    }, 600);
  };

  const label = (text: string) => (
    <Text style={[styles.instLabel, { color: colors.text, fontFamily: typography.medium }]}>{text}</Text>
  );
  const area = (value: string, placeholder: string, key: 'response' | 'about') => (
    <TextInput
      value={value}
      onChangeText={(next) => {
        if (key === 'response') { setResponse(next); queueSave(next, about); }
        else { setAbout(next); queueSave(response, next); }
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline
      maxLength={4000}
      style={[
        styles.instArea,
        { color: colors.text, fontFamily: typography.body, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.sm },
      ]}
    />
  );

  return (
    <>
      <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{t('profile.language')}</Text>
        <View style={[styles.langToggle, { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}>
          {([['en', 'English'], ['zh', '中文']] as const).map(([value, text]) => (
            <AnimatedPressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: language === value }}
              accessibilityLabel={t('profile.language')}
              onPress={() => { void setLanguage(value); }}
              style={[styles.langOption, language === value && { backgroundColor: colors.accent, borderRadius: radius.xs }]}
            >
              <Text style={[styles.langText, { color: language === value ? colors.textInverse : colors.textMuted, fontFamily: typography.medium }]}>{text}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      <Text style={[styles.actionDesc, { color: colors.textMuted, fontFamily: typography.body }]}>{t('profile.webSearchDesc')}</Text>
      <AnimatedPressable
        accessibilityRole="switch"
        accessibilityState={{ checked: webSearchEnabled }}
        accessibilityLabel={t('profile.webSearch')}
        onPress={() => { void appStore.setWebSearchEnabled(!webSearchEnabled); }}
        style={styles.toggleRow}
      >
        <Text style={[styles.actionLabel, { color: colors.text, fontFamily: typography.medium }]}>{t('profile.webSearch')}</Text>
        <View style={[styles.toggleTrack, { backgroundColor: webSearchEnabled ? colors.accent : colors.surfaceHover }]}>
          <View style={[styles.toggleKnob, { backgroundColor: colors.textInverse, transform: [{ translateX: webSearchEnabled ? 18 : 0 }] }]} />
        </View>
      </AnimatedPressable>

      <View style={styles.instBlock}>
        {label(t('profile.howShouldIRespond'))}
        {area(response, t('profile.instructionsSavedPlaceholder'), 'response')}
        {label(t('profile.whatDoYouKnow'))}
        {area(about, t('profile.instructionsAboutPlaceholder'), 'about')}
        <Text style={[styles.instState, { color: colors.textMuted, fontFamily: typography.body }]}>
          {saveState === 'saving'
            ? t('common.saving')
            : saveState === 'saved'
              ? t('profile.savedAt', { hh: savedAt.current.split(':')[0] || '', mm: savedAt.current.split(':')[1] || '' })
              : t('profile.notYetSaved')}
        </Text>
      </View>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text, fontFamily: typography.medium }]}>{value}</Text>
    </View>
  );
}

/* `.profile-action-row` — label+description on the left, compact button on
 * the right (`ProfileModal.tsx` Data section). */
function ActionRow({ label, desc, action, danger = false, onPress }: { label: string; desc?: string; action: string; danger?: boolean; onPress: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <View style={styles.actionRow}>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, { color: colors.text, fontFamily: typography.medium }]}>{label}</Text>
        {desc ? <Text style={[styles.actionDesc, { color: colors.textMuted, fontFamily: typography.body }]}>{desc}</Text> : null}
      </View>
      <AnimatedPressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.actionBtn, { backgroundColor: colors.surfaceHover, borderRadius: 8 }]}
      >
        <Text style={[styles.actionBtnText, { color: danger ? colors.danger : colors.text, fontFamily: typography.medium }]}>{action}</Text>
      </AnimatedPressable>
    </View>
  );
}

export function ProfileOverlay({ visible, onClose, user }: ProfileOverlayProps) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const rows = buildRows(user, t);
  const displayName = user?.displayName || user?.email?.split('@')[0] || t('more.learner') || 'Learner';
  const initial = (displayName || 'U')[0].toUpperCase();
  const text = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const tier = String(user?.plan || user?.tier || '').trim();

  const clearConversations = () => {
    void appStore.clearLocalCache();
    toast.show(t('profile.cleared') === 'profile.cleared' ? 'Local chat history cleared' : t('profile.cleared'), 'success');
  };

  return (
    <Overlay
      visible={visible}
      onClose={onClose}
      maxWidth={360}
      testID="profile-overlay"
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}
    >
      {/* Header sits on `surfaceRaised` (web `bg-100`) over the `surface`
       * (`bg-000`) card — same raised-on-page contrast the web modal uses. */}
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

      {/* Rows outgrow the overlay's 85% cap on small phones or large
       * accessibility font scales — scroll the body, keep header/actions
       * pinned. flexShrink lets the ScrollView yield inside the bounded
       * sheet. */}
      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SectionTitle title={text('profile.account', 'Account')} />
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            {t('profile.empty') || 'No account data available'}
          </Text>
        ) : (
          rows.map((row) => <InfoRow key={row.label} label={row.label} value={row.value} />)
        )}

        <SectionTitle title={text('profile.subscription', 'Subscription')} />
        {tier ? <InfoRow label={text('profile.currentPlan', 'Current plan')} value={tier.charAt(0).toUpperCase() + tier.slice(1)} /> : null}
        <ActionRow
          label={text('profile.comparePlans', 'Compare plans')}
          action={text('common.open', 'Open')}
          onPress={() => { void native.openBrowser('https://topodrive.top/pricing'); }}
        />

        <SectionTitle title={text('profile.preferences', 'Preferences')} />
        <PreferencesSection user={user} />
        {user?.defaultModel ? <InfoRow label={t('profile.defaultModel')} value={user.defaultModel} /> : null}

        <SectionTitle title={text('profile.data', 'Data')} />
        <ActionRow
          label={text('profile.usage', 'Token usage')}
          desc={text('profile.usage.desc', 'View daily token usage and monthly breakdown.')}
          action={text('profile.view', 'View')}
          onPress={() => { onClose(); usageOverlay.open(); }}
        />
        <ActionRow
          label={text('profile.archivedSessions', 'Archived sessions')}
          desc={text('profile.archivedSessionsDesc', 'Sessions you deleted are kept here for 30 days before being permanently erased.')}
          action={text('profile.manage', 'Manage')}
          onPress={() => { onClose(); storageOverlay.open(); }}
        />
        <ActionRow
          label={text('profile.clearConversations', 'Clear conversations')}
          desc={text('profile.clearConversationsDesc', 'Remove all local chat history.')}
          action={text('profile.clear', 'Clear')}
          danger
          onPress={clearConversations}
        />
      </ScrollView>

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
  bodyScroll: {
    flexShrink: 1,
    flexGrow: 0,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionLabel: {
    fontSize: 13,
  },
  actionDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexShrink: 0,
  },
  actionBtnText: {
    fontSize: 12,
  },
  /* frontend `.profile-lang-toggle` / `.stg-toggle-track` / `.profile-instructions-*`. */
  langToggle: {
    flexDirection: 'row',
    padding: 2,
    gap: 2,
  },
  langOption: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  langText: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  toggleTrack: {
    width: 38,
    height: 22,
    borderRadius: 11,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  instBlock: {
    marginTop: 10,
    gap: 6,
  },
  instLabel: {
    fontSize: 12.5,
    marginTop: 4,
  },
  instArea: {
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlignVertical: 'top',
  },
  instState: {
    fontSize: 11,
    marginTop: 2,
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
