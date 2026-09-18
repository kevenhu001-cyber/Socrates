import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { JsonValue, KnowledgeNode } from '@socrates/contracts';
import { knowledgeApi } from '../data/api/client';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppHeader } from '../components/AppHeader';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/theme';
import { useT } from '../i18n';
import { appStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Knowledge'>;

type GraphPoint = {
  item: KnowledgeNode;
  x: number;
  y: number;
  r: number;
};

function displayName(item: KnowledgeNode, index = 0) {
  return item.nodeName || item.sessionTitle || `Node ${index + 1}`;
}

function statusBucket(status: string) {
  return status === 'internalized' ? 'internalized' : status === 'fuzzy' ? 'fuzzy' : 'blank';
}

function buildGraphLayout(items: KnowledgeNode[], width: number, height: number): GraphPoint[] {
  const count = items.length;
  if (!count) return [];
  const cx = width / 2;
  const cy = height / 2;
  const orbit = Math.max(54, Math.min(width, height) * 0.34);

  const points = items.map((item, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const questions = Math.max(0, Number(item.questions || item.verifiedCount || 0));
    const r = Math.min(24, 13 + Math.sqrt(questions) * 2.2);
    return {
      item,
      x: cx + Math.cos(angle) * orbit,
      y: cy + Math.sin(angle) * orbit,
      r,
    };
  });

  const pad = 34;
  for (let iteration = 0; iteration < 70; iteration += 1) {
    const temp = 1 - iteration / 70;
    const displacement = points.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const distance = Math.max(4, Math.sqrt(dx * dx + dy * dy));
        const force = 1450 / (distance * distance);
        const ux = dx / distance;
        const uy = dy / distance;
        displacement[i].x += ux * force;
        displacement[i].y += uy * force;
        displacement[j].x -= ux * force;
        displacement[j].y -= uy * force;
      }
    }

    for (let i = 0; i < points.length - 1; i += 1) {
      const dx = points[i].x - points[i + 1].x;
      const dy = points[i].y - points[i + 1].y;
      const distance = Math.max(4, Math.sqrt(dx * dx + dy * dy));
      const target = 74;
      const force = (distance - target) * 0.012;
      const ux = dx / distance;
      const uy = dy / distance;
      displacement[i].x -= ux * force;
      displacement[i].y -= uy * force;
      displacement[i + 1].x += ux * force;
      displacement[i + 1].y += uy * force;
    }

    points.forEach((point, index) => {
      displacement[index].x += (cx - point.x) * 0.012;
      displacement[index].y += (cy - point.y) * 0.012;
      const length = Math.max(0.001, Math.sqrt(
        displacement[index].x * displacement[index].x
        + displacement[index].y * displacement[index].y,
      ));
      const step = Math.min(length, 5.5 * temp + 0.4);
      point.x = Math.max(pad, Math.min(width - pad, point.x + displacement[index].x / length * step));
      point.y = Math.max(pad, Math.min(height - pad, point.y + displacement[index].y / length * step));
    });
  }

  return points;
}

function historyEntries(history: JsonValue[] | undefined) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry): entry is Record<string, JsonValue> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .slice(-8)
    .reverse();
}

export function KnowledgeScreen({ navigation }: Props) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const { width: viewportWidth } = useWindowDimensions();
  const [items, setItems] = useState<KnowledgeNode[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await knowledgeApi.list();
      setItems(result.items);
      setSummary(result.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('knowledge.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeNode>();
    items.forEach((item) => {
      const key = item.nodeName || `${item.sessionId}:${item.nodeIndex ?? 0}`;
      const existing = map.get(key);
      if (!existing || statusPriority(item.status) > statusPriority(existing.status)) map.set(key, item);
    });
    return [...map.values()];
  }, [items]);

  const sections = useMemo(() => ({
    internalized: grouped.filter((item) => statusBucket(item.status) === 'internalized'),
    fuzzy: grouped.filter((item) => statusBucket(item.status) === 'fuzzy'),
    blank: grouped.filter((item) => statusBucket(item.status) === 'blank'),
  }), [grouped]);

  const graphWidth = Math.max(280, Math.min(700, viewportWidth - 28));
  const graphHeight = Math.max(250, Math.min(320, graphWidth * 0.72));
  const graphPoints = useMemo(
    () => buildGraphLayout(grouped.slice(0, 36), graphWidth, graphHeight),
    [graphHeight, graphWidth, grouped],
  );

  const openDetail = (item: KnowledgeNode) => {
    setSelected(item);
    setNoteDraft(item.userNote || '');
  };

  const applyUpdatedNode = (updated: KnowledgeNode) => {
    setItems((current) => current.map((item) =>
      item.sessionId === updated.sessionId && item.nodeIndex === updated.nodeIndex
        ? { ...item, ...updated }
        : item,
    ));
    setSelected(updated);
    setNoteDraft(updated.userNote || '');
  };

  const updateNode = async (patch: { confidenceScore?: number; userNote?: string }) => {
    if (!selected || selected.nodeIndex === undefined) return;
    setSaving(true);
    setError('');
    try {
      const updated = await knowledgeApi.updateNode({
        sessionId: selected.sessionId,
        nodeIndex: selected.nodeIndex,
        ...patch,
      });
      applyUpdatedNode(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('knowledge.loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  const jumpToNode = async () => {
    if (!selected || selected.nodeIndex === undefined) return;
    const ok = await appStore.jumpToTutorNode(selected.sessionId, selected.nodeIndex);
    if (ok) {
      setSelected(null);
      navigation.navigate('Chat');
    }
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title={t('knowledge.heading')}
        onNewChat={() => {
          appStore.startNewSession('chat');
          navigation.navigate('Home');
        }}
      />

      {error ? (
        <Text style={[styles.error, { color: colors.danger, fontFamily: typography.body }]}>
          {error}
        </Text>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : grouped.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily: typography.display }]}>
            {t('knowledge.emptyTitle')}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted, fontFamily: typography.body }]}>
            {t('knowledge.emptyBody')}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.fileTitle, { color: colors.text, fontFamily: typography.display }]}>
                {t('tutor.kbFileTitle') === 'tutor.kbFileTitle' ? 'Knowledge Boundary' : t('tutor.kbFileTitle')}
              </Text>
              <Text style={[styles.updated, { color: colors.textSubtle, fontFamily: typography.body }]}>
                {t('knowledge.total', { count: summary.total || grouped.length })}
              </Text>
            </View>
            <View style={styles.legend}>
              {(['internalized', 'fuzzy', 'blank'] as const).map((status) => (
                <View key={status} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: statusColor(status, colors) }]} />
                  <Text style={[styles.legendText, { color: colors.textMuted, fontFamily: typography.body }]}>
                    {t(`knowledge.${status}`)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View
            style={[
              styles.graphCard,
              {
                width: graphWidth,
                backgroundColor: colors.surface,
                borderColor: withAlpha(colors.border, 0.4),
                borderRadius: radius.lg,
              },
            ]}
          >
            <Text style={[styles.graphCaption, { color: colors.textSubtle, fontFamily: typography.body }]}>
              {t('knowledge.graphCaption') === 'knowledge.graphCaption'
                ? 'Knowledge map · color = mastery · size = questions'
                : t('knowledge.graphCaption')}
            </Text>
            <Svg width={graphWidth - 2} height={graphHeight}>
              <G>
                {graphPoints.slice(0, -1).map((point, index) => {
                  const next = graphPoints[index + 1];
                  return (
                    <Line
                      key={`edge-${index}`}
                      x1={point.x}
                      y1={point.y}
                      x2={next.x}
                      y2={next.y}
                      stroke={withAlpha(colors.borderStrong, 0.55)}
                      strokeWidth={1}
                    />
                  );
                })}
              </G>
              {graphPoints.map((point, index) => {
                const confidence = Math.max(0, Math.min(5, Number(point.item.confidenceScore || 0)));
                const opacity = 0.35 + confidence * 0.13;
                const label = displayName(point.item, index);
                const short = label.length > 10 ? `${label.slice(0, 9)}…` : label;
                return (
                  <G
                    key={`${point.item.sessionId}:${point.item.nodeIndex ?? index}`}
                    onPress={() => openDetail(point.item)}
                  >
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={point.r}
                      fill={statusColor(point.item.status, colors)}
                      fillOpacity={opacity}
                      stroke={selected?.sessionId === point.item.sessionId && selected?.nodeIndex === point.item.nodeIndex
                        ? colors.text
                        : statusColor(point.item.status, colors)}
                      strokeWidth={selected?.sessionId === point.item.sessionId && selected?.nodeIndex === point.item.nodeIndex ? 2 : 1}
                    />
                    <SvgText
                      x={point.x}
                      y={point.y + point.r + 13}
                      fontSize="9"
                      fill={colors.textMuted}
                      textAnchor="middle"
                    >
                      {short}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </View>

          <KnowledgeSection
            title={t('tutor.kbSectionInternalized') === 'tutor.kbSectionInternalized' ? 'Internalized' : t('tutor.kbSectionInternalized')}
            items={sections.internalized}
            colors={colors}
            typography={typography}
            onPress={openDetail}
          />
          <KnowledgeSection
            title={t('tutor.kbSectionFuzzy') === 'tutor.kbSectionFuzzy' ? 'Fuzzy' : t('tutor.kbSectionFuzzy')}
            items={sections.fuzzy}
            colors={colors}
            typography={typography}
            onPress={openDetail}
          />
          <KnowledgeSection
            title={t('tutor.kbSectionBlank') === 'tutor.kbSectionBlank' ? 'Not yet explored' : t('tutor.kbSectionBlank')}
            items={sections.blank}
            colors={colors}
            typography={typography}
            onPress={openDetail}
          />
        </ScrollView>
      )}

      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.48)' }]}
          onPress={() => setSelected(null)}
        />
        {selected ? (
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.sheetHead}>
                <View style={styles.sheetTitleWrap}>
                  <Text style={[styles.sheetTitle, { color: colors.text, fontFamily: typography.semibold }]}>
                    {displayName(selected)}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: withAlpha(statusColor(selected.status, colors), 0.14) },
                    ]}
                  >
                    <Text style={{ color: statusColor(selected.status, colors), fontSize: 11, fontFamily: typography.medium }}>
                      {statusBucket(selected.status)}
                    </Text>
                  </View>
                </View>
                <AnimatedPressable onPress={() => setSelected(null)} style={styles.closeButton}>
                  <Text style={{ color: colors.textMuted, fontSize: 22 }}>×</Text>
                </AnimatedPressable>
              </View>

              <Text style={[styles.detailLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                Confidence
              </Text>
              <View style={styles.confidenceRow}>
                {[1, 2, 3, 4, 5].map((value) => {
                  const on = value <= Number(selected.confidenceScore || 0);
                  return (
                    <AnimatedPressable
                      key={value}
                      disabled={saving}
                      onPress={() => void updateNode({
                        confidenceScore: Number(selected.confidenceScore || 0) === value ? 0 : value,
                      })}
                      style={[
                        styles.confidenceDot,
                        {
                          backgroundColor: on ? colors.accent : colors.surfaceRaised,
                          borderColor: on ? colors.accent : colors.borderStrong,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              <Text style={[styles.detailLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                System note
              </Text>
              <View style={[styles.noteReadOnly, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm }]}>
                <Text style={[styles.noteText, { color: colors.textMuted, fontFamily: typography.body }]}>
                  {selected.systemNote || 'No system note yet.'}
                </Text>
              </View>

              <Text style={[styles.detailLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                Your note
              </Text>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                multiline
                placeholder={t('kb.placeholderNote') === 'kb.placeholderNote' ? 'Add a note about this knowledge point…' : t('kb.placeholderNote')}
                placeholderTextColor={colors.textSubtle}
                style={[
                  styles.noteInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radius.sm,
                    fontFamily: typography.body,
                  },
                ]}
              />
              <AnimatedPressable
                disabled={saving || noteDraft === (selected.userNote || '')}
                onPress={() => void updateNode({ userNote: noteDraft })}
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: noteDraft === (selected.userNote || '') ? colors.surfaceRaised : colors.text,
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: noteDraft === (selected.userNote || '') ? colors.textSubtle : colors.background,
                    fontFamily: typography.semibold,
                    fontSize: 12,
                  }}
                >
                  {saving ? (t('app.loading') || 'Saving…') : 'Save note'}
                </Text>
              </AnimatedPressable>

              <Text style={[styles.detailLabel, { color: colors.textSubtle, fontFamily: typography.medium }]}>
                History
              </Text>
              {historyEntries(selected.history).length ? (
                <View style={styles.historyList}>
                  {historyEntries(selected.history).map((entry, index) => (
                    <View key={index} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.historyDate, { color: colors.textSubtle, fontFamily: typography.mono }]}>
                        {String(entry.date || '')}
                      </Text>
                      <Text style={[styles.historyText, { color: colors.textMuted, fontFamily: typography.body }]}>
                        {String(entry.from || '?')} → {String(entry.to || '?')}
                        {entry.reason ? ` · ${String(entry.reason)}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.historyEmpty, { color: colors.textSubtle, fontFamily: typography.body }]}>
                  No status changes yet.
                </Text>
              )}

              <AnimatedPressable
                disabled={saving || selected.nodeIndex === undefined}
                onPress={() => { void jumpToNode(); }}
                style={[styles.goButton, { backgroundColor: colors.accent, borderRadius: radius.md }]}
              >
                <Text style={{ color: colors.textInverse, fontFamily: typography.semibold, fontSize: 13 }}>
                  → {t('tutor.continue') === 'tutor.continue' ? 'Open in Tutor' : t('tutor.continue')}
                </Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </Screen>
  );
}

function KnowledgeSection({
  title,
  items,
  colors,
  typography,
  onPress,
}: {
  title: string;
  items: KnowledgeNode[];
  colors: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['colors'];
  typography: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['typography'];
  onPress: (item: KnowledgeNode) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: typography.semibold }]}>{title}</Text>
        <Text style={[styles.sectionCount, { color: colors.textSubtle, fontFamily: typography.medium }]}>{items.length}</Text>
      </View>
      {items.map((item, index) => (
        <AnimatedPressable
          key={`${item.sessionId}:${item.nodeIndex ?? index}`}
          onPress={() => onPress(item)}
          style={[styles.row, { borderBottomColor: colors.border }]}
        >
          <View style={[styles.dot, { backgroundColor: statusColor(item.status, colors) }]} />
          <View style={styles.copy}>
            <Text style={[styles.name, { color: colors.text, fontFamily: typography.medium }]}>
              {displayName(item, index)}
            </Text>
            {item.systemNote ? (
              <Text numberOfLines={2} style={[styles.source, { color: colors.textMuted, fontFamily: typography.body }]}>
                [System] {item.systemNote}
              </Text>
            ) : null}
            {item.userNote ? (
              <Text numberOfLines={2} style={[styles.source, { color: colors.accent, fontFamily: typography.body }]}>
                [Me] {item.userNote}
              </Text>
            ) : null}
          </View>
          {Number(item.questions || item.verifiedCount || 0) > 0 ? (
            <Text style={[styles.questionCount, { color: colors.textSubtle, fontFamily: typography.mono }]}>
              {Number(item.questions || item.verifiedCount || 0)} Qs
            </Text>
          ) : null}
        </AnimatedPressable>
      ))}
    </View>
  );
}

function statusPriority(status: string) {
  return status === 'internalized' ? 3 : status === 'fuzzy' ? 2 : 1;
}

function statusColor(
  status: string,
  colors: ReturnType<typeof import('../theme/ThemeProvider').useTheme>['colors'],
) {
  return status === 'internalized'
    ? colors.success
    : status === 'fuzzy'
      ? colors.accent
      : colors.textSubtle;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  scroll: { paddingHorizontal: 14, paddingBottom: 34 },
  error: { marginHorizontal: 18, marginTop: 8, fontSize: 12, lineHeight: 18 },
  loading: { marginTop: 50 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 130 },
  emptyTitle: { fontSize: 24, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  headerRow: { paddingHorizontal: 4, paddingTop: 16, paddingBottom: 14, gap: 12 },
  fileTitle: { fontSize: 26, lineHeight: 34 },
  updated: { fontSize: 11, marginTop: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 10.5 },
  dot: { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  graphCard: { alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  graphCaption: { fontSize: 10.5, paddingHorizontal: 12, paddingTop: 10 },
  section: { marginTop: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, marginBottom: 4 },
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCount: { fontSize: 11 },
  row: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 8 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 19 },
  source: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  questionCount: { fontSize: 10.5 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '84%', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18, paddingBottom: 24 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.45)', alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitleWrap: { flex: 1, gap: 7 },
  sheetTitle: { fontSize: 20, lineHeight: 27 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  detailLabel: { marginTop: 20, marginBottom: 7, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.7 },
  confidenceRow: { flexDirection: 'row', gap: 10 },
  confidenceDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
  noteReadOnly: { borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  noteText: { fontSize: 12, lineHeight: 18 },
  noteInput: { minHeight: 84, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, lineHeight: 19, textAlignVertical: 'top' },
  saveButton: { minHeight: 38, marginTop: 8, paddingHorizontal: 14, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' },
  historyList: {},
  historyRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 3 },
  historyDate: { fontSize: 10 },
  historyText: { fontSize: 11.5, lineHeight: 17 },
  historyEmpty: { fontSize: 12, lineHeight: 18 },
  goButton: { minHeight: 48, marginTop: 24, alignItems: 'center', justifyContent: 'center' },
});
