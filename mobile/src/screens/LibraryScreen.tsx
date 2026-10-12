import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { Screen } from '../components/Screen';
import { AppHeader } from '../components/AppHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Overlay } from '../components/Overlay';
import { ZoomableImage } from '../components/ZoomableImage';
import { toast } from '../components/Toast';
import { artifactsApi, filesApi } from '../data/api/client';
import { native } from '../native/native';
import { appStore } from '../stores/appStore';
import { useResponsive } from '../theme/responsive';
import type { RootStackParamList } from '../navigation/types';
import {
  filterLibraryItems,
  getLibraryFileTypeCategory,
  LIBRARY_COLLECTION_FILTERS,
  LIBRARY_TYPE_FILTERS,
  type LibraryCollectionFilter,
  type LibraryTypeFilter,
} from '../data/library/libraryFilters';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'files' | 'artifacts';
type LibraryItem = Record<string, unknown>;
type LibraryRowItem = { item: LibraryItem; index: number };
type LibraryListRow = { key: string; items: LibraryRowItem[] };
type DeleteTarget = { id: string; tab: Tab; title: string };
type Preview =
  | { kind: 'text'; name: string; mimeType: string; text: string; truncated: boolean }
  | { kind: 'image' | 'video' | 'audio' | 'pdf'; name: string; mimeType: string; uri: string; headers: Record<string, string> };

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const TABLE_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx']);
const SLIDE_EXTENSIONS = new Set(['ppt', 'pptx', 'key', 'odp']);
const DOC_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt', 'md', 'markdown', 'txt']);
const BOOK_EXTENSIONS = new Set(['epub', 'mobi', 'azw3']);
const LIBRARY_ICON_COLORS: Readonly<Record<string, string>> = {
  image: '#f43f5e', html: '#14b8a6', doc: '#3b82f6', code: '#a855f7',
  table: '#22c55e', video: '#ef4444', audio: '#f59e0b', file: '#64748b',
};

function itemId(item: LibraryItem, index = 0) {
  return String(item.id || `item-${index}`);
}

function sourceTab(item: LibraryItem): Tab {
  return item.__sourceTab === 'artifacts' ? 'artifacts' : 'files';
}

function itemKey(item: LibraryItem, index = 0) {
  return `${sourceTab(item)}:${itemId(item, index)}`;
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

function FileGlyph({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

/* Port of web `fileTypeGlyph` (WorkspacePage.tsx): `kind` first, then the
 * filename extension, so records saved before `kind` existed still resolve. */
function iconForItem(item: LibraryItem, tab: Tab, color: string): React.ReactNode {
  if (tab === 'artifacts') return <Ionicons name="sparkles-outline" size={18} color={color} />;
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || item.title || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  if (kind === 'image' || IMAGE_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Rect x="3" y="3" width="18" height="18" rx="2.5" /><Circle cx="8.6" cy="8.6" r="1.6" /><Path d="m21 15.5-4.5-4.5L5 22" /></FileGlyph>;
  }
  if (kind === 'video' || VIDEO_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><Path d="m10 9 5 3-5 3z" /></FileGlyph>;
  }
  if (kind === 'audio' || AUDIO_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></FileGlyph>;
  }
  if (kind === 'xlsx' || TABLE_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Rect x="3" y="3" width="18" height="18" rx="2.5" /><Path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></FileGlyph>;
  }
  if (kind === 'pptx' || SLIDE_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Rect x="3" y="3.5" width="18" height="12.5" rx="2" /><Path d="M12 16v5M8.5 21h7" /></FileGlyph>;
  }
  if (kind === 'epub' || BOOK_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></FileGlyph>;
  }
  if (kind === 'pdf' || kind === 'text' || kind === 'docx' || kind === 'rtf' || DOC_EXTENSIONS.has(ext)) {
    return <FileGlyph color={color}><Path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" /><Path d="M14 2.5V8h5.5" /><Path d="M8.5 13h7M8.5 17h4.5" /></FileGlyph>;
  }
  return <FileGlyph color={color}><Path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" /><Path d="M14 2.5V8h5.5" /></FileGlyph>;
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
  const { isCompact, isDesktop } = useResponsive();
  const t = useT();
  const [files, setFiles] = useState<LibraryItem[]>([]);
  const [artifacts, setArtifacts] = useState<LibraryItem[]>([]);
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<LibraryCollectionFilter>('recommend');
  const [typeFilter, setTypeFilter] = useState<LibraryTypeFilter>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
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

  const source = useMemo<LibraryItem[]>(() => [
    ...files.map((item) => ({ ...item, __sourceTab: 'files' as const })),
    ...artifacts.map((item) => ({ ...item, __sourceTab: 'artifacts' as const })),
  ], [artifacts, files]);
  const visibleItems = useMemo<LibraryItem[]>(() => {
    return filterLibraryItems(source, { collection, type: typeFilter, query });
  }, [collection, query, source, typeFilter]);
  const listRows = useMemo<LibraryListRow[]>(() => {
    const itemsPerRow = viewMode === 'grid' ? 2 : 1;
    const rows: LibraryListRow[] = [];
    for (let index = 0; index < visibleItems.length; index += itemsPerRow) {
      const items = visibleItems.slice(index, index + itemsPerRow).map((item, offset) => ({ item, index: index + offset }));
      rows.push({ key: itemKey(items[0].item, items[0].index), items });
    }
    return rows;
  }, [viewMode, visibleItems]);
  const selectedItems = useMemo(
    () => visibleItems.filter((item, index) => selection[itemKey(item, index)]),
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
        const id = itemKey(item, index);
        if (allSelected) delete next[id];
        else next[id] = true;
      });
      return next;
    });
  };

  const openItem = async (item: LibraryItem) => {
    const id = String(item.id || '');
    const tab = sourceTab(item);
    if (!id) return;
    try {
      if (tab === 'artifacts') {
        const artifact = await artifactsApi.get(id);
        navigation.navigate('ArtifactPreview', { artifactId: id, html: String(artifact.source || ''), kind: String(artifact.kind || artifact.mimeType || 'text/html') });
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
      setCollection('all');
      setTypeFilter('all');
      setQuery('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const beginRename = (item: LibraryItem, index: number) => {
    const name = itemName(item, t('library.untitled'));
    setRenameTarget({ id: itemId(item, index), tab: sourceTab(item), title: name });
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
      tab: sourceTab(item),
      title: itemName(item, t('library.untitled')),
    }));
    setDeleteTargets(targets);
  };

  const title = t('sidebar.nav.library') || 'Library';
  const description = t('library.directoryDesc');
  const hasActiveFilter = Boolean(query.trim()) || collection !== 'recommend' || typeFilter !== 'all';
  const emptyImages = collection === 'images' && !query.trim() && typeFilter === 'all';
  const emptyTitle = emptyImages ? t('library.emptyImages') : hasActiveFilter ? t('library.noMatch') : t('library.emptyFiles');
  const emptyBody = emptyImages ? t('library.emptyImagesDesc') : hasActiveFilter ? t('library.noMatchDesc') : t('library.emptyFilesDesc');
  const compactHeader = isCompact;
  const renderNewButton = (compact: boolean) => (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('library.new')}
      accessibilityState={{ expanded: newMenuOpen }}
      disabled={uploading}
      onPress={() => setNewMenuOpen(true)}
      style={[styles.upload, compact ? styles.uploadCompact : null, { backgroundColor: colors.text, borderColor: colors.borderStrong, borderRadius: radius.pill, opacity: uploading ? 0.55 : 1 }]}
    >
      <Text style={[styles.uploadText, { color: colors.background, fontFamily: typography.semibold }]}>{t('library.new')}</Text>
      {!compact ? <Ionicons name="chevron-down" size={14} color={colors.background} /> : null}
    </AnimatedPressable>
  );
  const renderSettingsButton = () => (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t('profile.preferences')}
      onPress={() => navigation.navigate('Settings')}
      style={styles.settingsButton}
    >
      <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
    </AnimatedPressable>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader showNavigation={isCompact} showIncognito={false} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />
      <View style={[styles.body, isDesktop ? styles.bodyDesktop : null]}>
        <View style={[styles.head, compactHeader ? styles.headCompact : styles.headDesktop]}>
          <View style={styles.headCopy}>
            <View style={styles.titleRow}>
              <Text style={[styles.heading, compactHeader ? styles.headingCompact : null, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
              {compactHeader ? (
                <View style={styles.headCompactActions}>
                  {renderNewButton(true)}
                  {renderSettingsButton()}
                </View>
              ) : null}
            </View>
            {!compactHeader ? <Text style={[styles.description, { color: colors.textMuted, fontFamily: typography.body }]}>{description}</Text> : null}
          </View>
          {!compactHeader ? (
            <View style={styles.headActionsWide}>
              {renderNewButton(false)}
              {renderSettingsButton()}
            </View>
          ) : null}
        </View>

        <View style={[styles.libraryToolbar, isCompact ? styles.libraryToolbarCompact : null]}>
          <View style={styles.libraryToolbarControls}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={t('library.filterByType')}
              accessibilityState={{ expanded: filterMenuOpen, selected: typeFilter !== 'all' }}
              onPress={() => setFilterMenuOpen(true)}
              hitSlop={4}
              style={[styles.libraryToolButton, { borderRadius: radius.sm, backgroundColor: typeFilter !== 'all' ? colors.surfaceHover : 'transparent' }]}
            >
              <Ionicons name="filter-outline" size={17} color={typeFilter !== 'all' ? colors.text : colors.textMuted} />
            </AnimatedPressable>
            <View style={[styles.toolbarDivider, { backgroundColor: colors.border }]} />
            <View style={styles.viewSwitch}>
              {(['grid', 'list'] as const).map((mode) => (
                <AnimatedPressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityLabel={t(mode === 'grid' ? 'library.gridView' : 'library.listView')}
                  accessibilityState={{ selected: viewMode === mode }}
                  onPress={() => setViewMode(mode)}
                  hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                  style={[styles.viewButton, viewMode === mode && { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}
                >
                  <Ionicons name={mode === 'grid' ? 'grid-outline' : 'list-outline'} size={17} color={viewMode === mode ? colors.text : colors.textMuted} />
                </AnimatedPressable>
              ))}
            </View>
          </View>
          <View style={[styles.search, isCompact ? styles.searchCompact : styles.searchDesktop, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill }]}>
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
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips} accessibilityRole="tablist" accessibilityLabel={title}>
          {LIBRARY_COLLECTION_FILTERS.map((filter) => {
            const active = collection === filter.id;
            return (
              <AnimatedPressable
                key={filter.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setCollection(filter.id)}
                hitSlop={3}
                style={[styles.chip, { backgroundColor: active ? colors.surfaceHover : 'transparent', borderColor: active ? colors.border : 'transparent', borderRadius: radius.pill }]}
              >
                <Text style={[styles.chipText, { color: active ? colors.text : colors.textMuted, fontFamily: active ? typography.semibold : typography.medium }]}>{t(filter.label)}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {selectedItems.length ? (
          <View style={[styles.selectionBar, { backgroundColor: colors.surface, borderRadius: radius.md }]}>
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
          testID="library-items-list"
          data={listRows}
          extraData={selection}
          numColumns={1}
          keyExtractor={(row) => row.key}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={9}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          contentContainerStyle={listRows.length ? [viewMode === 'grid' ? styles.gridList : styles.list, isCompact ? (viewMode === 'grid' ? styles.gridListCompact : styles.listCompact) : null, isDesktop ? styles.listDesktop : null] : [styles.emptyList, isCompact ? styles.emptyListCompact : styles.emptyListDesktop]}
          refreshControl={<RefreshControl refreshing={busy} onRefresh={() => { void load(); }} tintColor={colors.accent} />}
          ListEmptyComponent={busy && !loaded ? <ActivityIndicator color={colors.accent} /> : (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>{emptyTitle}</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>{emptyBody}</Text>
            </View>
          )}
          renderItem={({ item: row }) => {
            const renderCard = ({ item, index }: LibraryRowItem) => {
              const key = itemKey(item, index);
              const itemTab = sourceTab(item);
              const selected = Boolean(selection[key]);
              const name = itemName(item, t('library.untitled'));
              const date = formatDate(item.updatedAt || item.uploadedAt || item.createdAt);
              const meta = itemTab === 'files'
                ? [date, formatBytes(item.size, '')].filter(Boolean).join(' · ')
                : [String(item.type || t('library.artifact')), date].filter(Boolean).join(' · ');
              const iconCategory = getLibraryFileTypeCategory({ kind: String(item.kind || ''), name });
              const iconBackground = itemTab === 'artifacts' ? '#a855f7' : (LIBRARY_ICON_COLORS[iconCategory] || LIBRARY_ICON_COLORS.file);
              if (viewMode === 'grid') {
                return (
                  <View key={key} style={[styles.gridCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
                    <View style={styles.gridCardTop}>
                      <View style={[styles.iconBox, { backgroundColor: iconBackground, borderColor: iconBackground, borderRadius: radius.sm }]}>
                        {iconForItem(item, itemTab, '#ffffff')}
                      </View>
                      <AnimatedPressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleSelected(key)} style={styles.gridCheckbox}>
                        <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={19} color={selected ? colors.accent : colors.textSubtle} />
                      </AnimatedPressable>
                    </View>
                    <AnimatedPressable onPress={() => { void openItem(item); }} style={styles.gridCopy}>
                      <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text, fontFamily: typography.semibold }]}>{name}</Text>
                      <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.textMuted, fontFamily: typography.body }]}>{meta || date || t('library.metaCreated')}</Text>
                    </AnimatedPressable>
                    <View style={styles.gridActions}>
                      <AnimatedPressable accessibilityLabel={t('library.rename')} onPress={() => beginRename(item, index)} style={styles.gridAction}>
                        <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                      </AnimatedPressable>
                      <AnimatedPressable accessibilityLabel={t('common.delete')} onPress={() => requestDelete([item], index)} style={styles.gridAction}>
                        <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                      </AnimatedPressable>
                    </View>
                  </View>
                );
              }
              return (
                <View key={key} style={[styles.row, isCompact ? styles.rowCompact : null, { borderBottomColor: withAlpha(colors.border, 0.18) }]}>
                  <AnimatedPressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => toggleSelected(key)} hitSlop={2} style={[styles.checkboxButton, isCompact ? styles.checkboxButtonCompact : null]}>
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={19} color={selected ? colors.accent : colors.textSubtle} />
                  </AnimatedPressable>
                  <AnimatedPressable onPress={() => { void openItem(item); }} style={[styles.rowMain, isCompact ? styles.rowMainCompact : null]}>
                    <View style={[styles.iconBox, isCompact ? styles.iconBoxCompact : null, { backgroundColor: iconBackground, borderColor: iconBackground, borderRadius: radius.sm }]}>
                      {iconForItem(item, itemTab, '#ffffff')}
                    </View>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={[styles.rowTitle, isCompact ? styles.rowTitleCompact : null, { color: colors.text, fontFamily: typography.semibold }]}>{name}</Text>
                      <Text numberOfLines={1} style={[styles.rowMeta, isCompact ? styles.rowMetaCompact : null, { color: colors.textMuted, fontFamily: typography.body }]}>{meta || date || t('library.metaCreated')}</Text>
                    </View>
                  </AnimatedPressable>
                  <AnimatedPressable accessibilityLabel={t('library.rename')} onPress={() => beginRename(item, index)} hitSlop={5} style={[styles.rowAction, isCompact ? styles.rowActionCompact : null]}>
                    <Ionicons name="pencil-outline" size={17} color={colors.textMuted} />
                  </AnimatedPressable>
                  <AnimatedPressable accessibilityLabel={t('common.delete')} onPress={() => requestDelete([item], index)} hitSlop={5} style={[styles.rowAction, isCompact ? styles.rowActionCompact : null]}>
                    <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                  </AnimatedPressable>
                </View>
              );
            };
            return viewMode === 'grid'
              ? <View style={styles.gridRow}>{row.items.map(renderCard)}</View>
              : renderCard(row.items[0]);
          }}
        />
      </View>

      <Overlay visible={filterMenuOpen} presentation="bottom" onClose={() => setFilterMenuOpen(false)} maxWidth={560} testID="library-filter-menu" style={[styles.menuSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <View style={styles.menuHeader}>
          <Text style={[styles.menuTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.filterByType')}</Text>
          <AnimatedPressable accessibilityLabel={t('common.close')} onPress={() => setFilterMenuOpen(false)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.textMuted} /></AnimatedPressable>
        </View>
        {LIBRARY_TYPE_FILTERS.map((filter) => {
          const active = typeFilter === filter.id;
          return (
            <AnimatedPressable
              key={filter.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => { setTypeFilter(filter.id); setFilterMenuOpen(false); }}
              style={[styles.menuOption, active && { backgroundColor: colors.surfaceHover, borderRadius: radius.sm }]}
            >
              <Text style={[styles.menuOptionText, { color: colors.text, fontFamily: active ? typography.semibold : typography.body }]}>{t(filter.label)}</Text>
              {active ? <Ionicons name="checkmark" size={19} color={colors.accent} /> : null}
            </AnimatedPressable>
          );
        })}
      </Overlay>

      <Overlay visible={newMenuOpen} presentation="bottom" onClose={() => setNewMenuOpen(false)} maxWidth={560} testID="library-new-menu" style={[styles.menuSheet, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
        <View style={styles.menuHeader}>
          <Text style={[styles.menuTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.new')}</Text>
          <AnimatedPressable accessibilityLabel={t('common.close')} onPress={() => setNewMenuOpen(false)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.textMuted} /></AnimatedPressable>
        </View>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={t('library.upload')}
          disabled={uploading}
          onPress={() => { setNewMenuOpen(false); setCollection('all'); setTypeFilter('all'); setQuery(''); void upload(); }}
          style={styles.menuOption}
        >
          <Ionicons name="cloud-upload-outline" size={19} color={colors.textMuted} />
          <Text style={[styles.menuOptionText, { color: colors.text, fontFamily: typography.body }]}>{t('library.upload')}</Text>
        </AnimatedPressable>
      </Overlay>

      <Overlay visible={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} maxWidth={420} testID="library-rename" style={[styles.renameCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text, fontFamily: typography.display }]}>{t('library.rename')}</Text>
            <TextInput autoFocus value={renameValue} onChangeText={setRenameValue} onSubmitEditing={() => { void saveRename(); }} placeholder={t('library.renamePlaceholder')} placeholderTextColor={colors.textSubtle} style={[styles.renameInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, fontFamily: typography.body }]} returnKeyType="done" />
            <View style={styles.modalActions}>
              <AnimatedPressable onPress={() => setRenameTarget(null)} style={styles.secondaryAction}><Text style={{ color: colors.textMuted, fontFamily: typography.medium }}>{t('common.cancel')}</Text></AnimatedPressable>
              <AnimatedPressable disabled={renameBusy || !renameValue.trim()} onPress={() => { void saveRename(); }} style={[styles.primaryAction, { backgroundColor: colors.accent, borderRadius: radius.sm, opacity: renameBusy || !renameValue.trim() ? 0.45 : 1 }]}><Text style={{ color: colors.textInverse, fontFamily: typography.semibold }}>{renameBusy ? t('app.loading') : t('library.saveName')}</Text></AnimatedPressable>
            </View>
      </Overlay>

      <Overlay visible={Boolean(preview)} presentation="bottom" onClose={() => setPreview(null)} maxWidth={720} testID="library-preview" style={[styles.previewCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
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
              <View style={[styles.previewScroll, { backgroundColor: colors.surfaceHover, borderRadius: radius.md }]}>
                <ZoomableImage source={{ uri: preview.uri, headers: preview.headers }} accessibilityLabel={preview.name} />
              </View>
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
      </Overlay>

      <ConfirmDialog
        visible={deleteTargets.length > 0}
        title={deleteTargets.length > 1 ? t('library.deleteSelected') : t('common.delete')}
        message={deleteTargets.length > 1 ? t('library.deleteSelectedConfirm', { n: String(deleteTargets.length) }) : t(deleteTargets[0]?.tab === 'files' ? 'library.deleteFileConfirm' : 'library.deleteArtifactConfirm')}
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
  bodyDesktop: { alignSelf: 'center', width: '100%', maxWidth: 768 },
  head: { gap: 0 },
  headCompact: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  headDesktop: { paddingHorizontal: 15, paddingTop: 72, paddingBottom: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  headCopy: { flex: 1, minWidth: 0 },
  titleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headCompactActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headActionsWide: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  headingCompact: { fontSize: 27, lineHeight: 36 },
  description: { fontSize: 17, lineHeight: 26, marginTop: 4 },
  search: { minHeight: 42, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  searchCompact: { flex: 1, minWidth: 0, minHeight: 42 },
  searchDesktop: { width: 240, minHeight: 42 },
  searchInput: { flex: 1, minHeight: 40, fontSize: 14, paddingVertical: 0 },
  upload: { minWidth: 96, minHeight: 48, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadCompact: { width: 76, minWidth: 76, minHeight: 40, paddingHorizontal: 0 },
  uploadText: { fontSize: 14 },
  settingsButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  libraryToolbar: { minHeight: 48, marginHorizontal: 15, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  libraryToolbarCompact: { marginHorizontal: 16 },
  libraryToolbarControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  libraryToolButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  toolbarDivider: { width: StyleSheet.hairlineWidth, height: 20 },
  viewSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  chipScroll: { marginBottom: 16 },
  chips: { minHeight: 38, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  chip: { minHeight: 38, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, lineHeight: 18 },
  tabs: { minHeight: 40, flexDirection: 'row', alignItems: 'center' },
  tabsCompact: { marginHorizontal: 24, marginTop: 27 },
  tabsCompactWide: { marginHorizontal: 28 },
  tabsDesktop: { marginHorizontal: 15, marginTop: 48 },
  tab: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  tabText: { fontSize: 13 },
  refresh: { marginLeft: 'auto', width: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  selectionBar: { minHeight: 44, marginHorizontal: 20, marginTop: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkboxButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  checkboxButtonCompact: { width: 36, height: 44 },
  selectionText: { flex: 1, fontSize: 13 },
  selectionDelete: { minHeight: 36, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  error: { marginHorizontal: 20, marginTop: 10, fontSize: 12 },
  list: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 40 },
  listCompact: { paddingHorizontal: 16 },
  listDesktop: { paddingHorizontal: 15 },
  gridList: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 10 },
  gridListCompact: { paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  gridCard: { width: '48%', maxWidth: '48%', minWidth: 0, minHeight: 164, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  gridCardTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gridCheckbox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gridCopy: { flex: 1, minHeight: 62, paddingTop: 8, justifyContent: 'flex-start' },
  gridActions: { minHeight: 44, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  gridAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyList: { alignItems: 'center', paddingHorizontal: 28 },
  emptyListCompact: { paddingTop: 58 },
  emptyListDesktop: { paddingTop: 30 },
  empty: { alignItems: 'center', paddingVertical: 0 },
  emptyTitle: { fontSize: 14 },
  emptyBody: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowCompact: { minHeight: 62 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowMainCompact: { gap: 10, paddingVertical: 8 },
  iconBox: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconBoxCompact: { width: 34, height: 34 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14 },
  rowTitleCompact: { fontSize: 15 },
  rowMeta: { fontSize: 11.5, marginTop: 4 },
  rowMetaCompact: { fontSize: 13, marginTop: 3 },
  rowAction: { width: 38, height: 42, alignItems: 'center', justifyContent: 'center' },
  rowActionCompact: { width: 34, height: 38 },
  renameCard: { width: '100%', maxWidth: 420, alignSelf: 'center', borderWidth: 1, padding: 20 },
  menuSheet: { width: '100%', padding: 18, borderWidth: StyleSheet.hairlineWidth },
  menuHeader: { minHeight: 44, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuTitle: { flex: 1, fontSize: 18 },
  menuOption: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuOptionText: { flex: 1, fontSize: 14 },
  modalTitle: { fontSize: 21 },
  renameInput: { minHeight: 46, borderWidth: 1, marginTop: 16, paddingHorizontal: 12, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 16 },
  secondaryAction: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  primaryAction: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  previewCard: { height: '84%', maxHeight: '88%', borderWidth: 1, padding: 18 },
  previewHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  previewScroll: { marginTop: 12 },
  previewContent: { paddingVertical: 10 },
  mediaPreview: { flex: 1, minHeight: 320, marginTop: 12, overflow: 'hidden', borderRadius: 10 },
  mediaWebView: { flex: 1, backgroundColor: 'transparent' },
  previewText: { fontSize: 14, lineHeight: 22 },
  truncated: { fontSize: 11.5, marginTop: 8 },
});
