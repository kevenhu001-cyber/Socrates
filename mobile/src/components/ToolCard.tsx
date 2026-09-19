import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { JsonValue, ToolApproval, ToolApprovalDecision, ToolCall } from '@socrates/contracts';
import { agentRunsApi, filesApi } from '../data/api/client';
import { native } from '../native/native';
import { setClipboardText } from '../native/clipboard';
import { chartBody, mermaidBody, RichBlock, type RichLib } from '../render/RichBlock';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha, type Palette } from '../theme/theme';
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
  awaiting: 'tool.awaitingApproval',
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
  const { colors, typography } = useTheme();
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
    <View style={[styles.structured, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder }]}>
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

function chartOption(visual: NonNullable<ReturnType<typeof visualizationRecord>>, palette: Pick<Palette, 'textMuted'>) {
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
        label: { color: palette.textMuted },
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
      legend: { bottom: 0, type: 'scroll', textStyle: { color: palette.textMuted } },
      series,
    };
  }
  return {
    backgroundColor: 'transparent',
    aria: { enabled: true, description: { summary: visual.summary || visual.title } },
    tooltip: { trigger: visual.template === 'scatter' ? 'item' : 'axis', confine: true },
    legend: series.length > 1 ? { top: 0, type: 'scroll', textStyle: { color: palette.textMuted } } : undefined,
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
  const { colors, typography } = useTheme();
  const t = useT();
  const visual = useMemo(() => visualizationRecord(value), [value]);
  const chart = useMemo(() => visual ? chartOption(visual, colors) : null, [visual, colors]);
  const diagram = useMemo(() => visual ? mermaidFor(visual) : null, [visual]);
  if (!visual) return null;
  const semanticItems = sectionEntries(visual.payload.items || visual.payload.nodes);
  return (
    <View
      accessible
      accessibilityLabel={visual.summary || visual.title}
      style={[styles.visual, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder }]}
    >
      <Text style={[styles.visualKicker, { color: colors.textSubtle }]}>{t('tool.visualization')}</Text>
      <Text style={[styles.visualTitle, { color: colors.text, fontFamily: typography.medium }]}>{visual.title}</Text>
      {/* Stage heights mirror `frontend/src/styles.css:509-513,527`:
       * chart 292 (phone stage), mermaid min-height 300. */}
      {chart ? <RichBlock body={chartBody(JSON.stringify(chart))} libs={ECHARTS_LIBS} fallbackText={visual.summary || visual.title} initialHeight={292} showActions sourceText={JSON.stringify(chart, null, 2)} /> : null}
      {!chart && diagram ? <RichBlock body={mermaidBody(diagram)} libs={MERMAID_LIBS} fallbackText={visual.summary || visual.title} initialHeight={300} showActions sourceText={diagram} /> : null}
      {!chart && !diagram && visual.summary ? <Text style={[styles.visualSummary, { color: colors.textMuted }]}>{visual.summary}</Text> : null}
      {!chart && !diagram ? semanticItems.map((item, index) => <Text key={index} style={[styles.structuredItem, { color: colors.textMuted }]}>{`• ${item}`}</Text>) : null}
      {visual.caption ? <Text style={[styles.visualCaption, { color: colors.textSubtle }]}>{visual.caption}</Text> : null}
    </View>
  );
}

function SourceResults({ results }: { results: NonNullable<ToolCall['results']> }) {
  const { colors, typography } = useTheme();
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
          <AnimatedPressable key={`${url}-${index}`} accessibilityRole="link" accessibilityLabel={title} onPress={() => { void native.openBrowser(url); }} style={[styles.source, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder }]}>
            {content}
          </AnimatedPressable>
        ) : <View key={`${title}-${index}`} style={[styles.source, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.toolCardBorder }]}>{content}</View>;
      })}
    </View>
  );
}

function Artifacts({ artifacts }: { artifacts: ResultArtifact[] }) {
  const { colors, typography } = useTheme();
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
          style={[styles.artifact, { borderColor: colors.toolCardBorder }]}
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

function getToolIcon(name: string): keyof typeof Ionicons.glyphMap {
  const lower = name.toLowerCase();
  if (lower.includes('bash') || lower.includes('terminal') || lower.includes('command')) return 'terminal-outline';
  if (lower.includes('read') || lower.includes('fetch') || lower.includes('cat')) return 'document-text-outline';
  if (lower.includes('write') || lower.includes('edit') || lower.includes('patch')) return 'create-outline';
  if (lower.includes('search') || lower.includes('find') || lower.includes('glob') || lower.includes('grep')) return 'search-outline';
  if (lower.includes('code') || lower.includes('python')) return 'code-slash-outline';
  return 'construct-outline';
}

function statusFor(call: ToolCall | MobileToolCall): ToolStatus {
  const mobile = call as MobileToolCall;
  return mobile.status ?? (call.isError ? 'failed' : (call.output != null ? 'done' : 'running'));
}

function ApprovalPanel({ approval }: { approval: ToolApproval }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [busy, setBusy] = useState<ToolApprovalDecision | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = (approval.status || 'pending') === 'pending' && !result;
  const decide = useCallback(async (decision: ToolApprovalDecision) => {
    setBusy(decision);
    setError(null);
    try {
      if (decision === 'interrupt') await agentRunsApi.interrupt(approval.runId);
      else await agentRunsApi.decideApproval(approval.runId, approval.approvalId, decision);
      setResult(decision === 'decline'
        ? t('tool.approvalDeclined')
        : decision === 'interrupt'
          ? t('tool.statusStopped')
          : t('tool.approvalAccepted'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('tool.approvalFailed'));
    } finally {
      setBusy(null);
    }
  }, [approval.approvalId, approval.runId, t]);

  const facts = [
    approval.command ? [t('tool.command'), approval.command] : null,
    approval.cwd ? [t('tool.workingDirectory'), approval.cwd] : null,
    approval.reason ? [t('tool.reason'), approval.reason] : null,
  ].filter((fact): fact is string[] => Boolean(fact));

  return (
    <View style={[styles.approval, { backgroundColor: colors.toolCardBgSunken, borderColor: colors.warning }]}>
      <View style={styles.approvalHeading}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.warning} />
        <Text style={[styles.approvalTitle, { color: colors.text, fontFamily: typography.semibold }]}>{t('tool.codexApproval')}</Text>
      </View>
      {facts.map(([name, value]) => (
        <View key={name} style={styles.approvalFact}>
          <Text style={[styles.approvalLabel, { color: colors.textSubtle }]}>{name}</Text>
          <Text selectable style={[styles.approvalValue, { color: colors.textMuted, fontFamily: typography.mono }]}>{value}</Text>
        </View>
      ))}
      {result ? <Text style={[styles.approvalStatus, { color: colors.success }]}>{result}</Text> : null}
      {error ? <Text style={[styles.approvalStatus, { color: colors.danger }]}>{error}</Text> : null}
      {pending ? (
        <View style={styles.approvalActions}>
          <AnimatedPressable disabled={busy !== null} onPress={() => { void decide('accept'); }} style={[styles.approvalButton, { backgroundColor: colors.accent }]}>
            <Text style={[styles.approvalButtonText, { color: colors.textInverse, fontFamily: typography.medium }]}>{t('tool.approveOnce')}</Text>
          </AnimatedPressable>
          <AnimatedPressable disabled={busy !== null} onPress={() => { void decide('acceptForSession'); }} style={[styles.approvalButton, { borderColor: colors.border, borderWidth: 1 }]}>
            <Text style={[styles.approvalButtonText, { color: colors.text, fontFamily: typography.medium }]}>{t('tool.approveRun')}</Text>
          </AnimatedPressable>
          <AnimatedPressable disabled={busy !== null} onPress={() => { void decide('decline'); }} style={styles.approvalButton}>
            <Text style={[styles.approvalButtonText, { color: colors.danger, fontFamily: typography.medium }]}>{t('tool.decline')}</Text>
          </AnimatedPressable>
          <AnimatedPressable disabled={busy !== null} onPress={() => { void decide('interrupt'); }} style={styles.approvalButton}>
            <Text style={[styles.approvalButtonText, { color: colors.textMuted, fontFamily: typography.medium }]}>{t('tool.interrupt')}</Text>
          </AnimatedPressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One card per tool call. The reducer retains every terminal payload, so this
 * component can render results, artifacts, plans/specs and visualisation data
 * alongside streamed execution output instead of losing them after the event.
 */
export const ToolCard = memo(function ToolCard({ call }: { call: ToolCall | MobileToolCall }) {
  const { colors, typography } = useTheme();
  const t = useT();
  // `tool.copy*`/`tool.input`/`tool.output` keys land with the i18n sweep;
  // fall back to the English copy until then.
  const label = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  /* Web parity (toolCards.js:516-524): a running card opens so progress is
   * visible; a terminal card starts collapsed so tool-heavy answers stay
   * scannable. */
  const [open, setOpen] = useState(() => statusFor(call) === 'running');
  const [expanded, setExpanded] = useState(false);
  const [copiedSection, setCopiedSection] = useState<'input' | 'output' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copySection = useCallback((section: 'input' | 'output', value: string) => {
    if (!value) return;
    void setClipboardText(value);
    setCopiedSection(section);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedSection(null), 1200);
  }, []);

  const mobile = call as MobileToolCall;
  const status = statusFor(call);
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
  const duration = displayDuration(mobile.durationMs);

  return (
    /* frontend `.agent-tool-card { border: 0; border-radius: 14px; background: transparent; }` (styles.css:3471-3558) */
    <View style={styles.card}>
      {/* 1:1 Parity with frontend `.agent-tool-head` */}
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.head}
      >
        {/* .agent-tool-state-icon: spinner while running, checkmark/exclamation
         * in terminal states (web `.agent-tool-status` icon slot). */}
        <View style={styles.stateIcon}>
          {status === 'running' ? (
            <ActivityIndicator size={14} color={colors.textSubtle} />
          ) : status === 'awaiting' ? (
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.warning} />
          ) : status === 'done' ? (
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          ) : (
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
          )}
        </View>

        {/* .agent-tool-icon: 20x20, radius 5 */}
        <View style={[styles.toolIconBox, { backgroundColor: colors.surfaceRaised }]}>
          <Ionicons name={getToolIcon(call.name)} size={12} color={colors.textMuted} />
        </View>

        {/* .agent-tool-name: 12px 600 */}
        <Text numberOfLines={1} style={[styles.toolName, { color: colors.text, fontFamily: typography.semibold }]}>
          {call.name}
          {call.name.toLowerCase().includes('python') || call.name.toLowerCase().includes('code') ? (
            <Text style={[styles.pyTag, { color: colors.textSubtle }]}> · py</Text>
          ) : null}
        </Text>

        {/* .agent-tool-input: 11px mono text-muted */}
        {args ? (
          <Text numberOfLines={1} style={[styles.toolInput, { color: colors.textSubtle, fontFamily: typography.mono }]}>
            {args}
          </Text>
        ) : null}

        {/* .agent-tool-status: status label + elapsed time (toolCards.js:429). */}
        <Text numberOfLines={1} style={[styles.toolStatus, { color: status === 'failed' ? colors.danger : status === 'awaiting' ? colors.warning : colors.textSubtle }]}>
          {[statusLabel, duration].filter(Boolean).join(' · ')}
        </Text>

        {/* .agent-tool-chev: 14px */}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSubtle}
          style={styles.chev}
        />
      </AnimatedPressable>

      {open ? (
        /* 1:1 Parity with frontend `.agent-tool-body` (styles.css:3535-3558) with 2px accent rail */
        <View style={[styles.bodyContainer, { borderLeftColor: withAlpha(colors.border, 0.5) }]}>
          {mobile.progressPhase ? (
            <Text style={[styles.meta, { color: colors.textSubtle }]}>{mobile.progressPhase}</Text>
          ) : null}
          {details ? <Text selectable style={[styles.detail, { color: colors.danger }]}>{details}</Text> : null}

          {args ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.textSubtle, fontFamily: typography.medium }]}>{label('tool.input', 'Input')}</Text>
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => copySection('input', args)} style={styles.sectionCopy}>
                  <Ionicons name={copiedSection === 'input' ? 'checkmark-outline' : 'copy-outline'} size={12} color={copiedSection === 'input' ? colors.success : colors.textSubtle} />
                  <Text style={[styles.sectionCopyText, { color: copiedSection === 'input' ? colors.success : colors.textSubtle }]}>
                    {copiedSection === 'input' ? t('common.copied') : label('tool.copyCode', 'Copy code')}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.output, { backgroundColor: colors.toolCardBgSunken }]}>
                <Text selectable style={[styles.outputText, { color: colors.textMuted, fontFamily: typography.mono }]}>
                  {args}
                </Text>
              </View>
            </View>
          ) : null}

          {body ? (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: colors.textSubtle, fontFamily: typography.medium }]}>{label('tool.output', 'Output')}</Text>
                <Pressable accessibilityRole="button" hitSlop={6} onPress={() => copySection('output', body)} style={styles.sectionCopy}>
                  <Ionicons name={copiedSection === 'output' ? 'checkmark-outline' : 'copy-outline'} size={12} color={copiedSection === 'output' ? colors.success : colors.textSubtle} />
                  <Text style={[styles.sectionCopyText, { color: copiedSection === 'output' ? colors.success : colors.textSubtle }]}>
                    {copiedSection === 'output' ? t('common.copied') : label('tool.copyOutput', 'Copy output')}
                  </Text>
                </Pressable>
              </View>
              {/* .agent-tool-out: 11px mono, line-height: 1.5, max-height: 280 */}
              <View style={[styles.output, { backgroundColor: colors.toolCardBgSunken }]}>
                <Text selectable style={[styles.outputText, { color: colors.textMuted, fontFamily: typography.mono }]}>
                  {shown}
                </Text>
              </View>
            </View>
          ) : null}

          {call.plan ? <StructuredCard value={call.plan} kind="plan" /> : null}
          {call.spec ? <StructuredCard value={call.spec} kind="spec" /> : null}
          {call.visualization ? <VisualizationCard value={call.visualization} /> : null}
          {call.results?.length ? <SourceResults results={call.results} /> : null}
          {call.artifacts?.length ? <Artifacts artifacts={call.artifacts} /> : null}
          {call.approval ? <ApprovalPanel approval={call.approval} /> : null}

          {!body && status !== 'running' && !details && !call.plan && !call.spec && !call.visualization && !call.results?.length && !call.artifacts?.length ? (
            <Text style={[styles.noOutputText, { color: colors.textSubtle }]}>{t('tool.noOutput')}</Text>
          ) : null}
          {clipped ? (
            <AnimatedPressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.toggle}>
              <Text style={[styles.toggleText, { color: colors.accent }]}>
                {expanded ? t('tool.collapseOutput') : t('tool.showFullOutput')}
              </Text>
            </AnimatedPressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 14, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, minHeight: 32 },
  toolIconBox: { width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stateIcon: { width: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  toolName: { fontSize: 12, flexShrink: 0, letterSpacing: -0.1 },
  pyTag: { fontSize: 10, fontWeight: '500' },
  toolInput: { flex: 1, fontSize: 11, opacity: 0.8 },
  toolStatus: { flexShrink: 1, fontSize: 10, opacity: 0.85 },
  chev: { opacity: 0.6 },
  bodyContainer: { position: 'relative', borderLeftWidth: 2, marginLeft: 8, paddingLeft: 10, marginTop: 2, marginBottom: 6 },
  section: { marginTop: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionCopy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionCopyText: { fontSize: 10 },
  meta: { fontSize: 11, lineHeight: 15, marginTop: 4, textTransform: 'capitalize' },
  detail: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  output: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, maxHeight: 280 },
  outputText: { fontSize: 11, lineHeight: 16.5 },
  noOutputText: { fontSize: 11, marginTop: 4 },
  toggle: { alignSelf: 'flex-start', paddingVertical: 6 },
  toggleText: { fontSize: 11, fontWeight: '700' },
  structured: { borderWidth: 1, marginTop: 8, padding: 9, borderRadius: 14 },
  structuredTitle: { fontSize: 12, lineHeight: 17 },
  structuredIntro: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  structuredSection: { marginTop: 5 },
  structuredLabel: { fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 1 },
  structuredItem: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  visual: { borderWidth: 1, marginTop: 8, padding: 9, overflow: 'hidden', borderRadius: 14 },
  visualKicker: { fontSize: 10, letterSpacing: 0.7, fontWeight: '700', textTransform: 'uppercase' },
  visualTitle: { fontSize: 13, lineHeight: 18, marginTop: 2, marginBottom: 7 },
  visualSummary: { fontSize: 12, lineHeight: 17 },
  visualCaption: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  sources: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 9, paddingTop: 8, gap: 6 },
  sectionTitle: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  source: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  sourceTitle: { fontSize: 11, lineHeight: 16 },
  sourceSnippet: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  sourceMeta: { fontSize: 10, lineHeight: 14, marginTop: 3 },
  artifact: { minHeight: 45, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8 },
  artifactText: { flex: 1, minWidth: 0 },
  artifactError: { fontSize: 11, lineHeight: 16 },
  approval: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  approvalHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approvalTitle: { fontSize: 13, flex: 1 },
  approvalFact: { gap: 3 },
  approvalLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  approvalValue: { fontSize: 11, lineHeight: 16 },
  approvalStatus: { fontSize: 12, lineHeight: 17 },
  approvalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  approvalButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  approvalButtonText: { fontSize: 12 },
});
