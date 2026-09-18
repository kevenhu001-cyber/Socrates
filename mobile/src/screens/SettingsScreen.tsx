import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { toast } from '../components/Toast';
import { apiKeysApi, type ApiProvider } from '../data/api/client';
import { TONE_PRESETS, type TonePreset } from '../data/chat/tonePresets';
import { useTheme } from '../theme/ThemeProvider';
import { motionEasing, withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore, useAppStore } from '../stores/appStore';

type ProviderDraft = {
  id: string;
  label: string;
  url: string;
  key: string;
  keyHint?: string | null;
  model: string;
  vision: boolean;
  isNew: boolean;
};

type ApiSettings = {
  externalApiOn: boolean;
  activeId: string;
  providers: ProviderDraft[];
  tone: TonePreset;
};

const TONES = Object.keys(TONE_PRESETS) as TonePreset[];

function fromProviders(providers: ApiProvider[], selectedModel: string, tone: TonePreset): ApiSettings {
  const custom = providers
    .filter((provider) => !provider.isBuiltIn && provider.id !== 'beagle-built-in')
    .map((provider) => ({
      id: provider.id,
      label: provider.label || '',
      url: provider.url || '',
      key: '',
      keyHint: provider.keyHint,
      model: provider.model || '',
      vision: provider.isMultimodal === true,
      isNew: false,
    }));
  const externalApiOn = Boolean(selectedModel && selectedModel !== 'beagle-built-in');
  return {
    externalApiOn,
    activeId: externalApiOn ? selectedModel : 'beagle-built-in',
    providers: custom,
    tone,
  };
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  const translate = useRef(new Animated.Value(value ? 16 : 0)).current;
  useEffect(() => {
    Animated.timing(translate, { toValue: value ? 16 : 0, duration: 150, easing: motionEasing.out, useNativeDriver: true }).start();
  }, [translate, value]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.toggle,
        {
          backgroundColor: value ? colors.accent : withAlpha(colors.surfaceRaised, 0.6),
          borderColor: value ? colors.accent : withAlpha(colors.border, 0.5),
        },
      ]}
    >
      <Animated.View style={[styles.knob, { backgroundColor: colors.white, transform: [{ translateX: translate }] }]} />
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { colors, typography, mode } = useTheme();
  const isDark = mode === 'dark';
  const t = useT();
  const appState = useAppStore();
  const [settings, setSettings] = useState<ApiSettings>(() => fromProviders(appState.providers, appState.selectedModel, appState.tone));
  const [saving, setSaving] = useState(false);
  const initialIds = useRef(
    appState.providers
      .filter((provider) => !provider.isBuiltIn && provider.id !== 'beagle-built-in')
      .map((provider) => provider.id),
  );

  useEffect(() => {
    setSettings(fromProviders(appState.providers, appState.selectedModel, appState.tone));
    initialIds.current = appState.providers
      .filter((provider) => !provider.isBuiltIn && provider.id !== 'beagle-built-in')
      .map((provider) => provider.id);
  }, []);

  const updateProvider = (id: string, patch: Partial<ProviderDraft>) => setSettings((current) => ({
    ...current,
    providers: current.providers.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));

  const setExternalApi = (externalApiOn: boolean) => {
    setSettings((current) => {
      const firstCustom = current.providers[0]?.id || '';
      return {
        ...current,
        externalApiOn,
        activeId: externalApiOn
          ? (current.activeId && current.activeId !== 'beagle-built-in' ? current.activeId : firstCustom)
          : 'beagle-built-in',
      };
    });
  };

  const addProvider = () => {
    const id = `new-${Date.now().toString(36)}`;
    setSettings((current) => ({
      ...current,
      externalApiOn: true,
      activeId: id,
      providers: [
        ...current.providers,
        { id, label: '', url: '', key: '', model: '', vision: false, isNew: true },
      ],
    }));
  };

  const removeProvider = (id: string) => setSettings((current) => {
    const providers = current.providers.filter((item) => item.id !== id);
    const activeId = current.activeId === id ? (providers[0]?.id || 'beagle-built-in') : current.activeId;
    return {
      ...current,
      providers,
      activeId,
      externalApiOn: providers.length > 0 && activeId !== 'beagle-built-in',
    };
  });

  const validate = () => {
    for (const provider of settings.providers) {
      if (!provider.url.trim() || !provider.model.trim()) {
        return t('settings.providerRequired') === 'settings.providerRequired'
          ? 'Provider URL and model are required.'
          : t('settings.providerRequired');
      }
      try {
        const url = new URL(provider.url.trim());
        if (url.protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        return t('settings.providerUrlInvalid') === 'settings.providerUrlInvalid'
          ? 'Provider URL must be a valid public HTTPS URL.'
          : t('settings.providerUrlInvalid');
      }
      if (provider.isNew && provider.key.trim().length < 8) {
        return t('settings.providerKeyRequired') === 'settings.providerKeyRequired'
          ? 'A new provider requires an API key of at least 8 characters.'
          : t('settings.providerKeyRequired');
      }
      if (!provider.isNew && provider.key && provider.key.trim().length < 8) {
        return t('settings.providerKeyInvalid') === 'settings.providerKeyInvalid'
          ? 'API key is too short.'
          : t('settings.providerKeyInvalid');
      }
    }
    return '';
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) {
      toast.show(validationError, 'error');
      return;
    }

    setSaving(true);
    try {
      const currentIds = new Set(settings.providers.filter((provider) => !provider.isNew).map((provider) => provider.id));
      const removed = initialIds.current.filter((id) => !currentIds.has(id));
      await Promise.all(removed.map((id) => apiKeysApi.remove(id)));

      const idMap = new Map<string, string>();
      for (const provider of settings.providers) {
        if (provider.isNew) {
          const created = await apiKeysApi.create({
            label: provider.label.trim() || 'Default',
            url: provider.url.trim(),
            model: provider.model.trim(),
            key: provider.key.trim(),
            isMultimodal: provider.vision,
          });
          idMap.set(provider.id, created.id);
        } else {
          await apiKeysApi.patch(provider.id, {
            label: provider.label.trim() || 'Default',
            url: provider.url.trim(),
            model: provider.model.trim(),
            isMultimodal: provider.vision,
            ...(provider.key.trim() ? { key: provider.key.trim() } : {}),
          });
        }
      }

      await appStore.setTone(settings.tone);
      await appStore.refreshProviders();

      const desired = settings.externalApiOn
        ? (idMap.get(settings.activeId) || settings.activeId)
        : 'beagle-built-in';
      if (desired && appStore.getSnapshot().providers.some((provider) => provider.id === desired)) {
        await appStore.setSelectedModel(desired);
      }

      toast.show(t('settings.saved') || 'Settings saved', 'success');
      navigation.goBack();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : (t('settings.saveFailed') || 'Unable to save settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await Promise.all(initialIds.current.map((id) => apiKeysApi.remove(id).catch(() => undefined)));
      await appStore.setTone('default');
      await appStore.refreshProviders();
      if (appStore.getSnapshot().providers.some((provider) => provider.id === 'beagle-built-in')) {
        await appStore.setSelectedModel('beagle-built-in');
      }
      const next = fromProviders(appStore.getSnapshot().providers, appStore.getSnapshot().selectedModel, 'default');
      setSettings(next);
      initialIds.current = [];
      toast.show(t('settings.cleared') || 'Settings cleared', 'info');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : (t('settings.saveFailed') || 'Unable to clear settings.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const builtIn = appState.providers.find((provider) => provider.isBuiltIn || provider.id === 'beagle-built-in');

  return (
    <View style={[styles.overlay, { backgroundColor: colors.scrimModal }]}>
      <Pressable accessibilityLabel={t('common.close')} onPress={navigation.goBack} style={StyleSheet.absoluteFill} />
      <View style={[styles.modal, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.borderStrong, 0.35) }]}>
        <View style={[styles.header, { borderBottomColor: withAlpha(colors.borderStrong, 0.12) }]}>
          <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('settings.title')}</Text>
          <AnimatedPressable accessibilityLabel={t('common.close')} onPress={navigation.goBack} style={styles.close}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!isDark ? (
            <View style={styles.hero}>
              <Text style={[styles.heroTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                Application configuration
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textMuted, fontFamily: typography.body }]}>
                Manage model routing, tone, and runtime behavior.
              </Text>
            </View>
          ) : null}

          <View style={[styles.section, isDark && { borderTopColor: withAlpha(colors.border, 0.5), borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>Connection</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                Choose whether Socrates may use your own API credentials.
              </Text>
            </View>
            <Pressable style={[styles.toggleCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setExternalApi(!settings.externalApiOn)}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.useExternalApi')}</Text>
              <Toggle value={settings.externalApiOn} onChange={setExternalApi} />
            </Pressable>
          </View>

          <View style={[styles.section, isDark && { borderTopColor: withAlpha(colors.border, 0.5), borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>Model providers</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                Add a provider or choose the active model.
              </Text>
            </View>

            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: colors.textMuted }]}>{t('settings.models')}</Text>
              <AnimatedPressable onPress={addProvider} style={[styles.miniButton, { borderColor: withAlpha(colors.borderStrong, 0.5) }]}>
                <Text style={[styles.miniButtonText, { color: colors.text }]}>+ {t('settings.addProvider')}</Text>
              </AnimatedPressable>
            </View>
            <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('settings.providerHint')}</Text>

            {builtIn ? (
              <View
                style={[
                  styles.provider,
                  {
                    borderColor: !settings.externalApiOn ? withAlpha(colors.accent, 0.45) : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <AnimatedPressable onPress={() => setExternalApi(false)} style={styles.radioButton}>
                  <Text style={[styles.radio, { color: !settings.externalApiOn ? colors.accent : colors.textSubtle }]}>
                    {!settings.externalApiOn ? '●' : '○'}
                  </Text>
                </AnimatedPressable>
                <View style={styles.providerFields}>
                  <View style={styles.builtinRow}>
                    <Text style={[styles.builtinLabel, { color: colors.text, fontFamily: typography.semibold }]}>
                      {builtIn.label || 'Beagle'}
                    </Text>
                    <View style={[styles.builtinPill, { backgroundColor: withAlpha(colors.accent, 0.12), borderColor: withAlpha(colors.accent, 0.4) }]}>
                      <Text style={[styles.builtinPillText, { color: colors.accent }]}>{t('settings.builtIn') === 'settings.builtIn' ? 'Built-in' : t('settings.builtIn')}</Text>
                    </View>
                  </View>
                  <Text style={[styles.hint, { color: colors.textSubtle }]}>
                    {builtIn.model || (t('settings.builtInHint') || 'Built-in AI')}
                  </Text>
                </View>
              </View>
            ) : null}

            {settings.externalApiOn && settings.providers.map((provider) => (
              <View
                key={provider.id}
                style={[
                  styles.provider,
                  {
                    borderColor: settings.externalApiOn && settings.activeId === provider.id
                      ? withAlpha(colors.accent, 0.45)
                      : colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
              >
                <AnimatedPressable
                  onPress={() => setSettings((current) => ({ ...current, externalApiOn: true, activeId: provider.id }))}
                  style={styles.radioButton}
                >
                  <Text style={[styles.radio, { color: settings.externalApiOn && settings.activeId === provider.id ? colors.accent : colors.textSubtle }]}>
                    {settings.externalApiOn && settings.activeId === provider.id ? '●' : '○'}
                  </Text>
                </AnimatedPressable>
                <View style={styles.providerFields}>
                  <ProviderInput value={provider.label} placeholder={t('provider.placeholderLabel')} onChangeText={(label) => updateProvider(provider.id, { label })} />
                  <ProviderInput value={provider.url} placeholder={t('provider.placeholderUrl')} onChangeText={(url) => updateProvider(provider.id, { url })} />
                  <ProviderInput
                    value={provider.key}
                    placeholder={provider.isNew ? 'sk-…' : (provider.keyHint ? `${provider.keyHint}••••••••` : 'Leave blank to keep saved key')}
                    secureTextEntry
                    onChangeText={(key) => updateProvider(provider.id, { key })}
                  />
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
            ))}
            {settings.externalApiOn && settings.providers.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Text style={[styles.empty, { color: colors.textMuted }]}>{t('settings.noCustomProviders')}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.section, isDark && { borderTopColor: withAlpha(colors.border, 0.5), borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 }]}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>Assistant tone</Text>
              <Text style={[styles.sectionDesc, { color: colors.textMuted, fontFamily: typography.body }]}>
                Choose how Socrates speaks during a session.
              </Text>
            </View>
            <View style={styles.toneGrid}>
              {TONES.map((tone) => {
                const selected = settings.tone === tone;
                const spec = TONE_PRESETS[tone];
                return (
                  <AnimatedPressable
                    key={tone}
                    onPress={() => setSettings((current) => ({ ...current, tone }))}
                    style={[
                      styles.tone,
                      {
                        borderColor: selected ? withAlpha(colors.accent, 0.45) : colors.border,
                        backgroundColor: selected ? withAlpha(colors.accent, 0.08) : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.toneTitle, { color: selected ? colors.text : colors.textSecondary, fontFamily: typography.semibold }]}>
                      {t(`settings.tone.${tone}`) === `settings.tone.${tone}` ? spec.label : t(`settings.tone.${tone}`)}
                    </Text>
                    <Text style={[styles.toneDescription, { color: colors.textMuted, fontFamily: typography.body }]}>
                      {t(`settings.tone.${tone}Desc`) === `settings.tone.${tone}Desc` ? spec.description : t(`settings.tone.${tone}Desc`)}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <View style={styles.actions}>
            <AnimatedPressable disabled={saving} onPress={() => { void clear(); }} style={styles.actionButton}>
              <Text style={[styles.actionText, { color: colors.danger }]}>{t('settings.clearAll')}</Text>
            </AnimatedPressable>
            <View style={styles.actionSpacer} />
            <AnimatedPressable disabled={saving} onPress={navigation.goBack} style={[styles.actionButton, { backgroundColor: colors.surfaceHover }]}>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('common.cancel')}</Text>
            </AnimatedPressable>
            <AnimatedPressable disabled={saving} onPress={() => { void save(); }} style={[styles.actionButton, { backgroundColor: colors.accent }]}>
              <Text style={[styles.actionText, { color: colors.textInverse }]}>
                {saving ? (t('app.loading') || 'Saving…') : t('settings.save')}
              </Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function ProviderInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, typography } = useTheme();
  return (
    <TextInput
      {...props}
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={colors.textSubtle}
      style={[
        styles.input,
        {
          color: colors.text,
          backgroundColor: colors.background,
          borderColor: colors.border,
          fontFamily: typography.mono,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  modal: { width: '100%', maxWidth: 440, maxHeight: '85%', borderWidth: 0.5, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 8 }, elevation: 18 },
  header: { paddingLeft: 20, paddingRight: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 0.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 16 },
  close: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 22 },
  hero: { gap: 4 },
  heroTitle: { fontSize: 20, lineHeight: 26 },
  heroSubtitle: { fontSize: 12, lineHeight: 18 },
  section: { gap: 8 },
  sectionHead: { gap: 3, marginBottom: 3 },
  sectionTitle: { fontSize: 14 },
  sectionDesc: { fontSize: 11, lineHeight: 16 },
  toggleCard: { minHeight: 48, paddingHorizontal: 12, borderWidth: 0.5, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  toggle: { width: 36, height: 20, borderRadius: 10, borderWidth: 0.5, justifyContent: 'center', paddingHorizontal: 2 },
  knob: { width: 16, height: 16, borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.48 },
  hint: { fontSize: 11, lineHeight: 15.4 },
  miniButton: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  miniButtonText: { fontSize: 12, fontWeight: '600' },
  provider: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, padding: 10, borderWidth: 0.5, borderRadius: 10 },
  radioButton: { paddingTop: 4 },
  radio: { fontSize: 16, lineHeight: 20 },
  providerFields: { flex: 1, gap: 7 },
  builtinLabel: { fontSize: 13 },
  builtinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  builtinPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  builtinPillText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  input: { width: '100%', minHeight: 40, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14 },
  visionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 28 },
  visionText: { fontSize: 11 },
  remove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { minHeight: 70, marginTop: 4, borderWidth: 0.5, borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  empty: { textAlign: 'center', fontSize: 13, lineHeight: 19 },
  toneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  tone: { width: '48.8%', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 0.5, gap: 3 },
  toneTitle: { fontSize: 13, fontWeight: '600' },
  toneDescription: { fontSize: 10.5, lineHeight: 14 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionSpacer: { flex: 1 },
  actionButton: { minHeight: 34, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '500' },
});
