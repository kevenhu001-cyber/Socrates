import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { fontStyle, getThemePaletteHex } from '@socrates/theme';
import type { UiLanguage } from './strings';
import { uiStrings } from './strings';
import { KNOWLEDGE_GRAPH_HEIGHT, KNOWLEDGE_GRAPH_WIDTH, knowledgeNodeRadius, layoutKnowledgeGraph } from './knowledgeGraph';
import { getTutorLegacyPalette, tutorRgba } from './tutorTheme';

type UiMode = 'light' | 'dark';
const WEB_APP_TUTOR_SCALE = Platform.OS === 'web' ? 1.125 : 1;
const WEB_SIDEBAR_TUTOR_SCALE = Platform.OS === 'web' ? 1.035 : 1;

function tutorLineHeight(compact: boolean): number | undefined {
  if (Platform.OS !== 'web') return undefined;
  return compact ? 15.525 : 20;
}

export interface KnowledgeBoundaryNode {
  name?: string;
  status?: 'internalized' | 'fuzzy' | 'blank' | string;
  questions?: number;
  verifiedCount?: number;
  confidence_score?: number;
  system_note?: string;
  user_note?: string;
}

export interface BoundarySnapshot {
  date?: string;
  at?: number;
  summary?: string;
}

type KnowledgeStatus = 'internalized' | 'fuzzy' | 'blank';

function normalizedStatus(status?: string): KnowledgeStatus {
  return status === 'internalized' || status === 'fuzzy' ? status : 'blank';
}

function statusColor(status: KnowledgeStatus, muted: string): string {
  /* Exact measured SPA computed fills (`hsl(145 50% 50%)` /
   * `hsl(43 77% 62%)`); blank falls back to the muted step. */
  if (status === 'internalized') return '#40BF75';
  if (status === 'fuzzy') return '#E9BE53';
  return muted;
}

/** Baseline rounds every graph coordinate to 1 decimal (`toFixed(1)`). */
function graphCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function shortNodeName(value: string, fallback: string): string {
  const name = value || fallback;
  return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}

function dateOf(snapshot: BoundarySnapshot): string {
  if (snapshot.date) return snapshot.date;
  if (typeof snapshot.at === 'number') {
    try { return new Date(snapshot.at).toISOString().slice(0, 10); } catch { return ''; }
  }
  return '';
}

function Graph({
  nodes,
  currentNode,
  mode,
  language,
  compact,
  onSelect,
}: {
  nodes: KnowledgeBoundaryNode[];
  currentNode: number;
  mode: UiMode;
  language: UiLanguage;
  compact: boolean;
  onSelect(index: number): void;
}) {
  const p = getThemePaletteHex(mode);
  const legacy = getTutorLegacyPalette(mode);
  const t = uiStrings(language);
  const points = useMemo(() => layoutKnowledgeGraph(nodes), [nodes]);
  if (!nodes.length) return null;

  return (
      <View testID="socrates-kb-graph-wrap" style={styles.graphWrap}>
      <Text testID="socrates-kb-graph-caption" style={[styles.graphCaption, { color: p.text.muted, fontSize: 10 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: tutorLineHeight(compact) }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.knowledgeGraphCaption}</Text>
      <View
        testID="socrates-kb-graph-frame"
        style={[styles.graphFrame, { borderWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth, aspectRatio: Platform.OS === 'web' ? 1.3293 : 4 / 3, backgroundColor: `${legacy.bg.raised}66`, borderColor: tutorRgba(legacy.border, 0.3) }]}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${KNOWLEDGE_GRAPH_WIDTH} ${KNOWLEDGE_GRAPH_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
          {nodes.slice(0, -1).map((_, index) => (
            <Line
              key={`edge-${index}`}
              x1={graphCoord(points[index].x)}
              y1={graphCoord(points[index].y)}
              x2={graphCoord(points[index + 1].x)}
              y2={graphCoord(points[index + 1].y)}
              stroke={legacy.border}
              strokeWidth={1.2}
            />
          ))}
          {nodes.map((node, index) => {
            const point = points[index];
            const status = normalizedStatus(node.status);
            const radius = graphCoord(knowledgeNodeRadius(node));
            const confidence = Math.max(0, Math.min(5, typeof node.confidence_score === 'number' ? node.confidence_score : 0));
            const active = index === currentNode;
            return (
              <React.Fragment key={`node-${index}`}>
                <Circle
                  cx={graphCoord(point.x)}
                  cy={graphCoord(point.y)}
                  r={radius}
                  fill={statusColor(status, legacy.text.muted)}
                  fillOpacity={0.35 + 0.13 * confidence}
                  stroke={active ? legacy.accent : legacy.bg.card}
                  strokeWidth={active ? 2.5 : 1.5}
                />
                <SvgText
                  x={graphCoord(point.x)}
                  y={graphCoord(point.y + radius + 9)}
                  textAnchor="middle"
                  fontSize={9}
                  fill={legacy.text.caption}
                >
                  {shortNodeName(node.name || '', t.knowledgeNodeFallback(index + 1))}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
        {nodes.map((node, index) => {
          const point = points[index];
          return (
            <Pressable
              key={`hit-${index}`}
              accessibilityRole="button"
              accessibilityLabel={node.name || t.knowledgeNodeFallback(index + 1)}
              accessibilityState={{ selected: index === currentNode }}
              hitSlop={4}
              onPress={() => onSelect(index)}
              style={[styles.graphHitArea, { left: `${(point.x / KNOWLEDGE_GRAPH_WIDTH) * 100}%`, top: `${(point.y / KNOWLEDGE_GRAPH_HEIGHT) * 100}%` }]}
            />
          );
        })}
      </View>
    </View>
  );
}

export function KnowledgeBoundaryPanel({
  nodes,
  currentNode = -1,
  history = [],
  mode,
  language,
  compact = false,
  onUpdateNode,
  onSaveSnapshot,
  onJumpToNode,
}: {
  nodes: KnowledgeBoundaryNode[];
  currentNode?: number;
  history?: BoundarySnapshot[];
  mode: UiMode;
  language: UiLanguage;
  compact?: boolean;
  onUpdateNode(index: number, patch: Partial<KnowledgeBoundaryNode>): void;
  onSaveSnapshot(): void;
  onJumpToNode(index: number): void;
}) {
  const p = getThemePaletteHex(mode);
  const legacy = getTutorLegacyPalette(mode);
  const t = uiStrings(language);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const selectedNode = expandedIndex === null ? null : nodes[expandedIndex] || null;
  const selectedNote = selectedNode?.user_note || '';

  useEffect(() => { setNoteDraft(selectedNote); }, [expandedIndex, selectedNote]);
  useEffect(() => {
    if (expandedIndex === null || noteDraft === selectedNote) return undefined;
    const timer = setTimeout(() => onUpdateNode(expandedIndex, { user_note: noteDraft }), 500);
    return () => clearTimeout(timer);
  }, [expandedIndex, noteDraft, onUpdateNode, selectedNote]);

  const sections = useMemo(() => {
    const result: Record<KnowledgeStatus, Array<{ node: KnowledgeBoundaryNode; index: number }>> = {
      internalized: [], fuzzy: [], blank: [],
    };
    nodes.forEach((node, index) => result[normalizedStatus(node.status)].push({ node, index }));
    return result;
  }, [nodes]);

  const toggleDetails = (index: number) => setExpandedIndex((current) => current === index ? null : index);
  const confidenceOf = (node: KnowledgeBoundaryNode) => Math.max(0, Math.min(5, typeof node.confidence_score === 'number' ? node.confidence_score : 0));
  const statusLabel = (status: KnowledgeStatus) => status === 'internalized'
    ? t.planStatusInternalized
    : status === 'fuzzy' ? t.planStatusFuzzy : t.planStatusBlank;

  return (
    <View testID="socrates-knowledge-boundary" style={styles.panel}>
      <View testID="socrates-kb-header" style={[styles.fileHeader, { borderBottomColor: tutorRgba(legacy.border, 0.15) }]}>
        <Text style={[styles.fileTitle, { color: legacy.text.secondary, fontSize: 13 * WEB_APP_TUTOR_SCALE, lineHeight: Platform.OS === 'web' ? (compact ? 21.9375 : 20) : undefined }, fontStyle('semibold', language, Platform.OS === 'web')]}>{t.knowledgeBoundary}</Text>
        <Text testID="socrates-kb-meta" style={[styles.fileMeta, { color: p.text.muted, width: compact ? 83 : 56, fontSize: 11 * WEB_APP_TUTOR_SCALE, lineHeight: Platform.OS === 'web' ? (compact ? 18.5625 : 20) : undefined }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.lastUpdated}: {new Date().toISOString().slice(0, 10)}</Text>
        <Pressable
          testID="socrates-kb-snapshot"
          accessibilityRole="button"
          accessibilityLabel={t.saveSnapshot}
          onPress={onSaveSnapshot}
          style={[styles.snapshotButton, { borderColor: tutorRgba(legacy.border, 0.3) }]}
        >
          <Text style={[styles.snapshotText, { color: legacy.text.tertiary, fontSize: 11 * WEB_APP_TUTOR_SCALE }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.saveSnapshot}</Text>
        </Pressable>
      </View>

      {!nodes.length ? (
        <Text style={[styles.empty, { color: p.text.muted }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.emptyKnowledgeBoundary}</Text>
      ) : (
        <>
          <Graph nodes={nodes} currentNode={currentNode} mode={mode} language={language} compact={compact} onSelect={toggleDetails} />
          {(['internalized', 'fuzzy', 'blank'] as KnowledgeStatus[]).map((status) => {
            const entries = sections[status];
            if (!entries.length) return null;
            return (
              <View key={status}>
                <View style={styles.sectionTitle}>
                  <Text style={[styles.sectionText, { color: p.text.muted, fontSize: 10 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: tutorLineHeight(compact) }, fontStyle('medium', language, Platform.OS === 'web')]}>{statusLabel(status)}</Text>
                  <Text style={[styles.sectionCount, { color: p.text.muted, backgroundColor: p.bg.hover, fontSize: 10 * WEB_APP_TUTOR_SCALE, lineHeight: tutorLineHeight(compact) }, fontStyle('medium', language, Platform.OS === 'web')]}>{entries.length}</Text>
                </View>
                {entries.map(({ node, index }) => {
                  const expanded = index === expandedIndex;
                  const statusFill = statusColor(status, p.text.muted);
                  return (
                    <View key={`${index}:${node.name || ''}`}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={node.name || t.knowledgeNodeFallback(index + 1)}
                        accessibilityState={{ selected: expanded, expanded }}
                        onPress={() => toggleDetails(index)}
                        style={[styles.nodeRow]}
                      >
                        <View style={[styles.nodeDot, { backgroundColor: statusFill }]} />
                        <Text numberOfLines={1} style={[styles.nodeName, { color: legacy.text.secondary, fontSize: 12 * WEB_SIDEBAR_TUTOR_SCALE, lineHeight: tutorLineHeight(compact) }, fontStyle('medium', language, Platform.OS === 'web')]}>
                          {node.name || t.knowledgeNodeFallback(index + 1)}
                          {status === 'internalized' ? <Text style={[styles.verifiedTag, { color: '#53C683', backgroundColor: 'rgba(57,172,105,0.12)', fontSize: 10 * WEB_APP_TUTOR_SCALE }, fontStyle('medium', language, Platform.OS === 'web')]}>{` ${t.verifiedCount(node.verifiedCount || node.questions || 0)}`}</Text> : null}
                        </Text>
                        {node.questions ? <Text style={[styles.questionCount, { color: p.text.muted, fontSize: 10 * WEB_SIDEBAR_TUTOR_SCALE }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.nodeQuestions(node.questions)}</Text> : null}
                      </Pressable>
                      {expanded ? (
                        <View testID="socrates-kb-detail" style={[styles.detail, { backgroundColor: `${legacy.bg.card}99`, borderColor: tutorRgba(legacy.border, 0.18) }]}>
                          <View style={styles.detailHead}>
                            <Text style={[styles.statusBadge, { color: status === 'internalized' ? '#79D29E' : status === 'fuzzy' ? '#EDCC78' : legacy.text.caption, backgroundColor: status === 'internalized' ? 'rgba(64,191,117,0.18)' : status === 'fuzzy' ? 'rgba(233,190,83,0.18)' : p.bg.hover, fontSize: 10 * WEB_APP_TUTOR_SCALE, letterSpacing: 10 * WEB_APP_TUTOR_SCALE * 0.08 }, fontStyle('semibold', language, Platform.OS === 'web')]}>{statusLabel(status)}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={t.goToNode} onPress={() => onJumpToNode(index)} style={[styles.goButton, { backgroundColor: `${legacy.accent}1f`, borderColor: `${legacy.accent}4d` }]}>
                              <Text style={[styles.goText, { color: legacy.accent, fontSize: 11 * WEB_APP_TUTOR_SCALE }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.go}</Text>
                            </Pressable>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: p.text.muted, fontSize: 10 * WEB_APP_TUTOR_SCALE, letterSpacing: 10 * WEB_APP_TUTOR_SCALE * 0.06 }, fontStyle('semibold', language, Platform.OS === 'web')]}>{t.confidence}</Text>
                            <View style={styles.confidenceRow}>
                              {[1, 2, 3, 4, 5].map((value) => {
                                const selected = value <= confidenceOf(node);
                                return (
                                  <Pressable
                                    key={value}
                                    accessibilityRole="button"
                                    accessibilityLabel={t.confidenceSet(value)}
                                    accessibilityState={{ selected }}
                                    onPress={() => onUpdateNode(index, { confidence_score: confidenceOf(node) === value ? 0 : value })}
                                    style={[styles.confidenceDot, { borderColor: p.text.muted, backgroundColor: selected ? legacy.accent : 'transparent', ...(selected ? { borderColor: legacy.accent } : {}) }]}
                                  />
                                );
                              })}
                            </View>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: p.text.muted, fontSize: 10 * WEB_APP_TUTOR_SCALE, letterSpacing: 10 * WEB_APP_TUTOR_SCALE * 0.06 }, fontStyle('semibold', language, Platform.OS === 'web')]}>{t.systemNote}</Text>
                            <Text style={[styles.systemNote, { color: node.system_note ? legacy.text.tertiary : p.text.muted, fontSize: 12.5 * WEB_APP_TUTOR_SCALE, lineHeight: 12.5 * WEB_APP_TUTOR_SCALE * 1.55 }, fontStyle('regular', language, Platform.OS === 'web')]}>{node.system_note || t.noSystemNote}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: p.text.muted, fontSize: 10 * WEB_APP_TUTOR_SCALE, letterSpacing: 10 * WEB_APP_TUTOR_SCALE * 0.06 }, fontStyle('semibold', language, Platform.OS === 'web')]}>{t.yourNote}</Text>
                            <TextInput
                              accessibilityLabel={t.yourNote}
                              multiline
                              numberOfLines={3}
                              maxLength={500}
                              placeholder={t.notePlaceholder}
                              placeholderTextColor={p.text.muted}
                              value={noteDraft}
                              onChangeText={setNoteDraft}
                              onEndEditing={() => { if (noteDraft !== selectedNote) onUpdateNode(index, { user_note: noteDraft }); }}
                              style={[styles.noteInput, { color: p.text.primary, backgroundColor: legacy.bg.raised, borderColor: tutorRgba(legacy.border, 0.15), fontSize: 12.5 * WEB_APP_TUTOR_SCALE, lineHeight: 12.5 * WEB_APP_TUTOR_SCALE * 1.5 }, fontStyle('regular', language, Platform.OS === 'web')]}
                            />
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: p.text.muted, fontSize: 10 * WEB_APP_TUTOR_SCALE, letterSpacing: 10 * WEB_APP_TUTOR_SCALE * 0.06 }, fontStyle('semibold', language, Platform.OS === 'web')]}>{t.snapshotHistory}</Text>
                            {history.length ? (
                              <View style={styles.historyList}>
                                {history.slice(-8).reverse().map((snapshot, historyIndex) => (
                                  <Text key={`${snapshot.at || snapshot.date || 'snapshot'}-${historyIndex}`} style={[styles.historyItem, { color: legacy.text.caption, fontSize: 11.5 * WEB_APP_TUTOR_SCALE, lineHeight: 11.5 * WEB_APP_TUTOR_SCALE * 1.5 }, fontStyle('regular', language, Platform.OS === 'web')]}>
                                    <Text style={{ color: p.text.muted, marginRight: 6, fontSize: 11.5 * WEB_APP_TUTOR_SCALE }}>{dateOf(snapshot)}</Text>{snapshot.summary || ''}
                                  </Text>
                                ))}
                              </View>
                            ) : <Text style={[styles.historyEmpty, { color: p.text.muted, fontSize: 11.5 * WEB_APP_TUTOR_SCALE }, fontStyle('regular', language, Platform.OS === 'web')]}>{t.noSnapshotHistory}</Text>}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {history.length ? (
            <View style={styles.snapshotHistory}>
              <Text style={[styles.sectionText, { color: p.text.muted }, fontStyle('medium', language, Platform.OS === 'web')]}>{t.snapshotHistory}</Text>
              {history.slice(-8).reverse().map((snapshot, index) => (
                <Text key={`${snapshot.at || snapshot.date || 'snapshot'}-${index}`} style={[styles.historyItem, { color: p.text.secondary }, fontStyle('regular', language, Platform.OS === 'web')]}>
                  <Text style={{ color: p.text.muted }}>{dateOf(snapshot)}  </Text>{snapshot.summary || ''}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 0, gap: 0 },
  fileHeader: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 6 },
  fileTitle: { fontSize: 13, fontWeight: '600' },
  fileMeta: { flexGrow: 0, flexShrink: 0, fontSize: 10 },
  snapshotButton: { paddingHorizontal: 10, paddingVertical: 3, minHeight: 23, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6 },
  snapshotText: { fontSize: 10 },
  graphWrap: { marginBottom: 12, paddingHorizontal: 12 },
  graphCaption: { fontSize: 10, marginBottom: 6 },
  graphFrame: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  graphHitArea: { position: 'absolute', width: 44, height: 44, marginLeft: -22, marginTop: -22, borderRadius: 22, backgroundColor: 'transparent' },
  empty: { textAlign: 'center', fontSize: 12, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 28 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  sectionText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionCount: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  nodeRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  nodeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  nodeName: { flex: 1, minWidth: 0, fontSize: 12 },
  questionCount: { fontSize: 10, flexShrink: 0 },
  currentMark: { width: 2, height: 16, borderRadius: 1, marginLeft: 1 },
  verifiedTag: { fontSize: 9, overflow: 'hidden', borderRadius: 5 },
  detail: { marginTop: 4, marginBottom: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, gap: 10 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { fontSize: 10, lineHeight: 20, letterSpacing: 0.8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  goButton: { paddingHorizontal: 9, paddingVertical: 3, borderWidth: StyleSheet.hairlineWidth, borderRadius: 6 },
  goText: { fontSize: 11, lineHeight: 18 },
  detailRow: { gap: 4 },
  detailLabel: { fontSize: 10, lineHeight: 20, letterSpacing: 0.6, textTransform: 'uppercase' },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confidenceDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  systemNote: { paddingVertical: 6, fontSize: 12, lineHeight: 19 },
  noteInput: { minHeight: 54, paddingHorizontal: 10, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
  historyList: { gap: 3 },
  historyItem: { fontSize: 11, lineHeight: 17 },
  historyEmpty: { fontSize: 11, lineHeight: 16 },
  snapshotHistory: { gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
});
