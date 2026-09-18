import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  DISPLAY_FONT_STEPS,
  DISPLAY_WIDTH_STEPS,
  FONT_LABELS,
  WIDTH_LABELS,
  displayPrefsStore,
  widthScaleToPx,
} from '../displayPrefs/displayPrefsStore';
import { useTheme, useThemeController, type ThemePreference } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Display'>;

function Segments<T extends string | number>({
  values,
  labels,
  value,
  onChange,
}: {
  values: readonly T[];
  labels: readonly string[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, radius, typography } = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm }]}>
      {values.map((item, index) => {
        const selected = item === value;
        return (
          <AnimatedPressable
            key={String(item)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item)}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? colors.surfaceHover : 'transparent',
                borderRadius: Math.max(4, radius.sm - 2),
              },
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: selected ? colors.text : colors.textMuted,
                  fontFamily: selected ? typography.semibold : typography.body,
                },
              ]}
            >
              {labels[index]}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export function DisplaySettingsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const { preference, setPreference } = useThemeController();
  const t = useT();
  const [prefs, setPrefs] = useState(displayPrefsStore.get());
  const [darkDraft, setDarkDraft] = useState(prefs.bgDark || '#000000');
  const [lightDraft, setLightDraft] = useState(prefs.bgLight || '#ffffff');

  useEffect(() => displayPrefsStore.subscribe((next) => {
    setPrefs(next);
    setDarkDraft(next.bgDark || '#000000');
    setLightDraft(next.bgLight || '#ffffff');
  }), []);

  const themeOptions: ThemePreference[] = ['system', 'light', 'dark'];
  const themeLabels = [
    t('display.themeSystem') === 'display.themeSystem' ? 'System' : t('display.themeSystem'),
    t('display.themeLight') === 'display.themeLight' ? 'Light' : t('display.themeLight'),
    t('display.themeDark') === 'display.themeDark' ? 'Dark' : t('display.themeDark'),
  ];

  const commitHex = (kind: 'bgDark' | 'bgLight', raw: string) => {
    const value = raw.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return;
    displayPrefsStore.set({ [kind]: value.toLowerCase() });
  };

  return (
    <View style={[styles.overlay, { backgroundColor: colors.scrimModal }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={navigation.goBack} accessibilityLabel={t('common.close') || 'Close'} />
      {/* Bottom-sheet presentation — matches the web display popover
       * anchored to the bottom of the phone viewport. */}
      <View style={[styles.popover, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>
            {t('sidebar.more.display') === 'sidebar.more.display' ? 'Display & theme' : t('sidebar.more.display')}
          </Text>
          <AnimatedPressable onPress={navigation.goBack} style={styles.close}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>
                {t('display.theme') === 'display.theme' ? 'Theme' : t('display.theme')}
              </Text>
              <Text style={[styles.value, { color: colors.textSubtle, fontFamily: typography.mono }]}>
                {preference[0].toUpperCase() + preference.slice(1)}
              </Text>
            </View>
            <Segments
              values={themeOptions}
              labels={themeLabels}
              value={preference}
              onChange={(next) => { void setPreference(next); }}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>Text size</Text>
              <Text style={[styles.value, { color: colors.textSubtle, fontFamily: typography.mono }]}>
                {FONT_LABELS[Math.max(0, DISPLAY_FONT_STEPS.indexOf(prefs.fontScale as never))] || 'M'}
              </Text>
            </View>
            <Segments
              values={DISPLAY_FONT_STEPS}
              labels={FONT_LABELS}
              value={prefs.fontScale as (typeof DISPLAY_FONT_STEPS)[number]}
              onChange={(fontScale) => displayPrefsStore.set({ fontScale })}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>Content width</Text>
              <Text style={[styles.value, { color: colors.textSubtle, fontFamily: typography.mono }]}>
                {WIDTH_LABELS[
                  Math.max(
                    0,
                    DISPLAY_WIDTH_STEPS.findIndex((step) => widthScaleToPx(step) === prefs.contentWidth),
                  )
                ] || 'M'}
              </Text>
            </View>
            <Segments
              values={DISPLAY_WIDTH_STEPS}
              labels={WIDTH_LABELS}
              value={(DISPLAY_WIDTH_STEPS.find((step) => widthScaleToPx(step) === prefs.contentWidth) || 1) as (typeof DISPLAY_WIDTH_STEPS)[number]}
              onChange={(scale) => displayPrefsStore.set({ contentWidth: widthScaleToPx(scale) })}
            />
          </View>

          <Pressable
            onPress={() => displayPrefsStore.set({ gridEnabled: !prefs.gridEnabled })}
            style={styles.toggleRow}
          >
            <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>Background grid</Text>
            <View
              style={[
                styles.toggle,
                {
                  backgroundColor: prefs.gridEnabled ? withAlpha(colors.accent, 0.35) : colors.surface,
                  borderColor: prefs.gridEnabled ? colors.accent : colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.knob,
                  {
                    backgroundColor: prefs.gridEnabled ? colors.accent : colors.white,
                    transform: [{ translateX: prefs.gridEnabled ? 16 : 0 }],
                  },
                ]}
              />
            </View>
          </Pressable>

          <ColorRow
            label="Dark mode BG"
            value={darkDraft}
            defaultValue="#000000"
            onChange={setDarkDraft}
            onCommit={() => commitHex('bgDark', darkDraft)}
            onReset={() => displayPrefsStore.set({ bgDark: null })}
          />
          <ColorRow
            label="Light mode BG"
            value={lightDraft}
            defaultValue="#ffffff"
            onChange={setLightDraft}
            onCommit={() => commitHex('bgLight', lightDraft)}
            onReset={() => displayPrefsStore.set({ bgLight: null })}
          />

          <AnimatedPressable
            onPress={() => {
              displayPrefsStore.reset();
              void setPreference('dark');
            }}
            style={[styles.resetAll, { borderColor: colors.border, borderRadius: radius.sm }]}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: typography.medium }}>
              {t('common.reset') === 'common.reset' ? 'Reset display settings' : t('common.reset')}
            </Text>
          </AnimatedPressable>
        </ScrollView>
      </View>
    </View>
  );
}

function ColorRow({
  label,
  value,
  defaultValue,
  onChange,
  onCommit,
  onReset,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const { colors, radius, typography } = useTheme();
  const valid = /^#[0-9a-fA-F]{6}$/.test(value.trim());
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted, fontFamily: typography.medium }]}>{label}</Text>
        <View style={[styles.swatch, { backgroundColor: valid ? value : defaultValue, borderColor: colors.border }]} />
      </View>
      <View style={styles.colorControls}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onBlur={onCommit}
          onSubmitEditing={onCommit}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          placeholder={defaultValue}
          placeholderTextColor={colors.textSubtle}
          style={[
            styles.hexInput,
            {
              color: valid ? colors.text : colors.danger,
              backgroundColor: colors.surface,
              borderColor: valid ? colors.border : colors.danger,
              borderRadius: radius.sm,
              fontFamily: typography.mono,
            },
          ]}
        />
        <AnimatedPressable
          onPress={onReset}
          accessibilityLabel={`Reset ${label}`}
          style={[styles.resetButton, { backgroundColor: colors.surface }]}
        >
          <Text style={{ color: colors.textMuted, fontSize: 18 }}>↺</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  popover: { width: '100%', maxWidth: 560, maxHeight: '86%', borderWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', elevation: 18, shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 26, shadowOffset: { width: 0, height: -10 } },
  header: { minHeight: 50, paddingLeft: 16, paddingRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15 },
  close: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 14, paddingBottom: 16, gap: 2 },
  row: { paddingVertical: 12, gap: 8 },
  labelRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  value: { fontSize: 10.5 },
  segments: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, padding: 2, flexDirection: 'row' },
  segment: { flex: 1, minHeight: 29, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentText: { fontSize: 11.5 },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggle: { width: 36, height: 20, paddingHorizontal: 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, justifyContent: 'center' },
  knob: { width: 16, height: 16, borderRadius: 8 },
  colorControls: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 18, height: 18, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  hexInput: { flex: 1, minHeight: 36, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, fontSize: 12 },
  resetButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resetAll: { minHeight: 40, marginTop: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
