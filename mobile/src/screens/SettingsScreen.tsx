import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { toast } from '../components/Toast';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { getItem, setItem, deleteItem } from '../platform/secureStorage';

type Tone = 'default' | 'friendly' | 'efficient' | 'professional' | 'candid';
type Provider = { id: string; label: string; url: string; key: string; model: string; vision: boolean };
type ApiSettings = { externalApiOn: boolean; activeId: string; providers: Provider[]; tone: Tone };

const STORAGE_KEY = 'socrates.mobile.api-settings';
const DEFAULT_SETTINGS: ApiSettings = { externalApiOn: false, activeId: '', providers: [], tone: 'default' };
const TONES: Tone[] = ['default', 'friendly', 'efficient', 'professional', 'candid'];

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  const translate = useRef(new Animated.Value(value ? 16 : 0)).current;
  useEffect(() => {
    Animated.timing(translate, { toValue: value ? 16 : 0, duration: 150, useNativeDriver: true }).start();
  }, [translate, value]);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)}
      style={[styles.toggle, { backgroundColor: value ? colors.accent : withAlpha(colors.surfaceRaised, 0.6), borderColor: value ? colors.accent : withAlpha(colors.border, 0.5) }]}
    >
      <Animated.View style={[styles.knob, { backgroundColor: colors.white, transform: [{ translateX: translate }] }]} />
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [settings, setSettings] = useState<ApiSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let mounted = true;
    void getItem(STORAGE_KEY).then((stored) => {
      if (!mounted || !stored) return;
      try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) as ApiSettings }); } catch { /* ignore corrupt local settings */ }
    });
    return () => { mounted = false; };
  }, []);

  const updateProvider = (id: string, patch: Partial<Provider>) => setSettings((current) => ({
    ...current,
    providers: current.providers.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));
  const addProvider = () => {
    const id = `provider-${Date.now().toString(36)}`;
    setSettings((current) => ({
      ...current, externalApiOn: true, activeId: id,
      providers: [...current.providers, { id, label: '', url: '', key: '', model: '', vision: false }],
    }));
  };
  const removeProvider = (id: string) => setSettings((current) => ({
    ...current,
    activeId: current.activeId === id ? '' : current.activeId,
    providers: current.providers.filter((item) => item.id !== id),
  }));
  const save = async () => {
    await setItem(STORAGE_KEY, JSON.stringify(settings));
    toast.show(t('settings.saved'), 'success');
    navigation.goBack();
  };
  const clear = async () => {
    setSettings(DEFAULT_SETTINGS);
    await deleteItem(STORAGE_KEY);
    toast.show(t('settings.cleared'), 'info');
  };

  return (
    <View style={[styles.overlay, { backgroundColor: colors.scrim }]}>
      <Pressable accessibilityLabel={t('common.close')} onPress={navigation.goBack} style={StyleSheet.absoluteFill} />
      <View style={[styles.modal, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.borderStrong, 0.35) }]}>
        <View style={[styles.header, { borderBottomColor: withAlpha(colors.borderStrong, 0.12) }]}>
          <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('settings.title')}</Text>
          <AnimatedPressable accessibilityLabel={t('common.close')} onPress={navigation.goBack} style={styles.close}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.toggleRow} onPress={() => setSettings((current) => ({ ...current, externalApiOn: !current.externalApiOn }))}>
            <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.useExternalApi')}</Text>
            <Toggle value={settings.externalApiOn} onChange={(externalApiOn) => setSettings((current) => ({ ...current, externalApiOn }))} />
          </Pressable>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.models')}</Text>
              <AnimatedPressable onPress={addProvider} style={[styles.miniButton, { backgroundColor: colors.surfaceHover }]}>
                <Text style={[styles.miniButtonText, { color: colors.text }]}>{t('settings.addProvider')}</Text>
              </AnimatedPressable>
            </View>
            <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('settings.providerHint')}</Text>

            {settings.externalApiOn ? settings.providers.map((provider) => (
              <View key={provider.id} style={[styles.provider, { borderColor: settings.activeId === provider.id ? withAlpha(colors.accent, 0.45) : colors.border }]}>
                <AnimatedPressable onPress={() => setSettings((current) => ({ ...current, activeId: provider.id }))} style={styles.radioButton}>
                  <Text style={[styles.radio, { color: settings.activeId === provider.id ? colors.accent : colors.textSubtle }]}>{settings.activeId === provider.id ? '●' : '○'}</Text>
                </AnimatedPressable>
                <View style={styles.providerFields}>
                  <ProviderInput value={provider.label} placeholder={t('provider.placeholderLabel')} onChangeText={(label) => updateProvider(provider.id, { label })} />
                  <ProviderInput value={provider.url} placeholder={t('provider.placeholderUrl')} onChangeText={(url) => updateProvider(provider.id, { url })} />
                  <ProviderInput value={provider.key} placeholder="sk-…" secureTextEntry onChangeText={(key) => updateProvider(provider.id, { key })} />
                  <ProviderInput value={provider.model} placeholder={t('provider.placeholderModel')} onChangeText={(model) => updateProvider(provider.id, { model })} />
                  <Pressable style={styles.visionRow} onPress={() => updateProvider(provider.id, { vision: !provider.vision })}>
                    <Ionicons name={provider.vision ? 'checkbox' : 'square-outline'} size={18} color={provider.vision ? colors.accent : colors.textMuted} />
                    <Text style={[styles.visionText, { color: colors.textMuted }]}>{t('provider.multimodal')}</Text>
                  </Pressable>
                </View>
                <AnimatedPressable accessibilityLabel={t('common.delete')} onPress={() => removeProvider(provider.id)} style={styles.remove}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            )) : null}
            {settings.externalApiOn && settings.providers.length === 0 ? <View style={[styles.emptyBox, { borderColor: colors.border }]}><Text style={[styles.empty, { color: colors.textMuted }]}>{t('settings.noCustomProviders')}</Text></View> : null}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.tone')}</Text>
            <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('settings.toneHint')}</Text>
            <View style={styles.toneGrid}>
              {TONES.map((tone) => {
                const selected = settings.tone === tone;
                return (
                  <AnimatedPressable key={tone} onPress={() => setSettings((current) => ({ ...current, tone }))}
                    style={[styles.tone, { borderColor: selected ? withAlpha(colors.accent, 0.45) : colors.border, backgroundColor: selected ? withAlpha(colors.accent, 0.08) : 'transparent' }]}
                  >
                    <Text style={[styles.toneTitle, { color: selected ? colors.text : colors.textSecondary }]}>{t(`settings.tone.${tone}`)}</Text>
                    <Text style={[styles.toneDescription, { color: colors.textMuted }]}>{t(`settings.tone.${tone}Desc`)}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <View style={styles.actions}>
            <AnimatedPressable onPress={() => { void clear(); }} style={styles.actionButton}><Text style={[styles.actionText, { color: colors.danger }]}>{t('settings.clearAll')}</Text></AnimatedPressable>
            <View style={styles.actionSpacer} />
            <AnimatedPressable onPress={navigation.goBack} style={[styles.actionButton, { backgroundColor: colors.surfaceHover }]}><Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text></AnimatedPressable>
            <AnimatedPressable onPress={() => { void save(); }} style={[styles.actionButton, { backgroundColor: colors.accent }]}><Text style={[styles.actionText, { color: colors.textInverse }]}>{t('settings.save')}</Text></AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function ProviderInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, typography } = useTheme();
  return <TextInput {...props} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textSubtle} style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, fontFamily: typography.mono }]} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  modal: { width: '100%', maxWidth: 440, maxHeight: '85%', borderWidth: 0.5, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  header: { paddingLeft: 20, paddingRight: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 16 }, close: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { width: 36, height: 20, borderRadius: 10, borderWidth: 0.5, justifyContent: 'center', paddingHorizontal: 2 },
  knob: { width: 16, height: 16, borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  field: { gap: 6 }, labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.48 },
  hint: { fontSize: 11, lineHeight: 15.4 },
  miniButton: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 }, miniButtonText: { fontSize: 12, fontWeight: '600' },
  provider: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, padding: 10, borderWidth: 0.5, borderRadius: 10 },
  radioButton: { paddingTop: 4 }, radio: { fontSize: 16, lineHeight: 20 }, providerFields: { flex: 1, gap: 7 },
  input: { width: '100%', minHeight: 40, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14 },
  visionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 28 }, visionText: { fontSize: 11 }, remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { minHeight: 70, marginTop: 4, borderWidth: 0.5, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  empty: { textAlign: 'center', fontSize: 13, lineHeight: 19 },
  toneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }, tone: { width: '48.8%', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, gap: 3 },
  toneTitle: { fontSize: 13, fontWeight: '600' }, toneDescription: { fontSize: 10.5, lineHeight: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, actionSpacer: { flex: 1 }, actionButton: { minHeight: 34, paddingHorizontal: 18, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 13, fontWeight: '500' },
});
