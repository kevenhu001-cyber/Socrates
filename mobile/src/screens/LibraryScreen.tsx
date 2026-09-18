import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { toast } from '../components/Toast';
import { artifactsApi, filesApi } from '../data/api/client';
import { native } from '../native/native';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'files' | 'artifacts';
type LibraryItem = Record<string, unknown>;
type DeleteTarget = { id: string; tab: Tab; title: string };
type Preview =
  | { kind: 'text'; name: string; mimeType: string; text: string; truncated: boolean }
  | { kind: 'image' | 'video' | 'audio' | 'pdf'; name: string; mimeType: string; uri: string; headers: Record<string, string> };

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const TABLE_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx']);

function itemId(item: LibraryItem, index = 0) {
  return String(item.id || `item-${index}`);
}

function itemName(item: LibraryItem, fallback: string) {
  return String(item.name || item.title || fallback);
}

function formatBytes(value: unknown, createdLabel: string) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return createdLabel;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function iconForItem(item: LibraryItem, tab: Tab): React.ComponentProps<typeof Ionicons>['name'] {
  if (tab === 'artifacts') return 'sparkles-outline';
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  if (kind === 'image' || IMAGE_EXTENSIONS.has(ext)) return 'image-outline';
  if (kind === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'videocam-outline';
  if (kind === 'audio' || AUDIO_EXTENSIONS.has(ext)) return 'musical-notes-outline';
  if (kind === 'xlsx' || TABLE_EXTENSIONS.has(ext)) return 'grid-outline';
  if (kind === 'pdf') return 'document-text-outline';
  return 'document-outline';
}

function mediaPreviewKind(item: LibraryItem): Exclude<Preview, { kind: 'text' }>['kind'] | null {
  const mime = String(item.mimeType || '').toLowerCase();
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  if (mime.startsWith('image/') || kind === 'image' || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('video/') || kind === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mime.startsWith('audio/') || kind === 'audio' || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (mime === 'application/pdf' || kind === 'pdf' || ext === 'pdf') return 'pdf';
  return null;
}

export function LibraryScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [tab, setTab] = useState<Tab>('files');
  const [files, setFiles] = useState<LibraryItem[]>([]);
  const [artifacts, setArtifacts] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [renameTarget, setRenameTarget] = useState<DeleteTarget | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [fileResult, artifactResult] = await Promise.all([filesApi.list(), artifactsApi.list()]);
      setFiles(fileResult.files || []);
      setArtifacts(artifactResult.artifacts || []);
      setLoaded(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const source = tab === 'files' ? files : artifacts;
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((item) => itemName(item, t('library.untitled')).toLowerCase().includes(needle));
  }, [query, source, t]);
  const selectedItems = useMemo(
    () => visibleItems.filter((item, index) => selection[itemId(item, index)]),
    [selection, visibleItems],
  );
  const allSelected = visibleItems.length > 0 && selectedItems.length === visibleItems.length;

  const toggleSelected = (id: string) => {
    setSelection((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelection((current) => {
      const next = { ...current };
      visibleItems.forEach((item, index) => {
        const id = itemId(item, index);
        if (allSelected) delete next[id];
        else next[id] = true;
      });
      return next;
    });
  };

  const openItem = async (item: LibraryItem) => {
    const id = String(item.id || '');
    if (!id) return;
    try {
      if (tab === 'artifacts') {
        const artifact = await artifactsApi.get(id);
        navigation.navigate('ArtifactPreview', { artifactId: id, html: String(artifact.source || '') });
        return;
      }
      const mediaKind = mediaPreviewKind(item);
      if (mediaKind) {
        setPreview({
          kind: mediaKind,
          name: itemName(item, t('library.untitled')),
          mimeType: String(item.mimeType || item.kind || mediaKind),
          uri: filesApi.rawUrl(id, true),
          headers: await filesApi.authHeaders(),
        });
        return;
      }
      const file = await filesApi.content(id);
      setPreview({ kind: 'text', name: file.name, mimeType: file.mimeType, text: file.text, truncated: file.truncated });
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : t('library.previewUnavailable'), 'error');
    }
  };

  const upload = async () => {
    const result = await native.pickFile();
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setUploading(true);
    setError('');
    try {
      await filesApi.upload({ uri: asset.uri, name: asset.name || asset.fileName || 'attachment', mimeType: asset.mimeType, size: asset.size || asset.fileSize });
      setTab('files');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const beginRename = (item: LibraryItem, index: number) => {
    const name = itemName(item, t('library.untitled'));
    setRenameTarget({ id: itemId(item, index), tab, title: name });
    setRenameValue(name);
  };

  const saveRename = async () => {
    if (!renameTarget || !renameValue.trim() || renameBusy) return;
    setRenameBusy(true);
    try {
      const nextName = renameValue.trim();
      if (renameTarget.tab === 'files') {
        const saved = await filesApi.rename(renameTarget.id, nextName);
        setFiles((current) => current.map((item) => String(item.id) === renameTarget.id ? { ...item, name: saved.name } : item));
      } else {
        const saved = await artifactsApi.rename(renameTarget.id, nextName);
        setArtifacts((current) => current.map((item) => String(item.id) === renameTarget.id ? { ...item, ...saved, title: nextName } : item));
      }
      setRenameTarget(null);
      toast.show(t('library.renamed'), 'success');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.renameFailed'));
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTargets.length) return;
    const targets = deleteTargets.slice();
    setDeleteTargets([]);
    void Promise.all(targets.map((target) => target.tab === 'files' ? filesApi.remove(target.id) : artifactsApi.remove(target.id)))
      .then(() => {
        const fileIds = new Set(targets.filter((target) => target.tab === 'files').map((target) => target.id));
        const artifactIds = new Set(targets.filter((target) => target.tab === 'artifacts').map((target) => target.id));
        setFiles((current) => current.filter((item) => !fileIds.has(String(item.id))));
        setArtifacts((current) => current.filter((item) => !artifactIds.has(String(item.id))));
        setSelection({});
        toast.show(t('library.deleted'), 'success');
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('library.deleteFailed')));
  };

  const requestDelete = (items: LibraryItem[], index?: number) => {
    const targets = items.map((item, itemIndex) => ({
      id: itemId(item, index === undefined ? itemIndex : index),
      tab,
      title: itemName(item, t('library.untitled')),
    }));
    setDeleteTargets(targets);
  };

  const title = t('sidebar.nav.library') || 'Library';
  const description = t('library.directoryDesc');
  const emptyTitle = query ? t('library.noMatch') : tab === 'files' ? t('library.emptyFiles') : t('library.emptyArtifacts');
  const emptyBody = query ? t('library.noMatchDesc') : tab === 'files' ? t('library.emptyFilesDesc') : t('library.emptyArtifactsDesc');

  return (
    <Screen style={styles.screen}>
      <AppHeader title={title} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.headCopy}>
            <Text style={[styles.kicker, { color: colors.accent, fontFamily: typography.semibold }]}>{t('library.kicker')}</Text>
            <Text style={[styles.heading, { color: colors.text, fontFamily: typography.display }]}>{title}</Text>
            <Text style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{description}</Text>
          </View>
          <View style={styles.headActions}>
            <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
              <Ionicons name="search-outline" size={17} color={colors.textMuted} />
              <TextInput
                accessibilityLabel={t('library.filterPlaceholder')}
                value={query}
                onChangeText={setQuery}
                placeholder={t('library.filterPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                style={[styles.searchInput, { color: colors.text, fontFamily: typography.body }]}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={16} color={colors.textSubtle} /></Pressable> : null}
            </View>
            {tab === 'files' ? (
              <AnimatedPressable accessibilityLabel={t('library.upload')} disabled={uploading} onPress={() => { void upload(); }} style={[styles.upload, { backgroundColor: colors.accent, borderRadius: radius.md, opacity: uploading ? 0.55 : 1 }]}>
                <Ionicons name="add" size={18} color={colors.textInverse} />
                <Text style={[styles.uploadText, { color: colors.textInverse, fontFamily: typography.semibold }]}>{t('library.upload')}</Text>
              </AnimatedPressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.tabs, { borderBottomColor: withAlpha(colors.border, 0.35) }]}>
          {([
            ['files', t('library.files')],
            ['artifacts', t('library.artifacts')],
          ] as Array<[Tab, string]>).map(([value, label]) => {
            const active = tab === value;
            return (
              <AnimatedPressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { setTab(value); setSelection({}); }} style={styles.tab}>
                <Text style={[styles.tabText, { color: active ? colors.text : colors.textMuted, fontFamily: active ? typography.semibold : typography.medium }]}>{label}</Text>
                {active ? <View style={[styles.tabLine, { backgroundColor: colors.accent }]} /> : null}
              </AnimatedPressable>
            );
          })}
          <AnimatedPressable accessibilityLabel={t('library.refresh')} onPress={() => { void load(); }} style={styles.refresh}>
            <Ionicons name="refresh-outline" size={19} color={colors.textMuted} />
          </AnimatedPressable>
        </View>

        {selectedItems.length ? (
          <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
            <AnimatedPressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} onPress={toggleSelectAll} style={styles.checkboxButton}>
              <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={19} color={colors.accent} />
            </AnimatedPressable>
            <Text style={[styles.selectionText, { color: colors.text, fontFamily: typography.medium }]}>{t('library.selectedCount', { n: String(selectedItems.length) })}</Text>
            <AnimatedPressable onPress={() => requestDelete(selectedItems)} style={styles.selectionDelete}>
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
              <Text style={{ color: colors.danger, fontFamily: typography.medium }}>{t('library.deleteSelected')}</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}
        <FlatList
          data={visibleItems}
          keyExtractor={(item, index) => itemId(item, index)}
          contentContainerStyle={visibleItems.length ? styles.list : styles.emptyList}
          refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void load(); }} tintColor={colors.accent} />}
          ListEmptyComponent={busy && !loaded ? <ActivityIndicator color={colors.accent} /> : (
            <View style={styles.empty}>
              <Ionicons name={query ? 'search-outline' : tab === 'files' ? 'folder-open-outline' : 'sparkles-outline'} size={34} color={colors.textSubtle} />
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{emptyTitle}</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{emptyBody}</Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const id = itemId(item, index);
            const name = itemName(item, t('library.untitled'));
            const date = formatDate(item.updatedAt || item.uploadedAt || item.createdAt);
            const meta = tab === 'files'
              ? [String(item.mimeType || item.kind || ''), formatBytes(item.size, t('library.metaCreated'))].filter(Boolean).join(' · ')
              : [String(item.type || t('library.artifact')), date].filter(Boolean).join(' · ');
            return (
              <View style={[styles.row, { borderBottomColor: withAlpha(colors.border, 0.18) }]}>
                <AnimatedPressable accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(selection[id]) }} onPress={() => toggleSelected(id)} style={styles.checkboxButton}>
                  <Ionicons name={selection[id] ? 'checkbox' : 'square-outline'} size={19} color={selection[id] ? colors.accent : colors.textSubtle} />
                </AnimatedPressable>
                <AnimatedPressable onPress={() => { void openItem(item); }} style={styles.rowMain}>
                  <View style={[styles.iconBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderRadius: radius.sm }]}>
                    <Ionicons name={iconForItem(item, tab)} size={18} color={colors.accent} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text, fontFamily: typography.semibold }]}>{name}</Text>
                    <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.textMuted, fontFamily: typography.body }]}>{meta || date || t('library.metaCreated')}</Text>
                  </View>
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel={t('library.rename')} onPress={() => beginRename(item, index)} style={styles.rowAction}>
                  <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                </AnimatedPressable>
                <AnimatedPressable accessibilityLabel={t('common.delete')} onPress={() => requestDelete([item], index)} style={styles.rowAction}>
                  <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                </AnimatedPressable>
              </View>
            );
          }}
        />
      </View>

      <Modal visible={Boolean(renameTarget)} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{t('library.rename')}</Text>
            <TextInput autoFocus value={renameValue} onChangeText={setRenameValue} onSubmitEditing={() => { void saveRename(); }} placeholder={t('library.renamePlaceholder')} placeholderTextColor={colors.textSubtle} style={[styles.renameInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, fontFamily: typography.body }]} returnKeyType="done" />
            <View style={styles.modalActions}>
              <AnimatedPressable onPress={() => setRenameTarget(null)} style={styles.secondaryAction}><Text style={{ color: colors.textMuted, fontFamily: typography.medium }}>{t('common.cancel')}</Text></AnimatedPressable>
              <AnimatedPressable disabled={renameBusy || !renameValue.trim()} onPress={() => { void saveRename(); }} style={[styles.primaryAction, { backgroundColor: colors.accent, borderRadius: radius.sm, opacity: renameBusy || !renameValue.trim() ? 0.45 : 1 }]}><Text style={{ color: colors.textInverse, fontFamily: typography.semibold }}>{renameBusy ? t('app.loading') : t('library.saveName')}</Text></AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(preview)} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <View style={styles.previewHeader}>
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={[styles.modalTitle, { color: colors.text, fontFamily: typography.semibold }]}>{preview?.name || t('library.preview')}</Text>
                <Text style={[styles.rowMeta, { color: colors.textMuted }]}>{preview?.mimeType}</Text>
              </View>
              <AnimatedPressable accessibilityLabel={t('library.closePreview')} onPress={() => setPreview(null)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.textMuted} /></AnimatedPressable>
            </View>
            {preview?.kind === 'text' ? (
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
                <Text selectable style={[styles.previewText, { color: colors.text, fontFamily: typography.body }]}>{preview.text || t('library.previewUnavailable')}</Text>
              </ScrollView>
            ) : preview?.kind === 'image' ? (
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.imagePreviewContent} maximumZoomScale={4} minimumZoomScale={1}>
                <Image source={{ uri: preview.uri, headers: preview.headers }} style={styles.imagePreview} resizeMode="contain" accessibilityLabel={preview.name} />
              </ScrollView>
            ) : preview ? (
              <View style={styles.mediaPreview}>
                <WebView
                  source={{ uri: preview.uri, headers: preview.headers }}
                  style={styles.mediaWebView}
                  containerStyle={styles.mediaWebView}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction
                  setSupportMultipleWindows={false}
                />
              </View>
            ) : null}
            {preview?.kind === 'text' && preview.truncated ? <Text style={[styles.truncated, { color: colors.textMuted }]}>{t('library.previewTruncated')}</Text> : null}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={deleteTargets.length > 0}
        title={deleteTargets.length > 1 ? t('library.deleteSelected') : t('common.delete')}
        message={deleteTargets.length > 1 ? t('library.deleteSelectedConfirm', { n: String(deleteTargets.length) }) : t(tab === 'files' ? 'library.deleteFileConfirm' : 'library.deleteArtifactConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setDeleteTargets([])}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  body: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 16 },
  headCopy: { maxWidth: 620 },
  kicker: { fontSize: 11, letterSpacing: 1.8 },
  heading: { fontSize: 30, marginTop: 5 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  headActions: { gap: 10 },
  search: { minHeight: 44, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, minHeight: 42, fontSize: 14, paddingVertical: 0 },
  upload: { minHeight: 44, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadText: { fontSize: 13 },
  tabs: { marginHorizontal: 20, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'stretch' },
  tab: { minWidth: 100, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  tabText: { fontSize: 13 },
  tabLine: { position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 1 },
  refresh: { marginLeft: 'auto', width: 44, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  selectionBar: { minHeight: 44, marginHorizontal: 20, marginTop: 10, paddingHorizontal: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkboxButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  selectionText: { flex: 1, fontSize: 13 },
  selectionDelete: { minHeight: 36, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  error: { marginHorizontal: 20, marginTop: 10, fontSize: 12 },
  list: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
  emptyList: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyTitle: { fontSize: 18, marginTop: 12 },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconBox: { width: 38, height: 38, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14 },
  rowMeta: { fontSize: 11.5, marginTop: 4 },
  rowAction: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20 },
  renameCard: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 21 },
  renameInput: { minHeight: 46, borderWidth: 1, marginTop: 16, paddingHorizontal: 12, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 },
  secondaryAction: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  primaryAction: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  previewCard: { flex: 1, maxHeight: '88%', borderWidth: 1, padding: 18 },
  previewHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewScroll: { marginTop: 12 },
  previewContent: { paddingVertical: 10 },
  imagePreviewContent: { flexGrow: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  imagePreview: { width: '100%', height: 420 },
  mediaPreview: { flex: 1, minHeight: 320, marginTop: 12, overflow: 'hidden', borderRadius: 10 },
  mediaWebView: { flex: 1, backgroundColor: 'transparent' },
  previewText: { fontSize: 14, lineHeight: 22 },
  truncated: { fontSize: 11.5, marginTop: 8 },
});
