import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Memory } from '@socrates/contracts';
import { Screen } from '../components/Screen';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { toast } from '../components/Toast';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppHeader } from '../components/AppHeader';
import { useTheme, useThemeController, type ThemePreference } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useI18n, useT, type Language } from '../i18n';
import { getPreferences, loadPreferences, setPreference, subscribeToPreferences } from '../data/preferences';
import { registerPushNotifications, unregisterPushNotifications } from '../native/push';
import { appStore, useAppStore } from '../stores/appStore';
import { memoryApi, usersApi } from '../data/api/client';
import { ModelPickerModal, AVAILABLE_MODELS } from '../components/ModelPickerModal';
import { displayPrefsStore, DISPLAY_FONT_STEPS, DISPLAY_WIDTH_STEPS, FONT_LABELS, WIDTH_LABELS, widthScaleToPx, pxToWidthScale } from '../displayPrefs/displayPrefsStore';

const LANGUAGE_OPTIONS: Array<[Language, string]> = [
  ['en', 'common.languageEn'],
  ['zh', 'common.languageZh'],
];

const THEME_OPTIONS: Array<[ThemePreference, string]> = [
  ['dark', 'display.themeDark'],
  ['light', 'display.themeLight'],
  ['system', 'display.themeSystem'],
];

export function ToggleTrack({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(value ? 16 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 16 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [value, anim]);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        {
          backgroundColor: value ? colors.accent : withAlpha(colors.surfaceRaised, 0.6),
          borderColor: value ? colors.accent : withAlpha(colors.border, 0.5),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toggleKnob,
          {
            backgroundColor: colors.white,
            transform: [{ translateX: anim }],
          },
        ]}
      />
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { colors, radius, spacing, typography } = useTheme();
  const { preference, setPreference: setThemePreference } = useThemeController();
  const { language, setLanguage } = useI18n();
  const t = useT();
  const state = useAppStore();
  const prefs = useSyncExternalStore(subscribeToPreferences, getPreferences, getPreferences);
  const [displayName, setDisplayName] = useState(state.user?.displayName || '');
  const [customInstructions, setCustomInstructions] = useState(state.user?.customInstructions || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  useEffect(() => { void loadPreferences(); }, []);
  useEffect(() => {
    setDisplayName(state.user?.displayName || '');
    setCustomInstructions(state.user?.customInstructions || '');
  }, [state.user?.id, state.user?.displayName, state.user?.customInstructions]);
  useEffect(() => {
    let mounted = true;
    setMemoryBusy(true);
    void memoryApi.list()
      .then((result) => { if (mounted) setMemories(result.memories); })
      .catch((err) => { console.warn('[Settings] Failed to fetch memories:', err); })
      .finally(() => { if (mounted) setMemoryBusy(false); });
    return () => { mounted = false; };
  }, []);

  const toggleNotifications = async (value: boolean) => {
    await setPreference('notifications', value);
    try {
      if (value) await registerPushNotifications();
      else await unregisterPushNotifications();
    } catch (err) {
      console.warn('[Settings] Failed to toggle push notifications:', err);
    }
  };

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileSaved(false);
    try {
      const user = await usersApi.updateMe({ displayName: displayName.trim() || null, customInstructions: customInstructions.trim() || null });
      appStore.setUser(user);
      setProfileSaved(true);
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : t('settings.profileSaved'), 'error');
    } finally {
      setProfileBusy(false);
    }
  };

  const toggleMemory = async (memory: Memory, enabled: boolean) => {
    try {
      const updated = await memoryApi.patch(memory.id, { enabled });
      setMemories((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : t('settings.memoryLoadFailed'), 'error');
    }
  };

  const [pendingForget, setPendingForget] = useState<Memory | null>(null);

  const forgetMemory = (memory: Memory) => setPendingForget(memory);

  const confirmForget = () => {
    const memory = pendingForget;
    if (!memory) return;
    setPendingForget(null);
    void memoryApi.remove(memory.id).then(() => setMemories((items) => items.filter((item) => item.id !== memory.id))).catch((caught) => toast.show(caught instanceof Error ? caught.message : t('settings.memoryLoadFailed'), 'error'));
  };

  const segment = <T extends string>(
    options: Array<[T, string]>,
    active: T,
    onPick: (value: T) => void,
  ) => (
    <View style={styles.segment}>
      {options.map(([value, key]) => {
        const selected = value === active;
        return (
          <AnimatedPressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onPick(value)}
            style={[styles.segmentButton, {
              borderColor: selected ? colors.accent : colors.border,
              backgroundColor: selected ? colors.accentSoft : colors.background,
              borderRadius: radius.md,
            }]}
          >
            <Text style={{ color: selected ? colors.accent : colors.textMuted, fontWeight: selected ? '700' : '500' }}>{t(key)}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('settings.heading')} onNewChat={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.modalContainer}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, padding: spacing.md }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('settings.profile')}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings.displayName')}</Text>
        <TextInput
          accessibilityLabel={t('settings.displayName')}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('settings.displayNamePlaceholder')}
          placeholderTextColor={colors.textSubtle}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, borderRadius: 10, fontFamily: typography.mono }]}
        />
        <Text style={[styles.title, { color: colors.text, marginTop: 18 }]}>{t('settings.customInstructions')}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.customInstructionsBody')}</Text>
        <TextInput
          accessibilityLabel={t('settings.customInstructions')}
          value={customInstructions}
          onChangeText={setCustomInstructions}
          multiline
          maxLength={4000}
          placeholder={t('settings.customInstructionsPlaceholder')}
          placeholderTextColor={colors.textSubtle}
          textAlignVertical="top"
          style={[styles.input, styles.instructions, { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.borderSubtle, borderRadius: 10, fontFamily: typography.mono }]}
        />
        <View style={styles.profileFooter}>
          {profileSaved ? <Text style={[styles.saved, { color: colors.success }]}>{t('settings.profileSaved')}</Text> : <View />}
          <AnimatedPressable disabled={profileBusy} onPress={() => { void saveProfile(); }} style={[styles.saveButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}>
            {profileBusy ? <ActivityIndicator color={colors.white} /> : <Text style={[styles.saveText, { color: colors.white }]}>{t('settings.saveProfile')}</Text>}
          </AnimatedPressable>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, padding: spacing.md, marginTop: 16 }]}> 
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('settings.appearance')}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{t('display.theme')}</Text>
        {segment(THEME_OPTIONS, preference, (value) => { void setThemePreference(value); })}
        <Text style={[styles.title, { color: colors.text, marginTop: 22 }]}>{t('common.language')}</Text>
        {segment(LANGUAGE_OPTIONS, language, (value) => { void setLanguage(value); })}
        <DisplayPrefsSection />
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, padding: spacing.md, marginTop: 16 }]}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('settings.model') || 'AI Model'}</Text>
        <View style={styles.modelHeaderRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {AVAILABLE_MODELS.find((m) => m.id === state.selectedModel)?.name || 'Socrates Default'}
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {AVAILABLE_MODELS.find((m) => m.id === state.selectedModel)?.description || ''}
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setModelPickerOpen(true)}
            style={[styles.switchModelBtn, { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderRadius: radius.md }]}
          >
            <Text style={{ color: colors.accent, fontWeight: '600', fontSize: 13 }}>
              {t('common.change') || 'Switch'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, padding: spacing.md, marginTop: 16 }]}>
        <View style={styles.row}>
          <View style={styles.rowCopy}>
            <Text style={[styles.title, { color: colors.text }]}>{t('settings.notifications')}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.notificationsBody')}</Text>
          </View>
          <ToggleTrack
            value={prefs.notifications}
            onValueChange={(value) => { void toggleNotifications(value); }}
          />
        </View>
        <View style={[styles.row, styles.rowDivided, { borderTopColor: colors.borderSubtle }]}>
          <View style={styles.rowCopy}>
            <Text style={[styles.title, { color: colors.text }]}>{t('settings.haptics')}</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>{t('settings.hapticsBody')}</Text>
          </View>
          <ToggleTrack
            value={prefs.haptics}
            onValueChange={(value) => { void setPreference('haptics', value); }}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle, borderRadius: 16, padding: spacing.md, marginTop: 16 }]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('settings.memory')}</Text>
        <Text style={[styles.body, { color: colors.textMuted, marginBottom: 10 }]}>{t('settings.memoryBody')}</Text>
        {memoryBusy ? <ActivityIndicator color={colors.accent} style={styles.memoryLoading} /> : memories.length ? memories.map((memory) => (
          <View key={memory.id} style={[styles.memoryRow, { borderTopColor: colors.borderSubtle }]}
          >
            <View style={styles.memoryCopy}>
              <Text selectable style={[styles.memoryText, { color: colors.text }]}>{memory.text}</Text>
              {memory.enabled === false ? <Text style={[styles.memoryDisabled, { color: colors.textSubtle }]}>{t('settings.memoryDisabled')}</Text> : null}
            </View>
            <ToggleTrack value={memory.enabled !== false} onValueChange={(value) => { void toggleMemory(memory, value); }} />
            <AnimatedPressable accessibilityLabel={`${t('settings.memoryDelete')}: ${memory.text}`} onPress={() => forgetMemory(memory)} style={styles.forgetButton}><Ionicons name="trash-outline" size={18} color={colors.danger} /></AnimatedPressable>
          </View>
        )) : <Text style={[styles.body, { color: colors.textSubtle }]}>{t('settings.noMemories')}</Text>}
      </View>
      </View>
      </ScrollView>
      <ModelPickerModal
        visible={modelPickerOpen}
        selectedId={state.selectedModel}
        onSelect={(id) => appStore.setSelectedModel(id)}
        onClose={() => setModelPickerOpen(false)}
      />
      <ConfirmDialog
        visible={pendingForget !== null}
        title={t('settings.memoryDelete')}
        message={pendingForget?.text}
        confirmLabel={t('settings.memoryDelete')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setPendingForget(null)}
        onConfirm={confirmForget}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  content: { paddingHorizontal: 18, paddingBottom: 28 },
  modalContainer: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth },
  sectionLabel: { fontSize: 12, letterSpacing: 0.48, fontWeight: '500', textTransform: 'uppercase', marginBottom: 12 },
  segment: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segmentButton: { flex: 1, minHeight: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  modelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  switchModelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  input: { minHeight: 42, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginTop: 9 },
  instructions: { minHeight: 110, paddingTop: 12, paddingBottom: 12 },
  profileFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 },
  saved: { fontSize: 12 },
  saveButton: { minHeight: 42, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 13, fontWeight: '700' },
  memoryLoading: { paddingVertical: 10 },
  memoryRow: { minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 },
  memoryCopy: { flex: 1, minWidth: 0 },
  memoryText: { fontSize: 13, lineHeight: 19 },
  memoryDisabled: { fontSize: 11, marginTop: 4 },
  forgetButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  swatch: { width: 32, height: 32, borderWidth: 2 },
  swatchReset: { width: 32, height: 32, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  displaySegmentRow: { flexDirection: 'row', gap: 8 },
  displaySegment: { flex: 1, minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  displaySegmentText: { fontSize: 12 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  toggleTrack: { width: 36, height: 20, borderRadius: 10, borderWidth: 0.5, justifyContent: 'center', paddingHorizontal: 2 },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, elevation: 2 },
});

/* P0 1:1: Display-prefs section — accent hues, background pickers,
 * grid toggle, font scale and width scale. Mirrors
 * `frontend/index.html:427-432` (hues 35/160/210/270/330/40),
 * `frontend/src/displayPrefs.js:10-17` (font/width steps) and
 * `frontend/src/ui/tokens.js:21-24` (picker defaults #212121/#ffffff).
 * Accent + bg overrides apply live through `ThemeProvider`. */
function DisplayPrefsSection() {
  const { colors, radius, typography, spacing } = useTheme();
  const t = useT();
  const [prefs, setLocalPrefs] = useState(() => displayPrefsStore.get());

  useEffect(() => displayPrefsStore.subscribe(setLocalPrefs), []);

  /* Frontend `index.html:427-432` hues → hex (computed from the exact
   * `hsl(H S% L%)` in `styles.css:894-899`):
   * 35 #e69019 Gold · 160 #22c38e Teal · 210 #1980e6 Blue ·
   * 270 #8c3cdd Purple · 330 #df2080 Rose · 40 #df9f20 Amber default. */
  const ACCENT_PRESETS: Array<{ hue: number; hex: string; name: string }> = [
    { hue: 35, hex: '#e69019', name: 'Gold' },
    { hue: 160, hex: '#22c38e', name: 'Teal' },
    { hue: 210, hex: '#1980e6', name: 'Blue' },
    { hue: 270, hex: '#8c3cdd', name: 'Purple' },
    { hue: 330, hex: '#df2080', name: 'Rose' },
    { hue: 40, hex: '#df9f20', name: 'Amber (default)' },
  ];

  const setAccent = (color: string | null) => displayPrefsStore.set({ accentColor: color });
  const setBgDark = (color: string | null) => displayPrefsStore.set({ bgDark: color });
  const setBgLight = (color: string | null) => displayPrefsStore.set({ bgLight: color });
  const setGrid = (value: boolean) => displayPrefsStore.set({ gridEnabled: value });
  const setFontScale = (value: number) => displayPrefsStore.set({ fontScale: value });
  const setWidthScale = (scale: number) => displayPrefsStore.set({ contentWidth: widthScaleToPx(scale) });
  const resetAll = () => displayPrefsStore.reset();

  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('displayPrefs.heading') || 'Display preferences'}
      </Text>

      <Text style={[styles.body, { color: colors.textMuted, marginTop: 6 }]}>
        {t('displayPrefs.accent') || 'Accent color'}
      </Text>
      <View style={[styles.swatchRow, { marginTop: 8 }]}>
        {ACCENT_PRESETS.map(({ hue, hex, name }) => {
          const active = prefs.accentColor === hex;
          return (
            <AnimatedPressable
              key={hue}
              accessibilityLabel={`Accent ${name} ${hex}`}
              onPress={() => setAccent(active ? null : hex)}
              style={[
                styles.swatch,
                {
                  backgroundColor: hex,
                  borderColor: active ? colors.text : 'transparent',
                  borderRadius: radius.pill,
                },
              ]}
            />
          );
        })}
        <AnimatedPressable
          accessibilityLabel="Reset accent"
          onPress={() => setAccent(null)}
          style={[
            styles.swatchReset,
            { borderColor: colors.border, borderRadius: radius.pill },
          ]}
        >
          <Ionicons name="refresh" size={14} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      <Text style={[styles.body, { color: colors.textMuted, marginTop: 14 }]}>
        {t('displayPrefs.bgDark') || 'Background (dark)'}
      </Text>
      <View style={[styles.swatchRow, { marginTop: 8 }]}>
        {['#212121', '#1a1a1a', '#0f1e2a', '#101318'].map((color) => {
          const active = prefs.bgDark === color;
          return (
            <AnimatedPressable
              key={color}
              accessibilityLabel={`Background ${color}`}
              onPress={() => setBgDark(active ? null : color)}
              style={[
                styles.swatch,
                {
                  backgroundColor: color,
                  borderColor: active ? colors.text : 'transparent',
                  borderRadius: radius.pill,
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={[styles.body, { color: colors.textMuted, marginTop: 14 }]}>
        {t('displayPrefs.bgLight') || 'Background (light)'}
      </Text>
      <View style={[styles.swatchRow, { marginTop: 8 }]}>
        {['#ffffff', '#f7f6f2', '#e6dec8', '#f0e9d4'].map((color) => {
          const active = prefs.bgLight === color;
          return (
            <AnimatedPressable
              key={color}
              accessibilityLabel={`Background ${color}`}
              onPress={() => setBgLight(active ? null : color)}
              style={[
                styles.swatch,
                {
                  backgroundColor: color,
                  borderColor: active ? colors.text : 'transparent',
                  borderRadius: radius.pill,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={[styles.row, styles.rowDivided, { borderTopColor: colors.border, marginTop: 14 }]}>
        <View style={styles.rowCopy}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t('displayPrefs.grid') || 'Grid background'}
          </Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            {t('displayPrefs.gridBody') || 'Subtle grid behind the home page'}
          </Text>
        </View>
        <ToggleTrack
          value={prefs.gridEnabled}
          onValueChange={setGrid}
        />
      </View>

      <Text style={[styles.title, { color: colors.text, marginTop: 14 }]}>
        {t('displayPrefs.fontSize') || 'Font size'} ({prefs.fontScale.toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0')})
      </Text>
      <View style={[styles.displaySegmentRow, { marginTop: 8 }]}>
        {(DISPLAY_FONT_STEPS as readonly number[]).map((value, index) => {
          const active = Math.abs(prefs.fontScale - value) < 0.001;
          return (
            <AnimatedPressable
              key={value}
              accessibilityLabel={`Font size ${FONT_LABELS[index]} ${Math.round(value * 100)}%`}
              onPress={() => setFontScale(value)}
              style={[
                styles.displaySegment,
                {
                  backgroundColor: active ? colors.surfaceHover : 'transparent',
                  borderColor: colors.border,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Text
                style={[
                  styles.displaySegmentText,
                  {
                    color: active ? colors.text : colors.textMuted,
                    fontFamily: active ? typography.semibold : typography.medium,
                  },
                ]}
              >
                {FONT_LABELS[index]} · {Math.round(value * 100)}%
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <Text style={[styles.title, { color: colors.text, marginTop: 14 }]}>
        {t('displayPrefs.contentWidth') || 'Content width'} ({pxToWidthScale(prefs.contentWidth)}× · {prefs.contentWidth}px)
      </Text>
      <View style={[styles.displaySegmentRow, { marginTop: 8 }]}>
        {(DISPLAY_WIDTH_STEPS as readonly number[]).map((scale, index) => {
          const px = widthScaleToPx(scale);
          const active = prefs.contentWidth === px;
          return (
            <AnimatedPressable
              key={scale}
              accessibilityLabel={`Content width ${WIDTH_LABELS[index]} ${px}px`}
              onPress={() => setWidthScale(scale)}
              style={[
                styles.displaySegment,
                {
                  backgroundColor: active ? colors.surfaceHover : 'transparent',
                  borderColor: colors.border,
                  borderRadius: radius.md,
                },
              ]}
            >
              <Text
                style={[
                  styles.displaySegmentText,
                  {
                    color: active ? colors.text : colors.textMuted,
                    fontFamily: active ? typography.semibold : typography.medium,
                  },
                ]}
              >
                {WIDTH_LABELS[index]} · {px}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <AnimatedPressable
        accessibilityLabel={t('displayPrefs.reset') || 'Reset display preferences'}
        onPress={resetAll}
        style={[
          styles.resetBtn,
          { backgroundColor: colors.surfaceHover, borderRadius: radius.md, marginTop: 14 },
        ]}
      >
        <Ionicons name="refresh" size={16} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 13, marginLeft: 6 }}>
          {t('displayPrefs.reset') || 'Reset to defaults'}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
