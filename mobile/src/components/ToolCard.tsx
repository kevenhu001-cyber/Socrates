import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JsonValue, ToolCall } from '@socrates/contracts';
import { filesApi } from '../data/api/client';
import { native } from '../native/native';
import { chartBody, mermaidBody, RichBlock, type RichLib } from '../render/RichBlock';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import type { MobileToolCall, ToolStatus } from '../data/tools/toolState';

/** Collapsed cards show this many lines; the rest is behind the toggle. */
const PREVIEW_LINES = 6;
const MAX_RESULT_ITEMS = 8;
const ECHARTS_LIBS: RichLib[] = ['echarts'];
const MERMAID_LIBS: RichLib[] = ['mermaid'];

const STATUS_KEY: Record<ToolStatus, string> = {
  running: 'tool.statusRunning',
  done: 'tool.statusDone',
  failed: 'tool.statusFailed',
};

type UnknownRecord = Record<string, unknown>;
type ResultArtifact = NonNullable<ToolCall['artifacts']>[number];

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarise(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    const value = JSON.stringify(input);
    if (!value || value === '{}') return '';
    return value.length > 180 ? `${value.slice(0, 180)}…` : value;
  } catch {
    return '';
  }
}

function safeHttpUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function displayDuration(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function fileName(name: string | null | undefined, fallback: string): string {
  const cleaned = (name || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
    .replace(/^\.+$/, 'artifact')
    .slice(0, 120);
  return cleaned || 'artifact';
}

function sectionEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_RESULT_ITEMS).flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') return [String(item)];
    const record = asRecord(item);
    if (!record) return [];
    const title = text(record.title) || text(record.label) || text(record.name) || text(record.goal);
    const detail = text(record.detail) || text(record.description) || text(record.summary);
    const state = text(record.status);
    const parts = [title, detail, state ? `(${state})` : null].filter(Boolean);
    return parts.length ? [parts.join(' — ')] : [summarise(record)];
  });
}

function StructuredCard({ value, kind }: { value: JsonValue; kind: 'plan' | 'spec' }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const record = asRecord(value);
  if (!record) return null;
  const title = text(record.title) || (kind === 'plan' ? t('tool.plan') : t('tool.spec'));
  const intro = text(record.goal) || text(record.summary) || text(record.description);
  const sections = [
    ['steps', record.steps],
    ['requirements', record.requirements],
    ['acceptance', record.acceptanceCriteria],
    ['constraints', record.constraints],
    ['scope', record.outOfScope],
    ['items', record.items],
  ] as const;
  const visibleSections = sections
    .map(([label, raw]) => ({ label, entries: sectionEntries(raw) }))
    .filter((section) => section.entries.length);

  return (
    <View style={[styles.structured, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder, borderRadius: radius.xs }]}>
      <Text style={[styles.structuredTitle, { color: colors.text, fontFamily: typography.medium }]}>{title}</Text>
      {intro ? <Text style={[styles.structuredIntro, { color: colors.textMuted }]}>{intro}</Text> : null}
      {visibleSections.map((section) => (
        <View key={section.label} style={styles.structuredSection}>
          {visibleSections.length > 1 ? <Text style={[styles.structuredLabel, { color: colors.textSubtle }]}>{section.label}</Text> : null}
          {section.entries.map((entry, index) => (
            <Text key={`${section.label}-${index}`} style={[styles.structuredItem, { color: colors.textMuted }]}>{`• ${entry}`}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function visualizationRecord(value: JsonValue): {
  template: string;
  title: string;
  caption: string | null;
  summary: string | null;
  payload: UnknownRecord;
} | null {
  const record = asRecord(value);
  const payload = record ? asRecord(record.payload) : null;
  const template = record ? text(record.template) : null;
  const title = record ? text(record.title) : null;
  if (!record || !payload || !template || !title) return null;
  return {
    template,
    title,
    caption: text(record.caption),
    summary: text(record.accessibilitySummary),
    payload,
  };
}

function chartOption(visual: NonNullable<ReturnType<typeof visualizationRecord>>) {
  if (!['line', 'area', 'bar', 'scatter', 'pie', 'histogram'].includes(visual.template)) return null;
  const categories = Array.isArray(visual.payload.categories)
    ? visual.payload.categories.slice(0, 300).map((item) => String(item))
    : [];
  const source = Array.isArray(visual.payload.series) ? visual.payload.series.slice(0, 12) : [];
  const series: Array<Record<string, unknown>> = [];
  source.forEach((item, index) => {
    const record = asRecord(item);
    const data = record && Array.isArray(record.data) ? record.data.slice(0, 500) : null;
    if (!data?.length) return;
    const name = text(record?.name) || `Series ${index + 1}`;
    if (visual.template === 'pie') {
      series.push({
        name,
        type: 'pie',
        radius: ['35%', '62%'],
        center: ['50%', '44%'],
        data: data.map((point, pointIndex) => asRecord(point) || {
          name: categories[pointIndex] || String(pointIndex + 1),
          value: point,
        }),
        label: { color: '#a3a3a3' },
        labelLayout: { hideOverlap: true },
      });
      return;
    }
    series.push({
      name,
      type: visual.template === 'area' ? 'line' : visual.template === 'histogram' ? 'bar' : visual.template,
      data,
      smooth: visual.template === 'line' || visual.template === 'area',
      showSymbol: visual.template === 'scatter',
      symbolSize: visual.template === 'scatter' ? 7 : undefined,
      areaStyle: visual.template === 'area' ? { opacity: 0.15 } : undefined,
      emphasis: { focus: 'series' },
    });
  });
  if (!series.length) return null;
  if (visual.template === 'pie') {
    return {
      backgroundColor: 'transparent',
      aria: { enabled: true, description: { summary: visual.summary || visual.title } },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: '#a3a3a3' } },
      series,
    };
  }
  return {
    backgroundColor: 'transparent',
    aria: { enabled: true, description: { summary: visual.summary || visual.title } },
    tooltip: { trigger: visual.template === 'scatter' ? 'item' : 'axis', confine: true },
    legend: series.length > 1 ? { top: 0, type: 'scroll', textStyle: { color: '#a3a3a3' } } : undefined,
    grid: { left: 46, right: 18, top: series.length > 1 ? 42 : 16, bottom: categories.length > 8 ? 60 : 38 },
    xAxis: visual.template === 'scatter'
      ? { type: 'value', name: text(visual.payload.xLabel) || '' }
      : { type: 'category', data: categories, name: text(visual.payload.xLabel) || '', axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', name: text(visual.payload.yLabel) || '' },
    dataZoom: categories.length > 16 ? [{ type: 'inside' }] : undefined,
    series,
  };
}

function mermaidFor(visual: NonNullable<ReturnType<typeof visualizationRecord>>): string | null {
  if (!['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'].includes(visual.template)) return null;
  const nodes = Array.isArray(visual.payload.nodes) ? visual.payload.nodes.slice(0, 80) : [];
  const edges = Array.isArray(visual.payload.edges) ? visual.payload.edges.slice(0, 120) : [];
  if (!nodes.length) return null;
  const ids = new Map<string, string>();
  const nodeLines = nodes.flatMap((item, index) => {
    const record = asRecord(item);
    const sourceId = text(record?.id) || String(index);
    const label = (text(record?.label) || sourceId).replace(/[\[\]{}"<>|]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);
    const id = `n${index}`;
    ids.set(sourceId, id);
    return [`${id}["${label.replace(/"/g, '\\"')}"]`];
  });
  const edgeLines = edges.flatMap((item) => {
    const record = asRecord(item);
    const from = ids.get(text(record?.from) || '');
    const to = ids.get(text(record?.to) || '');
    if (!from || !to) return [];
    const label = text(record?.label)?.replace(/[|\n]/g, ' ').slice(0, 80);
    return [label ? `${from} -->|${label}| ${to}` : `${from} --> ${to}`];
  });
  return [`flowchart ${visual.payload.direction === 'horizontal' ? 'LR' : 'TD'}`, ...nodeLines, ...edgeLines].join('\n');
}

function VisualizationCard({ value }: { value: JsonValue }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const visual = useMemo(() => visualizationRecord(value), [value]);
  const chart = useMemo(() => visual ? chartOption(visual) : null, [visual]);
  const diagram = useMemo(() => visual ? mermaidFor(visual) : null, [visual]);
  if (!visual) return null;
  const semanticItems = sectionEntries(visual.payload.items || visual.payload.nodes);
  return (
    <View
      accessible
      accessibilityLabel={visual.summary || visual.title}
      style={[styles.visual, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder, borderRadius: radius.xs }]}
    >
      <Text style={[styles.visualKicker, { color: colors.accent }]}>{t('tool.visualization')}</Text>
      <Text style={[styles.visualTitle, { color: colors.text, fontFamily: typography.medium }]}>{visual.title}</Text>
      {chart ? <RichBlock body={chartBody(JSON.stringify(chart))} libs={ECHARTS_LIBS} fallbackText={visual.summary || visual.title} initialHeight={250} /> : null}
      {!chart && diagram ? <RichBlock body={mermaidBody(diagram)} libs={MERMAID_LIBS} fallbackText={visual.summary || visual.title} initialHeight={220} /> : null}
      {!chart && !diagram && visual.summary ? <Text style={[styles.visualSummary, { color: colors.textMuted }]}>{visual.summary}</Text> : null}
      {!chart && !diagram ? semanticItems.map((item, index) => <Text key={index} style={[styles.structuredItem, { color: colors.textMuted }]}>{`• ${item}`}</Text>) : null}
      {visual.caption ? <Text style={[styles.visualCaption, { color: colors.textSubtle }]}>{visual.caption}</Text> : null}
    </View>
  );
}

function SourceResults({ results }: { results: NonNullable<ToolCall['results']> }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  if (!results.length) return null;
  return (
    <View style={[styles.sources, { borderTopColor: colors.toolCardBorder }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSubtle, fontFamily: typography.medium }]}>{t('tool.sources')}</Text>
      {results.slice(0, MAX_RESULT_ITEMS).map((result, index) => {
        const title = text(result.title) || text(result.name) || text(result.url) || `${t('tool.source')} ${index + 1}`;
        const url = safeHttpUrl(result.url);
        const snippet = text(result.snippet) || text(result.description);
        const meta = [text(result.source), text(result.date)].filter(Boolean).join(' · ');
        const content = (
          <>
            <Text numberOfLines={2} style={[styles.sourceTitle, { color: url ? colors.accent : colors.textMuted, fontFamily: typography.medium }]}>{title}</Text>
            {snippet ? <Text numberOfLines={3} style={[styles.sourceSnippet, { color: colors.textSubtle }]}>{snippet}</Text> : null}
            {meta ? <Text numberOfLines={1} style={[styles.sourceMeta, { color: colors.textSubtle }]}>{meta}</Text> : null}
          </>
        );
        return url ? (
          <AnimatedPressable key={`${url}-${index}`} accessibilityRole="link" accessibilityLabel={title} onPress={() => { void native.openBrowser(url); }} style={[styles.source, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder, borderRadius: radius.xs }]}>
            {content}
          </AnimatedPressable>
        ) : <View key={`${title}-${index}`} style={[styles.source, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder, borderRadius: radius.xs }]}>{content}</View>;
      })}
    </View>
  );
}

function Artifacts({ artifacts }: { artifacts: ResultArtifact[] }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const download = useCallback(async (artifact: ResultArtifact) => {
    setDownloading(artifact.id);
    setError(null);
    try {
      const blob = await filesApi.raw(artifact.id);
      await native.shareBlob(blob, fileName(artifact.name, artifact.id), artifact.mimeType || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('tool.artifactFailed'));
    } finally {
      setDownloading((current) => current === artifact.id ? null : current);
    }
  }, [t]);
  if (!artifacts.length) return null;
  return (
    <View style={[styles.sources, { borderTopColor: colors.toolCardBorder }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSubtle, fontFamily: typography.medium }]}>{t('tool.artifacts')}</Text>
      {artifacts.slice(0, MAX_RESULT_ITEMS).map((artifact) => (
        <AnimatedPressable
          key={artifact.id}
          accessibilityRole="button"
          accessibilityLabel={`${t('tool.download')} ${artifact.name || artifact.id}`}
          disabled={downloading === artifact.id}
          onPress={() => { void download(artifact); }}
          style={[styles.artifact, { borderColor: colors.toolCardBorder, borderRadius: radius.xs }]}
        >
          <Ionicons name="document-attach-outline" size={17} color={colors.accent} />
          <View style={styles.artifactText}>
            <Text numberOfLines={1} style={[styles.sourceTitle, { color: colors.text, fontFamily: typography.medium }]}>{artifact.name || artifact.id}</Text>
            {artifact.mimeType ? <Text numberOfLines={1} style={[styles.sourceMeta, { color: colors.textSubtle }]}>{artifact.mimeType}</Text> : null}
          </View>
          {downloading === artifact.id ? <ActivityIndicator size="small" color={colors.textSubtle} /> : <Ionicons name="download-outline" size={18} color={colors.textSubtle} />}
        </AnimatedPressable>
      ))}
      {error ? <Text style={[styles.artifactError, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * One card per tool call. The reducer retains every terminal payload, so this
 * component can render results, artifacts, plans/specs and visualisation data
 * alongside streamed execution output instead of losing them after the event.
 */
export const ToolCard = memo(function ToolCard({ call }: { call: ToolCall | MobileToolCall }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const mobile = call as MobileToolCall;
  const status: ToolStatus = mobile.status
    ?? (call.isError ? 'failed' : (call.output != null ? 'done' : 'running'));
  const statusLabel = status === 'failed' && mobile.progress == null && call.output == null
    ? t('tool.statusStopped')
    : t(STATUS_KEY[status]);
  const args = summarise(call.input) || mobile.argumentsText || '';
  const body = [
    mobile.progress,
    typeof call.output === 'string' ? call.output : summarise(call.output),
    mobile.stderr ? `${t('tool.stderr')}:\n${mobile.stderr}` : null,
  ].filter((part): part is string => Boolean(part && part.trim())).join('\n');
  const details = [mobile.userMessage, mobile.errorText, mobile.detail]
    .filter((part, index, values): part is string => Boolean(part && values.indexOf(part) === index))
    .join('\n');
  const lines = body ? body.split('\n') : [];
  const clipped = lines.length > PREVIEW_LINES;
  const shown = expanded || !clipped ? body : lines.slice(0, PREVIEW_LINES).join('\n');
  const accent = status === 'failed' ? colors.danger : status === 'done' ? colors.success : colors.accent;
  const duration = displayDuration(mobile.durationMs);

  return (
    <View style={[styles.card, { backgroundColor: colors.toolCardBg, borderColor: colors.toolCardBorder, borderRadius: radius.sm }]}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text numberOfLines={1} style={[styles.name, { color: colors.text, fontFamily: typography.mono }]}>{call.name}</Text>
        {status === 'running' ? <ActivityIndicator size="small" color={colors.textSubtle} /> : null}
        <Text style={[styles.status, { color: accent }]}>{statusLabel}</Text>
      </View>

      {args ? <Text numberOfLines={2} style={[styles.args, { color: colors.textSubtle, fontFamily: typography.mono }]}>{args}</Text> : null}
      {mobile.progressPhase || duration ? <Text style={[styles.meta, { color: colors.textSubtle }]}>{[mobile.progressPhase, duration].filter(Boolean).join(' · ')}</Text> : null}
      {details ? <Text selectable style={[styles.detail, { color: colors.danger }]}>{details}</Text> : null}

      {body ? <View style={[styles.output, { backgroundColor: colors.toolCardBgSunken, borderRadius: radius.xs }]}><Text selectable style={[styles.outputText, { color: colors.textMuted, fontFamily: typography.mono }]}>{shown}</Text></View> : null}
      {call.plan ? <StructuredCard value={call.plan} kind="plan" /> : null}
      {call.spec ? <StructuredCard value={call.spec} kind="spec" /> : null}
      {call.visualization ? <VisualizationCard value={call.visualization} /> : null}
      {call.results?.length ? <SourceResults results={call.results} /> : null}
      {call.artifacts?.length ? <Artifacts artifacts={call.artifacts} /> : null}

      {!body && status !== 'running' && !details && !call.plan && !call.spec && !call.visualization && !call.results?.length && !call.artifacts?.length ? <Text style={[styles.args, { color: colors.textSubtle }]}>{t('tool.noOutput')}</Text> : null}
      {clipped ? <AnimatedPressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.toggle}><Text style={[styles.toggleText, { color: colors.accent }]}>{expanded ? t('tool.collapseOutput') : t('tool.showFullOutput')}</Text></AnimatedPressable> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 10, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { flex: 1, fontSize: 12, fontWeight: '700' },
  status: { fontSize: 10, letterSpacing: 0.6, fontWeight: '700', textTransform: 'uppercase' },
  args: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  meta: { fontSize: 10, lineHeight: 15, marginTop: 4, textTransform: 'capitalize' },
  detail: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  output: { marginTop: 8, paddingHorizontal: 8, paddingVertical: 7 },
  outputText: { fontSize: 11, lineHeight: 16 },
  toggle: { alignSelf: 'flex-start', paddingVertical: 6 },
  toggleText: { fontSize: 11, fontWeight: '700' },
  structured: { borderWidth: 1, marginTop: 8, padding: 9 },
  structuredTitle: { fontSize: 12, lineHeight: 17 },
  structuredIntro: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  structuredSection: { marginTop: 5 },
  structuredLabel: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 },
  structuredItem: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  visual: { borderWidth: 1, marginTop: 8, padding: 9, overflow: 'hidden' },
  visualKicker: { fontSize: 10, letterSpacing: 0.7, fontWeight: '700', textTransform: 'uppercase' },
  visualTitle: { fontSize: 13, lineHeight: 18, marginTop: 2, marginBottom: 7 },
  visualSummary: { fontSize: 12, lineHeight: 17 },
  visualCaption: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  sources: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 9, paddingTop: 8, gap: 6 },
  sectionTitle: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  source: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  sourceTitle: { fontSize: 11, lineHeight: 16 },
  sourceSnippet: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sourceMeta: { fontSize: 10, lineHeight: 14, marginTop: 3 },
  artifact: { minHeight: 45, borderWidth: 1, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  artifactText: { flex: 1, minWidth: 0 },
  artifactError: { fontSize: 11, lineHeight: 16 },
});
