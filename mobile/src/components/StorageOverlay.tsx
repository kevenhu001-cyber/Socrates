import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import { ConfirmDialog } from './ConfirmDialog';
import { useAppStore } from '../stores/appStore';
import { appStore } from '../stores/appStore';

export interface StorageOverlayProps {
  visible: boolean;
  onClose: () => void;
}

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  sizeBytes: number;
}

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

export function StorageOverlay({ visible, onClose }: StorageOverlayProps) {
  const { colors, radius, typography, spacing, contentWidth } = useTheme();
  const t = useT();
  const state = useAppStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [clearError, setClearError] = useState('');

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setBusy(true);
    Promise.resolve().then(() => {
      if (!active) return;
      const sessionSize = state.sessions.reduce((sum, s) => sum + estimateObjectSize(s), 0);
      const messageSize = state.sessions.reduce(
        (sum, s) => sum + (s.messages || []).reduce((m, msg) => m + estimateObjectSize(msg), 0),
        0
      );
      const attachmentsSize = state.sessions.reduce(
        (sum, s) =>
          sum +
          (s.messages || []).reduce(
            (m, msg) => m + (msg.attachments || []).reduce((a, at) => a + estimateObjectSize(at), 0),
            0
          ),
        0
      );
      const userSize = estimateObjectSize(state.user);
      const draftSize = state.draft ? state.draft.length : 0;
      const total = sessionSize + messageSize + attachmentsSize + userSize + draftSize;
      setRows([
        { icon: 'chatbubbles-outline', label: t('storage.sessions') || 'Sessions', detail: `${state.sessions.length}`, sizeBytes: sessionSize },
        { icon: 'text-outline', label: t('storage.messages') || 'Messages', detail: '-', sizeBytes: messageSize },
        { icon: 'attach-outline', label: t('storage.attachments') || 'Attachments', detail: '-', sizeBytes: attachmentsSize },
        { icon: 'person-outline', label: t('storage.userProfile') || 'User profile', detail: state.user?.email || '-', sizeBytes: userSize },
        { icon: 'create-outline', label: t('storage.draft') || 'Draft', detail: '-', sizeBytes: draftSize },
        { icon: 'layers-outline', label: t('storage.total') || 'Total', detail: bytes(total), sizeBytes: total },
      ]);
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [visible, state, t]);

  const onClearCache = () => setClearArmed(true);

  const confirmClearCache = async () => {
    setClearArmed(false);
    try {
      await appStore.clearLocalCache();
      /* The store cleared its in-memory state; re-render with
       * zeroed sizes so the rows update immediately. The next
       * `refreshSessions()` rebuilds the cache from server. */
      setRows((prev) => prev.map((r) => ({ ...r, sizeBytes: 0 })));
    } catch (caught) {
      setClearError(caught instanceof Error ? caught.message : 'Cache clear failed');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel="Close storage"
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
      >
        <View style={styles.center}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: 14,
                paddingHorizontal: spacing.md,
                paddingTop: spacing.md,
                paddingBottom: spacing.sm,
                maxWidth: Math.min(460, contentWidth),
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text, fontFamily: typography.display }]}>
                {t('storage.heading') || 'Storage'}
              </Text>
              <AnimatedPressable onPress={onClose} accessibilityLabel="Close storage" style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </AnimatedPressable>
            </View>

            {busy ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 380, marginTop: spacing.sm }}>
                {rows.map((row) => (
                  <View
                    key={row.label}
                    style={[
                      styles.row,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        paddingVertical: spacing.sm,
                      },
                    ]}
                  >
                    <Ionicons name={row.icon} size={18} color={colors.textMuted} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, { color: colors.text }]}>{row.label}</Text>
                      <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>
                        {row.detail}
                      </Text>
                    </View>
                    <Text style={[styles.rowSize, { color: colors.textMuted, fontFamily: typography.semibold }]}>
                      {bytes(row.sizeBytes)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={[styles.actions, { gap: spacing.sm, marginTop: spacing.sm }]}>
              {clearError ? (
                <Text style={[styles.clearError, { color: colors.danger }]}>{clearError}</Text>
              ) : null}
              <AnimatedPressable
                accessibilityLabel={t('storage.clear') || 'Clear cache'}
                onPress={() => { setClearError(''); onClearCache(); }}
                style={[
                  styles.danger,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.danger,
                    borderRadius: radius.md,
                    paddingVertical: 12,
                  },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.dangerText, { color: colors.danger, fontFamily: typography.semibold }]}>
                  {t('storage.clear') || 'Clear local cache'}
                </Text>
              </AnimatedPressable>
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
          </Pressable>
        </View>
      </Pressable>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  /* frontend storage dialog: width min(560px, 92vw), radius 14px. */
  card: { width: '100%', maxWidth: 560, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18 },
  closeBtn: { padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 13 },
  rowDetail: { fontSize: 11, marginTop: 2 },
  rowSize: { fontSize: 12 },
  actions: {},
  clearError: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  danger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth },
  dangerText: { fontSize: 14 },
  closeAction: { alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14 },
});
