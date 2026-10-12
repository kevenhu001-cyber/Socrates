import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { creationsApi, filesApi, type CreationAssistantRecord, type CreationImageRecord } from '../data/api/client';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { withAlpha } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Creations'>;
type CreationTab = 'images' | 'assistants';
type AssistantDraft = { id?: string; title: string; description: string; instructions: string; starter: string };
type CreationListItem = CreationImageRecord | CreationAssistantRecord;
type ImageLoadState = 'loading' | 'loaded' | 'error';

function assistantConfig(source: string) {
  try {
    const value = JSON.parse(source) as Record<string, unknown>;
    return {
      description: typeof value.description === 'string' ? value.description : '',
      instructions: typeof value.instructions === 'string' ? value.instructions : '',
      starter: typeof value.starter === 'string' ? value.starter : '',
    };
  } catch {
    return { description: '', instructions: '', starter: '' };
  }
}

export function CreationsScreen({ navigation }: Props) {
  const { colors, radius, spacing, typography } = useTheme();
  const t = useT();
  const [tab, setTab] = useState<CreationTab>('images');
  const [images, setImages] = useState<CreationImageRecord[]>([]);
  const [assistants, setAssistants] = useState<CreationAssistantRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Record<CreationTab, boolean>>({ images: false, assistants: false });
  const [imageLoadStates, setImageLoadStates] = useState<Record<string, ImageLoadState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraft | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    void filesApi.authHeaders().then((headers) => { if (active) setAuthHeaders(headers); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'images') {
        const result = await creationsApi.listImages();
        setImages(Array.isArray(result.images) ? result.images : []);
        setLoadedTabs((current) => ({ ...current, images: true }));
      } else {
        const result = await creationsApi.listAssistants();
        setAssistants(Array.isArray(result.items) ? result.items : []);
        setLoadedTabs((current) => ({ ...current, assistants: true }));
      }
    } catch {
      setError(t('creations.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => { void load(); }, [load]);

  const visibleImages = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return images.filter((image) => !value || image.name.toLocaleLowerCase().includes(value));
  }, [images, query]);
  const visibleAssistants = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return assistants.filter((assistant) => {
      const config = assistantConfig(assistant.source || '{}');
      return !value || assistant.title.toLocaleLowerCase().includes(value) || config.description.toLocaleLowerCase().includes(value);
    });
  }, [assistants, query]);
  const visibleRecords: CreationListItem[] = tab === 'images' ? visibleImages : visibleAssistants;
  const updateImageLoadState = useCallback((id: string, state: ImageLoadState) => {
    setImageLoadStates((current) => current[id] === state ? current : { ...current, [id]: state });
  }, []);

  const submitImage = async () => {
    if (busy || !imagePrompt.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (editImageId) await creationsApi.editImage(editImageId, imagePrompt.trim(), imageModel.trim() || undefined);
      else await creationsApi.createImage(imagePrompt.trim(), imageModel.trim() || undefined);
      setImagePrompt('');
      setEditImageId(null);
      setNotice(t('creations.imageCreated'));
      await load();
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      setError(code === 'IMAGE_PROVIDER_NOT_CONFIGURED' ? t('creations.imageUnavailable') : (cause instanceof Error ? cause.message : t('creations.loadFailed')));
    } finally {
      setBusy(false);
    }
  };

  const saveAssistant = async () => {
    const draft = assistantDraft;
    if (!draft || busy) return;
    if (!draft.title.trim() || !draft.instructions.trim()) {
      setError(t('creations.validation'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        title: draft.title.trim(),
        source: JSON.stringify({
          description: draft.description.trim(),
          instructions: draft.instructions.trim(),
          starter: draft.starter.trim(),
        }),
      };
      if (draft.id) await creationsApi.updateAssistant(draft.id, payload);
      else await creationsApi.createAssistant(payload);
      setAssistantDraft(null);
      setNotice(t('creations.saved'));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('creations.loadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const removeAssistant = (assistant: CreationAssistantRecord) => {
    Alert.alert(t('common.delete'), t('creations.confirmDelete'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await creationsApi.deleteAssistant(assistant.id);
              setAssistants((current) => current.filter((item) => item.id !== assistant.id));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t('creations.loadFailed'));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const inputStyle = [
    styles.input,
    {
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      borderColor: withAlpha(colors.border, 0.55),
      borderRadius: radius.sm,
      fontFamily: typography.body,
    },
  ];

  const startAssistantDraft = (assistant?: CreationAssistantRecord) => {
    if (!assistant) {
      setAssistantDraft({ title: '', description: '', instructions: '', starter: '' });
      return;
    }
    setAssistantDraft({ id: assistant.id, title: assistant.title, ...assistantConfig(assistant.source || '{}') });
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('creations.title')} onNewChat={() => navigation.navigate('Home')} />
      <FlatList<CreationListItem>
        style={styles.collectionList}
        data={visibleRecords}
        extraData={imageLoadStates}
        keyExtractor={(item) => `${tab}:${item.id}`}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, { paddingHorizontal: spacing.md }]}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        refreshControl={<RefreshControl refreshing={loading && loadedTabs[tab]} onRefresh={() => { void load(); }} tintColor={colors.accent} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
        <View style={[styles.tabs, { backgroundColor: colors.surfaceRaised, borderColor: withAlpha(colors.border, 0.42), borderRadius: radius.md }]}>
          {(['images', 'assistants'] as const).map((item) => {
            const selected = tab === item;
            return (
              <AnimatedPressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => { setTab(item); setQuery(''); setError(''); setNotice(''); }}
                style={[styles.tab, selected && { backgroundColor: colors.surface, borderRadius: radius.sm }]}
              >
                <Text style={[styles.tabText, { color: selected ? colors.text : colors.textSubtle, fontFamily: selected ? typography.semibold : typography.body }]}>
                  {t(`creations.${item}`)}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        {tab === 'images' ? (
          <View style={[styles.panel, { borderColor: withAlpha(colors.border, 0.4), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }]}>
            <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('creations.createImage')}</Text>
            {editImageId ? (
              <View style={styles.editingRow}>
                <Ionicons name="image-outline" size={15} color={colors.accent} />
                <Text style={[styles.editingText, { color: colors.textMuted }]}>{t('creations.editImage')}</Text>
                <AnimatedPressable accessibilityLabel={t('common.cancel')} onPress={() => setEditImageId(null)} style={styles.iconButton}>
                  <Ionicons name="close" size={16} color={colors.textSubtle} />
                </AnimatedPressable>
              </View>
            ) : null}
            <TextInput
              accessibilityLabel={t('creations.prompt')}
              multiline
              value={imagePrompt}
              onChangeText={setImagePrompt}
              placeholder={t('creations.prompt')}
              placeholderTextColor={colors.textSubtle}
              style={[inputStyle, styles.multiline]}
              textAlignVertical="top"
            />
            <TextInput
              accessibilityLabel={t('creations.model')}
              value={imageModel}
              onChangeText={setImageModel}
              placeholder={t('creations.model')}
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="none"
              style={inputStyle}
            />
            <AnimatedPressable
              accessibilityRole="button"
              disabled={busy || !imagePrompt.trim()}
              onPress={() => void submitImage()}
              style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.sm }, (busy || !imagePrompt.trim()) && styles.disabled]}
            >
              {busy ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="sparkles-outline" size={16} color={colors.background} />}
              <Text style={[styles.primaryText, { color: colors.background, fontFamily: typography.semibold }]}>{t('creations.generate')}</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.assistantHeader}>
            <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{t('creations.assistants')}</Text>
            <AnimatedPressable
              accessibilityRole="button"
              onPress={() => startAssistantDraft()}
              style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.sm }]}
            >
              <Ionicons name="add" size={17} color={colors.background} />
              <Text style={[styles.primaryText, { color: colors.background, fontFamily: typography.semibold }]}>{t('creations.createAssistant')}</Text>
            </AnimatedPressable>
          </View>
        )}

        {tab === 'assistants' && assistantDraft ? (
          <View style={[styles.panel, { borderColor: withAlpha(colors.border, 0.4), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md }]}>
            <View style={styles.editorHead}>
              <Text style={[styles.heading, { color: colors.text, fontFamily: typography.semibold }]}>{assistantDraft.id ? t('common.change') : t('creations.createAssistant')}</Text>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={() => setAssistantDraft(null)} style={styles.iconButton}>
                <Ionicons name="close" size={18} color={colors.textSubtle} />
              </AnimatedPressable>
            </View>
            <TextInput accessibilityLabel={t('creations.name')} value={assistantDraft.title} onChangeText={(title) => setAssistantDraft((current) => current ? { ...current, title } : current)} placeholder={t('creations.name')} placeholderTextColor={colors.textSubtle} style={inputStyle} />
            <TextInput accessibilityLabel={t('creations.description')} value={assistantDraft.description} onChangeText={(description) => setAssistantDraft((current) => current ? { ...current, description } : current)} placeholder={t('creations.description')} placeholderTextColor={colors.textSubtle} style={inputStyle} />
            <TextInput accessibilityLabel={t('creations.instructions')} multiline value={assistantDraft.instructions} onChangeText={(instructions) => setAssistantDraft((current) => current ? { ...current, instructions } : current)} placeholder={t('creations.instructions')} placeholderTextColor={colors.textSubtle} style={[inputStyle, styles.multiline]} textAlignVertical="top" />
            <TextInput accessibilityLabel={t('creations.starter')} value={assistantDraft.starter} onChangeText={(starter) => setAssistantDraft((current) => current ? { ...current, starter } : current)} placeholder={t('creations.starter')} placeholderTextColor={colors.textSubtle} style={inputStyle} />
            <View style={styles.editorActions}>
              <AnimatedPressable accessibilityRole="button" onPress={() => setAssistantDraft(null)} style={[styles.secondaryButton, { borderColor: withAlpha(colors.border, 0.6), borderRadius: radius.sm }]}>
                <Text style={[styles.secondaryText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </AnimatedPressable>
              <AnimatedPressable accessibilityRole="button" disabled={busy} onPress={() => void saveAssistant()} style={[styles.primaryButton, { backgroundColor: colors.accent, borderRadius: radius.sm }, busy && styles.disabled]}>
                {busy ? <ActivityIndicator size="small" color={colors.background} /> : null}
                <Text style={[styles.primaryText, { color: colors.background, fontFamily: typography.semibold }]}>{t('common.done')}</Text>
              </AnimatedPressable>
            </View>
          </View>
        ) : null}

        <TextInput
          accessibilityLabel={t('creations.search')}
          value={query}
          onChangeText={setQuery}
          placeholder={t('creations.search')}
          placeholderTextColor={colors.textSubtle}
          style={[inputStyle, styles.search]}
        />

        {error ? (
          <AnimatedPressable accessibilityRole="button" onPress={() => void load()} style={[styles.message, { borderColor: withAlpha(colors.danger, 0.35), backgroundColor: colors.surface, borderRadius: radius.md }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={[styles.messageText, { color: colors.danger }]}>{error}</Text>
            <Text style={[styles.retryText, { color: colors.accent }]}>{t('common.retry')}</Text>
          </AnimatedPressable>
        ) : null}
        {notice && !error ? <Text accessibilityRole="text" style={[styles.notice, { color: colors.success }]}>{notice}</Text> : null}
          </View>
        )}
        ListHeaderComponentStyle={styles.listHeader}
        ListEmptyComponent={loading && !loadedTabs[tab] ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.textSubtle, fontFamily: typography.body }}>{t('app.loading')}</Text>
          </View>
        ) : error ? null : (
          <Text accessibilityRole="text" style={[styles.empty, { color: colors.textSubtle }]}>
            {tab === 'images' ? t('creations.emptyImages') : t('creations.emptyAssistants')}
          </Text>
        )}
        renderItem={({ item }) => {
          if (tab === 'images') {
            const image = item as CreationImageRecord;
            const imageState = imageLoadStates[image.id] || 'loading';
            return (
              <View style={[styles.imageCard, { borderColor: withAlpha(colors.border, 0.42), backgroundColor: colors.surface, borderRadius: radius.md }]}>
                <View style={[styles.imagePreview, { backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }]}>
                  {imageState === 'loading' ? <ActivityIndicator accessibilityLabel={t('app.loading')} color={colors.accent} /> : null}
                  {imageState === 'error' ? (
                    <View accessibilityRole="text" style={styles.imageFallback}>
                      <Ionicons name="image-outline" size={22} color={colors.textSubtle} />
                      <Text style={[styles.imageFallbackText, { color: colors.textSubtle }]}>{t('creations.loadFailed')}</Text>
                    </View>
                  ) : null}
                  <Image
                    accessibilityLabel={image.name}
                    source={{ uri: filesApi.rawUrl(image.id), headers: authHeaders }}
                    resizeMode="cover"
                    onLoad={() => updateImageLoadState(image.id, 'loaded')}
                    onError={() => updateImageLoadState(image.id, 'error')}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
                <View style={styles.imageFooter}>
                  <Text numberOfLines={1} style={[styles.imageName, { color: colors.text, fontFamily: typography.medium }]}>{image.name}</Text>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('creations.editImage')}: ${image.name}`}
                    onPress={() => { setEditImageId(image.id); setError(''); }}
                    style={[styles.iconButton, editImageId === image.id && { backgroundColor: withAlpha(colors.accent, 0.12) }]}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.accent} />
                  </AnimatedPressable>
                </View>
              </View>
            );
          }

          const assistant = item as CreationAssistantRecord;
          const config = assistantConfig(assistant.source || '{}');
          return (
            <View style={[styles.assistantCard, { borderColor: withAlpha(colors.border, 0.42), backgroundColor: colors.surface, borderRadius: radius.md }]}>
              <View style={[styles.avatar, { backgroundColor: withAlpha(colors.accent, 0.12) }]}><Ionicons name="sparkles-outline" size={17} color={colors.accent} /></View>
              <View style={styles.assistantCopy}>
                <Text numberOfLines={1} style={[styles.assistantName, { color: colors.text, fontFamily: typography.semibold }]}>{assistant.title}</Text>
                {config.description ? <Text numberOfLines={2} style={[styles.description, { color: colors.textMuted }]}>{config.description}</Text> : null}
              </View>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={`${t('common.change')}: ${assistant.title}`} onPress={() => startAssistantDraft(assistant)} style={styles.iconButton}>
                <Ionicons name="create-outline" size={18} color={colors.textSubtle} />
              </AnimatedPressable>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={`${t('common.delete')}: ${assistant.title}`} onPress={() => removeAssistant(assistant)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={17} color={colors.danger} />
              </AnimatedPressable>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  collectionList: { flex: 1 },
  listContent: { paddingTop: 8, paddingBottom: 30 },
  headerContent: { gap: 12 },
  listHeader: { marginBottom: 12 },
  separator: { height: 10 },
  tabs: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  tabText: { fontSize: 13 },
  panel: { borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  heading: { fontSize: 15 },
  input: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  multiline: { minHeight: 90, paddingTop: 10 },
  primaryButton: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryText: { fontSize: 12 },
  secondaryButton: { minHeight: 40, minWidth: 84, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  secondaryText: { fontSize: 12 },
  disabled: { opacity: 0.55 },
  editingRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editingText: { flex: 1, fontSize: 12 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  assistantHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  search: { minHeight: 40 },
  message: { minHeight: 42, borderWidth: StyleSheet.hairlineWidth, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageText: { flex: 1, fontSize: 12 },
  retryText: { fontSize: 11, fontWeight: '600' },
  notice: { fontSize: 12, paddingHorizontal: 2 },
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
  imageCard: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  imagePreview: { width: '100%', aspectRatio: 1.25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageFallback: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
  imageFallbackText: { fontSize: 11, textAlign: 'center' },
  imageFooter: { minHeight: 46, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  imageName: { flex: 1, fontSize: 12 },
  assistantCard: { minHeight: 66, paddingHorizontal: 10, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, marginRight: 5 },
  assistantCopy: { flex: 1, minWidth: 0 },
  assistantName: { fontSize: 13 },
  description: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  empty: { fontSize: 13, lineHeight: 19, textAlign: 'center', paddingVertical: 28, paddingHorizontal: 24 },
});
