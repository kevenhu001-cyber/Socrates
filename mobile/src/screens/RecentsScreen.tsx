import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Session } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { useAppStore, appStore } from '../stores/appStore';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Skeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { artifactsApi, filesApi } from '../data/api/client';
import { native } from '../native/native';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Library'>;
type Tab = 'chats' | 'uploads' | 'created';
type FilterChipType = 'all' | 'chat' | 'tutor' | 'exam';
type FilePreview = { name: string; mimeType: string; text: string; truncated: boolean };

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getTimeBucket(rawDate: string | number | undefined, pinned: boolean, now: Date): string {
  if (pinned) return 'Pinned';
  const raw = rawDate || Date.now();
  const d = new Date(raw);
  const ts = d.getTime();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfDay) return 'Today';
  if (ts >= startOfDay - 86400000) return 'Yesterday';
  if (ts >= startOfDay - 7 * 86400000) return 'Previous 7 days';
  if (ts >= startOfDay - 30 * 86400000) return 'Previous 30 days';
  if (d.getFullYear() === now.getFullYear()) return MONTH_NAMES[d.getMonth()];
  return String(d.getFullYear());
}

type RecentsListItem =
  | { kind: 'header'; label: string; key: string }
  | { kind: 'row'; data: Record<string, unknown>; key: string };

export function RecentsScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  /* P0 perf — only subscribe to the sessions slice, since that is the
   * only piece of store state this screen renders. Whole-state
   * subscription would also re-render here on every streaming token
   * pushed by ChatScreen in the background. */
  const sessions = useAppStore((s) => s.sessions);
  const [tab, setTab] = useState<Tab>('chats');
  const [filterChip, setFilterChip] = useState<FilterChipType>('all');
  const [files, setFiles] = useState<Array<Record<string, unknown>>>([]);
  const [artifacts, setArtifacts] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [error, setError] = useState('');

  // Action menu state
  const [actionSession, setActionSession] = useState<Record<string, unknown> | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);

  const load = async (active = tab) => {
    setBusy(true);
    setError('');
    try {
      if (active === 'chats') await appStore.refreshSessions();
      if (active === 'uploads') setFiles((await filesApi.list()).files);
      if (active === 'created') setArtifacts((await artifactsApi.list()).artifacts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(tab); }, [tab]);

  // Filtered and time-grouped items
  const listItems = useMemo<RecentsListItem[]>(() => {
    if (tab === 'uploads') {
      return files.map((item, idx) => ({
        kind: 'row',
        data: { ...item, _kind: 'file' },
        key: `file-${item.id || idx}`,
      }));
    }
    if (tab === 'created') {
      return artifacts.map((item, idx) => ({
        kind: 'row',
        data: { ...item, _kind: 'artifact' },
        key: `art-${item.id || idx}`,
      }));
    }

    // Tab === 'chats': filter by chip first
    let filtered = sessions;
    if (filterChip === 'chat') {
      filtered = filtered.filter((s) => s.mode === 'chat' && s.kind !== 'exam');
    } else if (filterChip === 'tutor') {
      filtered = filtered.filter((s) => s.mode === 'tutor');
    } else if (filterChip === 'exam') {
      filtered = filtered.filter((s) => s.kind === 'exam');
    }

    const now = new Date();
    // Group into buckets
    const bucketMap = new Map<string, Session[]>();
    const bucketOrder: string[] = [];

    filtered.forEach((s) => {
      const bucket = getTimeBucket(s.updatedAt, Boolean(s.pinned), now);
      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, []);
        bucketOrder.push(bucket);
      }
      bucketMap.get(bucket)!.push(s);
    });

    const result: RecentsListItem[] = [];
    bucketOrder.forEach((bucket) => {
      result.push({ kind: 'header', label: bucket, key: `header-${bucket}` });
      const items = bucketMap.get(bucket)!;
      items.forEach((s) => {
        result.push({
          kind: 'row',
          data: { ...s, _kind: 'session' },
          key: `session-${s.id}`,
        });
      });
    });

    return result;
  }, [artifacts, files, filterChip, sessions, tab]);

  const openItem = async (item: Record<string, unknown>) => {
    if (item._kind === 'session') {
      await appStore.openSession(String(item.id));
      navigation.navigate('Chat');
      return;
    }
    if (item._kind === 'artifact') {
      const artifact = await artifactsApi.get(String(item.id));
      navigation.navigate('ArtifactPreview', {
        artifactId: String(artifact.id),
        html: String(artifact.source || ''),
        kind: String(artifact.kind || artifact.mimeType || 'text/html'),
      });
      return;
    }
    try {
      const result = await filesApi.content(String(item.id));
      setPreview({ name: result.name, mimeType: result.mimeType, text: result.text, truncated: result.truncated });
    } catch (caught) {
      toast.show(caught instanceof Error ? caught.message : t('library.previewUnavailable'), 'error');
    }
  };

  const upload = async () => {
    const result = await native.pickFile();
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    setError('');
    try {
      const asset = result.assets[0];
      await filesApi.upload({
        uri: asset.uri,
        name: asset.name || asset.fileName || 'attachment',
        mimeType: asset.mimeType,
        size: asset.size || asset.fileSize,
      });
      await load('uploads');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const saveRename = async () => {
    if (!renameId || !renameValue.trim()) return;
    setRenameBusy(true);
    try {
      await appStore.renameSession(renameId, renameValue);
      setRenameId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed'));
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDeleteSession = () => {
    if (!pendingDeleteSessionId) return;
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    void appStore.deleteSession(id).catch((caught) =>
      setError(caught instanceof Error ? caught.message : t('library.refreshFailed')),
    );
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title={t('library.heading')} onNewChat={() => { appStore.startNewSession('chat'); navigation.navigate('Home'); }} />

      {/* Tabs — pill idiom shared with LibraryScreen */}
      <View style={styles.tabs}>
        {([
          ['chats', t('library.chats')],
          ['uploads', t('library.uploads')],
          ['created', t('library.created')],
        ] as Array<[Tab, string]>).map(([value, label]) => {
          const active = tab === value;
          return (
            <AnimatedPressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(value)} style={[styles.tab, active && { backgroundColor: colors.surfaceHover, borderRadius: radius.pill }]}>
              <Text style={[styles.tabText, { color: active ? colors.text : colors.textMuted, fontFamily: active ? typography.semibold : typography.medium }]}>{label}</Text>
            </AnimatedPressable>
          );
        })}
        {tab === 'uploads' ? (
          <AnimatedPressable accessibilityLabel={t('library.upload')} onPress={() => { void upload(); }} disabled={uploading} style={styles.refresh}>
            <Ionicons name="cloud-upload-outline" size={21} color={uploading ? colors.textSubtle : colors.accent} />
          </AnimatedPressable>
        ) : null}
        <AnimatedPressable accessibilityLabel={t('library.refresh')} onPress={() => { void load(); }} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={21} color={colors.textMuted} />
        </AnimatedPressable>
      </View>

      {/* 1:1 Parity: Filter Chips row (.recents-filter-chips styles.css:264-270) */}
      {tab === 'chats' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {[
            { id: 'all', label: t('sidebar.all') || 'All' },
            { id: 'chat', label: t('tutor.modeChat') || 'Chat' },
            { id: 'tutor', label: t('tutor.modeTutor') || 'Tutor' },
            { id: 'exam', label: t('session.badgeExam') || 'Exam' },
          ].map((chip) => {
            const active = filterChip === chip.id;
            return (
              <AnimatedPressable
                key={chip.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilterChip(chip.id as FilterChipType)}
                style={[
                  styles.filterChip,
                  active && [styles.filterChipActive, { backgroundColor: withAlpha(colors.surfaceRaised, 0.7) }],
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: active ? colors.text : colors.textMuted,
                      fontFamily: active ? typography.semibold : typography.medium,
                    },
                  ]}
                >
                  {chip.label}
                </Text>
                {active ? <View style={[styles.filterChipIndicator, { backgroundColor: colors.text }]} /> : null}
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>{error}</Text> : null}

      {busy ? (
        <View style={styles.list} testID="library-loading">
          {[0, 1, 2, 3, 4].map((index) => (
            <View key={index} style={styles.loadingRow}>
              <Skeleton width={38} height={38} borderRadius={radius.sm} />
              <View style={styles.loadingCopy}>
                <Skeleton width="72%" height={15} borderRadius={4} />
                <Skeleton width="48%" height={12} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          /* Plain text rows only (no WebView islands), so clipped-subview
           * removal is safe here and trims memory/offscreen work on long
           * session histories. */
          removeClippedSubviews
          initialNumToRender={14}
          windowSize={7}
          maxToRenderPerBatch={10}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              // Time-grouping label: Today / Yesterday / Previous 7 days / etc. (.recents-time-label)
              return (
                <View style={styles.timeLabelWrap}>
                  <Text style={[styles.timeLabel, { color: colors.textSubtle }]}>
                    {item.label}
                  </Text>
                </View>
              );
            }

            const rowData = item.data;
            const kind = String(rowData._kind);
            const title = String(rowData.title || rowData.name || rowData.topic || t('library.untitled'));
            const sessionMeta = kind === 'session'
              ? [formatRelativeTime(rowData.updatedAt), typeof rowData.totalQ === 'number' && rowData.totalQ > 0 ? t('exam.questionCount', { n: rowData.totalQ }) : '']
                  .filter(Boolean).join(' · ')
              : '';
            const previewText = kind === 'session'
              ? (sessionMeta || String(rowData.preview || rowData.topic || t('library.noMessages')))
              : kind === 'file'
                ? `${String(rowData.mimeType || t('library.upload'))} · ${formatBytes(Number(rowData.size || 0))}`
                : `${String(rowData.type || t('library.artifact'))} · ${String(rowData.language || '')}`;
            const icon = kind === 'session' ? 'chatbubble-outline' : kind === 'file' ? 'document-outline' : 'sparkles-outline';
            const modeBadgeColor = kind === 'session' ? modeDotColor(rowData, colors.mode === 'dark') : null;

            return (
              <AnimatedPressable
                onPress={() => { void openItem(rowData); }}
                onLongPress={kind === 'session' ? () => setActionSession(rowData) : undefined}
                style={[styles.row, { borderBottomColor: withAlpha(colors.border, 0.15) }]}
              >
                <View style={[styles.icon, { backgroundColor: colors.surfaceRaised, borderRadius: radius.sm }]}>
                  <Ionicons name={icon} size={18} color={colors.textMuted} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleRow}>
                    {modeBadgeColor ? (
                      <View
                        accessibilityLabel={modeDotLabel(rowData, t)}
                        style={[styles.modeDot, { backgroundColor: modeBadgeColor }]}
                      />
                    ) : null}
                    <Text numberOfLines={1} style={[styles.title, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.preview, { color: colors.textMuted, fontFamily: typography.body }]}>{previewText}</Text>
                </View>
                {kind === 'session' && rowData.pinned === true ? (
                  <Ionicons name="pin" size={14} color={colors.accent} style={{ marginRight: 4 }} />
                ) : null}
                {kind === 'session' ? (
                  <AnimatedPressable
                    accessibilityLabel={`${title}: ${t('common.more')}`}
                    onPress={(event) => {
                      event.stopPropagation();
                      setActionSession(rowData);
                    }}
                    style={styles.more}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSubtle} />
                  </AnimatedPressable>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              </AnimatedPressable>
            );
          }}
          ListEmptyComponent={(() => {
            const filteredEmpty = tab === 'chats' && filterChip !== 'all' && sessions.length > 0;
            return (
              <View style={styles.empty}>
                <Ionicons name="library-outline" size={34} color={colors.textSubtle} />
                <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                  {filteredEmpty ? t('library.noMatch') : error ? t('library.refreshFailed') : t('library.emptyTitle')}
                </Text>
                <Text style={[styles.preview, { color: colors.textMuted, fontFamily: typography.body }]}>
                  {filteredEmpty ? t('library.noMatchDesc') : error ? error : t('library.emptyBody')}
                </Text>
                {filteredEmpty ? (
                  <AnimatedPressable onPress={() => setFilterChip('all')} style={[styles.emptyAction, { borderColor: colors.borderStrong, borderRadius: radius.pill }]}>
                    <Text style={[styles.emptyActionText, { color: colors.text, fontFamily: typography.medium }]}>{t('sidebar.all')}</Text>
                  </AnimatedPressable>
                ) : null}
                {error ? (
                  <AnimatedPressable onPress={() => { void load(); }} style={[styles.emptyAction, { borderColor: colors.borderStrong, borderRadius: radius.pill }]}>
                    <Text style={[styles.emptyActionText, { color: colors.text, fontFamily: typography.medium }]}>{t('common.retry') || 'Retry'}</Text>
                  </AnimatedPressable>
                ) : null}
              </View>
            );
          })()}
        />
      )}

      {/* File text preview modal */}
      <Modal visible={Boolean(preview)} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.previewModal, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.xl }]}>
            <View style={styles.previewHeader}>
              <View style={styles.previewTitleWrap}>
                <Text numberOfLines={1} style={[styles.previewTitle, { color: colors.text, fontFamily: typography.semibold }]}>{preview?.name || t('library.preview')}</Text>
                {preview?.mimeType ? <Text style={[styles.previewMime, { color: colors.textMuted }]}>{preview.mimeType}</Text> : null}
              </View>
              <AnimatedPressable accessibilityLabel={t('library.closePreview')} onPress={() => setPreview(null)} style={styles.close}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </AnimatedPressable>
            </View>
            <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
              <Text selectable style={[styles.previewText, { color: colors.text, fontFamily: typography.mono }]}>{preview?.text || t('library.previewUnavailable')}</Text>
            </ScrollView>
            {preview?.truncated ? <Text style={[styles.truncated, { color: colors.textMuted }]}>{t('library.previewTruncated')}</Text> : null}
          </View>
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal visible={Boolean(renameId)} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <View style={[styles.modalCenteredBackdrop, { backgroundColor: colors.scrim }]}>
          <View style={[styles.renameCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg }]}>
            <Text style={[styles.renameTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('library.rename')}</Text>
            <TextInput
              autoFocus
              value={renameValue}
              onChangeText={setRenameValue}
              onSubmitEditing={() => { void saveRename(); }}
              placeholder={t('library.renamePlaceholder')}
              placeholderTextColor={colors.textSubtle}
              style={[styles.renameInput, { color: colors.text, borderColor: colors.borderStrong, backgroundColor: colors.background, borderRadius: radius.sm, fontFamily: typography.body }]}
              returnKeyType="done"
            />
            <View style={styles.renameActions}>
              <AnimatedPressable onPress={() => setRenameId(null)} style={styles.renameButton}><Text style={[styles.renameButtonText, { color: colors.textMuted, fontFamily: typography.medium }]}>{t('common.cancel')}</Text></AnimatedPressable>
              <AnimatedPressable disabled={renameBusy || !renameValue.trim()} onPress={() => { void saveRename(); }} style={[styles.renameButton, { backgroundColor: colors.accent, borderRadius: radius.sm }]}><Text style={[styles.renameButtonText, { color: colors.white, fontFamily: typography.medium }]}>{t('library.saveName')}</Text></AnimatedPressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Menu Modal for session (.sidebar-more-popover pattern) */}
      <Modal
        visible={Boolean(actionSession)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSession(null)}
      >
        <Pressable
          accessibilityLabel={t('common.close') || 'Close'}
          onPress={() => setActionSession(null)}
          style={[styles.modalCenteredBackdrop, { backgroundColor: colors.scrim }]}
        >
          <View
            style={[
              styles.actionMenuCard,
              {
                backgroundColor: colors.surfaceRaised,
                borderColor: withAlpha(colors.border, 0.4),
                borderRadius: 12,
              },
            ]}
          >
            <View style={[styles.actionMenuHeader, { borderBottomColor: withAlpha(colors.border, 0.5) }]}>
              <Text numberOfLines={1} style={[styles.actionMenuTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                {String(actionSession?.title || actionSession?.topic || t('library.untitled'))}
              </Text>
              <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setActionSession(null)} style={styles.actionMenuCloseBtn}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            <View style={styles.actionMenuItems}>
              {/* Rename */}
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  const s = actionSession;
                  setActionSession(null);
                  if (s) {
                    setRenameId(String(s.id));
                    setRenameValue(String(s.title || s.topic || ''));
                  }
                }}
                style={styles.actionMenuItem}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.actionMenuText, { color: colors.text, fontFamily: typography.body }]}>
                  {t('library.rename') || 'Rename'}
                </Text>
              </AnimatedPressable>

              {/* Pin / Unpin */}
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  const s = actionSession;
                  setActionSession(null);
                  if (s) {
                    void appStore
                      .togglePinnedSession(s as unknown as Pick<Session, 'id' | 'pinned'>)
                      .catch((caught) =>
                        setError(caught instanceof Error ? caught.message : t('library.refreshFailed')),
                      );
                  }
                }}
                style={styles.actionMenuItem}
              >
                <Ionicons
                  name={actionSession?.pinned ? 'pin' : 'pin-outline'}
                  size={16}
                  color={actionSession?.pinned ? colors.accent : colors.textMuted}
                />
                <Text style={[styles.actionMenuText, { color: colors.text, fontFamily: typography.body }]}>
                  {actionSession?.pinned ? (t('library.unpin') || 'Unpin') : (t('library.pin') || 'Pin')}
                </Text>
              </AnimatedPressable>

              {/* Archive */}
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  const s = actionSession;
                  setActionSession(null);
                  if (s) {
                    void appStore
                      .archiveSession(String(s.id))
                      .catch((caught) =>
                        setError(caught instanceof Error ? caught.message : t('library.refreshFailed')),
                      );
                  }
                }}
                style={styles.actionMenuItem}
              >
                <Ionicons name="archive-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.actionMenuText, { color: colors.text, fontFamily: typography.body }]}>
                  {t('library.archive') || 'Archive'}
                </Text>
              </AnimatedPressable>

              {/* Delete */}
              <AnimatedPressable
                accessibilityRole="button"
                onPress={() => {
                  const s = actionSession;
                  setActionSession(null);
                  if (s) {
                    setPendingDeleteSessionId(String(s.id));
                  }
                }}
                style={[styles.actionMenuItem, { marginTop: 4 }]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={[styles.actionMenuText, { color: colors.danger, fontFamily: typography.body }]}>
                  {t('library.deleteChat') || 'Delete chat'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        visible={Boolean(pendingDeleteSessionId)}
        title={t('library.deleteChat') || 'Delete chat'}
        message={t('library.deleteChatConfirm') || 'This chat will be permanently deleted.'}
        confirmLabel={t('common.delete') || 'Delete'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setPendingDeleteSessionId(null)}
        onConfirm={confirmDeleteSession}
      />
    </Screen>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* Port of `formatRelativeTime` in `frontend/src/react/session-list/
 * sessionList.bridge.ts` — same buckets and same ( untranslated ) wording, so
 * a row reads identically on both clients. Built lazily: Hermes costs ~0.1ms
 * per DateTimeFormat, and this runs for every visible row. */
let shortDateFormatter: Intl.DateTimeFormat | null = null;
function shortDate(ts: number): string {
  if (!shortDateFormatter) shortDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return shortDateFormatter.format(ts);
}

function formatRelativeTime(rawDate: unknown): string {
  if (!rawDate) return '';
  const ts = new Date(String(rawDate)).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return shortDate(ts);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/* Session mode for the tinted 6px badge — exam kind wins, then mode.
 * (.recent-mode-badge, styles.css:551-556) */
function sessionMode(item: Record<string, unknown>): 'chat' | 'tutor' | 'exam' {
  if (String(item.kind || '') === 'exam') return 'exam';
  return String(item.mode || 'chat') === 'tutor' ? 'tutor' : 'chat';
}

function modeDotColor(item: Record<string, unknown>, isDark: boolean): string {
  const mode = sessionMode(item);
  if (isDark) {
    return mode === 'chat' ? 'hsl(0, 0%, 88%)' : mode === 'tutor' ? 'hsl(0, 0%, 72%)' : 'hsl(0, 0%, 60%)';
  }
  return mode === 'chat' ? 'hsl(0, 0%, 20%)' : mode === 'tutor' ? 'hsl(0, 0%, 40%)' : 'hsl(0, 0%, 55%)';
}

function modeDotLabel(item: Record<string, unknown>, t: (key: string) => string): string {
  const mode = sessionMode(item);
  return mode === 'exam' ? t('session.badgeExam') : mode === 'tutor' ? t('tutor.modeTutor') : t('tutor.modeChat');
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  tabs: {
    minHeight: 48,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  tabText: { fontSize: 13 },
  refresh: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  filterChipsRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    position: 'relative',
  },
  filterChipActive: {},
  filterChipText: {
    fontSize: 11,
  },
  filterChipIndicator: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 1,
    height: 1.5,
    borderRadius: 1,
    opacity: 0.85,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  timeLabelWrap: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingVertical: 6,
  },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modeDot: { width: 6, height: 6, borderRadius: 3 },
  title: { fontSize: 14, flexShrink: 1 },
  preview: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  more: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 16, marginTop: 12 },
  emptyAction: { marginTop: 14, minHeight: 34, paddingHorizontal: 14, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  emptyActionText: { fontSize: 13 },
  loadingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingCopy: { flex: 1, minWidth: 0, gap: 7 },
  error: { fontSize: 12, lineHeight: 18, marginHorizontal: 16, marginTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  modalCenteredBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  previewModal: { maxHeight: '88%', minHeight: '42%', borderWidth: 1, padding: 18 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  previewTitleWrap: { flex: 1, minWidth: 0 },
  previewTitle: { fontSize: 17 },
  previewMime: { fontSize: 11, marginTop: 4 },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  previewScroll: { flex: 1 },
  previewContent: { paddingVertical: 10 },
  previewText: { fontSize: 13, lineHeight: 20 },
  truncated: { fontSize: 11, lineHeight: 16, paddingTop: 12 },
  renameCard: { width: '100%', maxWidth: 380, borderWidth: 0.5, padding: 18 },
  renameTitle: { fontSize: 16, marginBottom: 12 },
  renameInput: { minHeight: 44, borderWidth: 0.5, paddingHorizontal: 12, fontSize: 14 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 14 },
  renameButton: { minHeight: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  renameButtonText: { fontSize: 13 },
  actionMenuCard: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 0.5,
    padding: 8,
    gap: 4,
  },
  actionMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionMenuTitle: {
    fontSize: 13,
    flex: 1,
  },
  actionMenuCloseBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMenuItems: {
    paddingTop: 4,
    gap: 2,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 7,
  },
  actionMenuText: {
    fontSize: 13,
  },
});
