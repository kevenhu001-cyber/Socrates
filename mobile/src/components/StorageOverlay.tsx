import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { ConfirmDialog } from './ConfirmDialog';
import { Overlay } from './Overlay';
import { useAppStore } from '../stores/appStore';
import { appStore } from '../stores/appStore';
import { toast } from './Toast';

export interface StorageOverlayProps {
  visible: boolean;
  onClose: () => void;
}

const ARCHIVE_RETENTION_DAYS = 30;

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function estimateObjectSize(value: unknown): number {
  try {
    return JSON.stringify(value ?? '').length;
  } catch {
    return 0;
  }
}

/* Mirrors `frontend/src/react/storageModal/StorageModal.tsx`: archived
 * sessions live up to 30 days before the server purges them; each row
 * shows the title, how long ago it was archived, how many days remain,
 * and Restore / Delete-forever actions. */
export function StorageOverlay({ visible, onClose }: StorageOverlayProps) {
  const { colors, radius, typography, spacing, contentWidth } = useTheme();
  const t = useT();
  const sessions = useAppStore((s) => s.sessions);
  const user = useAppStore((s) => s.user);
  const draft = useAppStore((s) => s.draft);
  const [archived, setArchived] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [clearError, setClearError] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setBusy(true);
    setLoadError(false);
    setNow(Date.now());
    appStore.listArchivedSessions()
      .then((list) => {
        if (!active) return;
        setArchived(list.sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt))));
        setBusy(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const onRestore = (session: Session) => {
    if (busyId) return;
    setBusyId(session.id);
    appStore.restoreSession(session.id)
      .then(() => {
        setArchived((prev) => prev.filter((item) => item.id !== session.id));
        toast.show(t('library.restored') || 'Restored', 'success');
      })
      .catch((caught) => {
        toast.show(caught instanceof Error ? caught.message : 'Restore failed', 'error');
      })
      .finally(() => setBusyId(null));
  };

  const onPurge = () => {
    const target = purgeTarget;
    setPurgeTarget(null);
    if (!target || busyId) return;
    setBusyId(target.id);
    appStore.purgeSession(target.id)
      .then(() => {
        setArchived((prev) => prev.filter((item) => item.id !== target.id));
        toast.show(t('library.deleted') || 'Deleted', 'success');
      })
      .catch((caught) => {
        toast.show(caught instanceof Error ? caught.message : 'Delete failed', 'error');
      })
      .finally(() => setBusyId(null));
  };

  const sessionSize = sessions.reduce((sum, s) => sum + estimateObjectSize(s), 0);
  const messageSize = sessions.reduce(
    (sum, s) => sum + (s.messages || []).reduce((m, msg) => m + estimateObjectSize(msg), 0),
    0
  );
  const attachmentsSize = sessions.reduce(
    (sum, s) =>
      sum +
      (s.messages || []).reduce(
        (m, msg) => m + (msg.attachments || []).reduce((a, at) => a + estimateObjectSize(at), 0),
        0
      ),
    0
  );
  const userSize = estimateObjectSize(user);
  const draftSize = draft ? draft.length : 0;
  const totalSize = sessionSize + messageSize + attachmentsSize + userSize + draftSize;

  const onClearCache = () => setClearArmed(true);

  const confirmClearCache = async () => {
    setClearArmed(false);
    try {
      await appStore.clearLocalCache();
    } catch (caught) {
      setClearError(caught instanceof Error ? caught.message : 'Cache clear failed');
    }
  };

  return (
    <>
      <Overlay
        visible={visible}
        onClose={onClose}
        maxWidth={Math.min(460, contentWidth)}
        testID="storage-overlay"
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 14,
            paddingHorizontal: spacing.md,
            paddingTop: spacing.md,
            paddingBottom: spacing.sm,
          },
        ]}
      >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text, fontFamily: typography.display }]}>
                {t('profile.archivedSessions') === 'profile.archivedSessions' ? 'Archived sessions' : t('profile.archivedSessions')} ({archived.length})
              </Text>
              <AnimatedPressable onPress={onClose} accessibilityLabel={t('storage.close')} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            <Text style={[styles.desc, { color: colors.textMuted, fontFamily: typography.body }]}>
              {t('storage.archivedDesc')}
            </Text>

            {busy ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 300, marginTop: spacing.xs }}>
                {loadError ? (
                  <Text style={[styles.empty, { color: colors.danger, fontFamily: typography.body }]}>
                    {t('storage.archivedFailed')}
                  </Text>
                ) : archived.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Ionicons name="archive-outline" size={28} color={colors.textMuted} />
                    <Text style={[styles.empty, { color: colors.textMuted, fontFamily: typography.body }]}>
                      {t('storage.archivedEmpty')}
                    </Text>
                  </View>
                ) : (
                  archived.map((session) => {
                    const archivedMs = session.archivedAt ? new Date(session.archivedAt).getTime() : 0;
                    const ageDays = Math.max(0, Math.floor((now - archivedMs) / (24 * 60 * 60 * 1000)));
                    const remain = Math.max(0, ARCHIVE_RETENTION_DAYS - ageDays);
                    const meta = t('storage.archivedMeta', {
                      age: t(ageDays === 1 ? 'storage.daysAgo' : 'storage.daysAgoPlural', { count: ageDays }),
                      left: t(remain === 1 ? 'storage.daysLeft' : 'storage.daysLeftPlural', { count: remain }),
                    });
                    const rowBusy = busyId === session.id;
                    return (
                      <View
                        key={session.id}
                        style={[
                          styles.archivedRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            paddingVertical: spacing.sm,
                          },
                        ]}
                      >
                        <View style={styles.rowText}>
                          <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                            {session.title || session.topic || '(untitled)'}
                          </Text>
                          <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
                            {meta}
                            {typeof session.totalQ === 'number' && session.totalQ > 0
                              ? ` · ${session.totalQ === 1 ? t('session.questionCountOne') : t('session.questionCount', { n: session.totalQ })}`
                              : ''}
                          </Text>
                        </View>
                        <AnimatedPressable
                          accessibilityLabel={t('storage.restore') || 'Restore'}
                          disabled={busyId != null}
                          onPress={() => onRestore(session)}
                          style={[styles.rowAction, { borderColor: colors.border, borderRadius: radius.sm }]}
                        >
                          {rowBusy ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <Text style={[styles.rowActionText, { color: colors.accent, fontFamily: typography.semibold }]}>
                              {t('storage.restore')}
                            </Text>
                          )}
                        </AnimatedPressable>
                        <AnimatedPressable
                          accessibilityLabel={t('storage.deleteForever') || 'Delete forever'}
                          disabled={busyId != null}
                          onPress={() => setPurgeTarget(session)}
                          style={[styles.rowAction, { borderColor: colors.danger, borderRadius: radius.sm }]}
                        >
                          <Text style={[styles.rowActionText, { color: colors.danger, fontFamily: typography.semibold }]}>
                            {t('storage.deleteForever')}
                          </Text>
                        </AnimatedPressable>
                      </View>
                    );
                  })
                )}

                <View style={[styles.cacheSection, { borderTopColor: colors.border, marginTop: spacing.sm }]}>
                  <Text style={[styles.cacheTitle, { color: colors.textMuted, fontFamily: typography.semibold }]}>
                    {t('storage.localCache')}
                  </Text>
                  <View style={styles.cacheRow}>
                    <Ionicons name="layers-outline" size={16} color={colors.textMuted} />
                    <Text style={[styles.rowDetail, { color: colors.textMuted, flex: 1 }]}>
                      {`${sessions.length} ${t('storage.sessions')}`}
                    </Text>
                    <Text style={[styles.rowSize, { color: colors.textMuted, fontFamily: typography.semibold }]}>
                      {bytes(totalSize)}
                    </Text>
                  </View>
                  {clearError ? (
                    <Text style={[styles.clearError, { color: colors.danger }]}>{clearError}</Text>
                  ) : null}
                  <AnimatedPressable
                    accessibilityLabel={t('storage.clear') || 'Clear local cache'}
                    onPress={() => { setClearError(''); onClearCache(); }}
                    style={[
                      styles.danger,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.danger,
                        borderRadius: radius.md,
                        paddingVertical: 10,
                        marginTop: spacing.xs,
                      },
                    ]}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.dangerText, { color: colors.danger, fontFamily: typography.semibold }]}>
                      {t('storage.clear')}
                    </Text>
                  </AnimatedPressable>
                </View>
              </ScrollView>
            )}

            <View style={[styles.actions, { marginTop: spacing.sm }]}>
              <AnimatedPressable
                accessibilityLabel={t('common.close') || 'Close'}
                onPress={onClose}
                style={[
                  styles.closeAction,
                  {
                    backgroundColor: colors.surfaceHover,
                    borderRadius: radius.md,
                    paddingVertical: 12,
                  },
                ]}
              >
                <Text style={[styles.closeText, { color: colors.text, fontFamily: typography.semibold }]}>
                  {t('common.close') || 'Close'}
                </Text>
              </AnimatedPressable>
            </View>
      </Overlay>
      <ConfirmDialog
        visible={clearArmed}
        title={t('storage.clearConfirmTitle') || 'Clear local cache?'}
        message={t('storage.clearConfirmBody') || 'This will remove cached sessions and drafts. Cloud data is not affected.'}
        confirmLabel={t('storage.clear') || 'Clear'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setClearArmed(false)}
        onConfirm={() => { void confirmClearCache(); }}
      />
      <ConfirmDialog
        visible={purgeTarget != null}
        title={t('storage.deleteForeverTitle') || 'Delete forever?'}
        message={t('storage.deleteForeverBody', { title: purgeTarget?.title || purgeTarget?.topic || '' })}
        confirmLabel={t('storage.deleteForever') || 'Delete forever'}
        cancelLabel={t('common.cancel') || 'Cancel'}
        danger
        onCancel={() => setPurgeTarget(null)}
        onConfirm={onPurge}
      />
    </>
  );
}

const styles = StyleSheet.create({
  /* frontend storage dialog: width min(560px, 92vw), radius 14px. */
  card: { width: '100%', maxWidth: 560, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18 },
  closeBtn: { padding: 6 },
  desc: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  archivedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 13 },
  rowDetail: { fontSize: 11, marginTop: 2 },
  rowAction: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: 'center',
  },
  rowActionText: { fontSize: 12 },
  emptyWrap: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  empty: { fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  cacheSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  cacheTitle: { fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  cacheRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSize: { fontSize: 12 },
  actions: {},
  clearError: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  dangerText: { fontSize: 13 },
  closeAction: { alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14 },
});
