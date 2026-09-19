import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/theme';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import type { MobileToolCall } from '../data/tools/toolState';
import {
  groupDurationMs,
  groupShowsHeader,
  toolRunStateOf,
  type ToolRunState,
  type TurnSegment,
} from '../data/tools/turnLayout';
import { ToolCard } from './ToolCard';

/**
 * components/ToolRunGroup.tsx — the collapsed aggregate row for a run of
 * consecutive tool calls, ported from the web's ToolRunGroup.tsx +
 * toolRunGroupLabel (react/tool-run/labels.ts).
 *
 * Semantics kept from the web:
 *  - a run shorter than 2 settled members renders bare cards, no header;
 *  - still-running members render AFTER the header — a live row never hides
 *    inside a collapsed aggregate;
 *  - the header is user-toggleable only (no auto-expansion);
 *  - meta = "{n} actions" (+ "{f} failed" when errored, + total duration).
 */

type GroupSegment = Extract<TurnSegment, { kind: 'group' }>;

const SEARCH_TOOLS: ReadonlySet<string> = new Set([
  'web_search', 'arxiv_search', 'zotero_search', 'notion_search_pages',
  'github_list_repos', 'gitee_list_repos',
]);
const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write']);
const READ_TOOLS: ReadonlySet<string> = new Set(['Read', 'Glob', 'Grep']);
const COMMAND_TOOLS: ReadonlySet<string> = new Set(['code_interpreter', 'Code', 'Bash']);

function basename(filePath: string): string {
  const parts = String(filePath).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function filePathOf(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const value = record.file_path ?? record.filePath ?? record.file;
  return typeof value === 'string' && value ? value : null;
}

function joinNames(names: string[], cap = 3): string {
  const list = names.slice(0, Math.max(1, cap));
  if (names.length > list.length) list.push('…');
  return list.join(', ');
}

function uniqueFiles(calls: MobileToolCall[]): string[] {
  const seen: string[] = [];
  for (const call of calls) {
    const name = basename(filePathOf(call.input) || '');
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

function resultCount(call: MobileToolCall): number {
  return Array.isArray(call.results) ? call.results.length : 0;
}

function formatSeconds(ms: number): string {
  const n = Math.max(0, Number(ms) || 0);
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(n / 60_000);
  const s = Math.round((n % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * One group header line, in the web toolRunGroupLabel's priority order:
 * running → stopped → all-edit → all-read → all-search → homogeneous
 * categories → generic "Explored".
 */
function groupLabel(members: MobileToolCall[], state: ToolRunState, t: (k: string) => string): string {
  if (state === 'running') return t('tools.groupExploring');
  if (state === 'stopped') return t('tools.groupStopped');
  if (!members.length) return t('tools.groupExplored');

  const isSearch = (c: MobileToolCall) =>
    SEARCH_TOOLS.has(c.name) || String(c.name || '').toLowerCase().includes('search');
  if (members.every((c) => EDIT_TOOLS.has(c.name))) {
    const files = uniqueFiles(members);
    return files.length
      ? t('tools.editedFiles').replace('{files}', joinNames(files))
      : t('tools.editedNFiles').replace('{n}', String(members.length));
  }
  if (members.every((c) => READ_TOOLS.has(c.name))) {
    const files = uniqueFiles(members);
    return files.length
      ? t('tools.readFiles').replace('{files}', joinNames(files))
      : t('tools.readNFiles').replace('{n}', String(members.length));
  }
  if (members.every(isSearch)) {
    const sources = members.reduce((sum, c) => sum + resultCount(c), 0);
    if (sources > 0) {
      return t('tools.foundSources')
        .replace('{n}', String(sources))
        .replace('{m}', String(members.length));
    }
    return t('tools.searchedN').replace('{n}', String(members.length));
  }
  if (members.every((c) => c.name === 'render_visualization')) {
    return t('tools.generatedViz').replace('{n}', String(members.length));
  }
  if (members.every((c) => COMMAND_TOOLS.has(c.name))) {
    return t('tools.ranCommands').replace('{n}', String(members.length));
  }
  if (members.every((c) => c.name === 'workspace_agent')) {
    return t('tools.ranAgents').replace('{n}', String(members.length));
  }
  return t('tools.groupExplored');
}

function GroupIcon({ state, colors }: { state: ToolRunState; colors: Palette }) {
  if (state === 'running') return <ActivityIndicator size={14} color={colors.textSubtle} />;
  if (state === 'awaiting') return <Ionicons name="shield-checkmark-outline" size={15} color={colors.warning} />;
  if (state === 'error') return <Ionicons name="alert-circle" size={15} color={colors.danger} />;
  if (state === 'stopped') return <Ionicons name="stop-circle-outline" size={15} color={colors.textSubtle} />;
  return <Ionicons name="checkmark-circle" size={15} color={colors.success} />;
}

export function ToolRunGroup({ segment }: { segment: GroupSegment }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const { members, running, state } = segment;

  const cards = (list: MobileToolCall[]) => list.map((call) => (
    <ToolCard key={call.id} call={call} />
  ));

  /* < 2 settled members: nothing to fold — render the rows bare. */
  if (!groupShowsHeader(segment)) {
    return <View style={styles.bare}>{cards(members)}{cards(running)}</View>;
  }

  const failed = members.filter((c) => toolRunStateOf(c) === 'error').length;
  const duration = groupDurationMs(members);
  const meta = [
    failed ? t('tools.nFailed').replace('{n}', String(failed)) : '',
    t('tools.nActions').replace('{n}', String(members.length)),
    duration ? formatSeconds(duration) : '',
  ].filter(Boolean).join(' · ');

  return (
    <View style={[styles.group, { borderColor: colors.toolCardBorder, backgroundColor: colors.toolCardBgSunken }]}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('tools.groupA11y')}
        onPress={() => setOpen((v) => !v)}
        style={styles.header}
      >
        <View style={styles.iconBox}><GroupIcon state={state} colors={colors} /></View>
        <Text numberOfLines={1} style={[styles.label, { color: colors.text, fontFamily: typography.semibold }]}>
          {groupLabel(members, state, t)}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: colors.textSubtle }]}>{meta}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSubtle} />
      </AnimatedPressable>
      {open ? <View style={styles.members}>{cards(members)}</View> : null}
      {running.length ? <View style={styles.members}>{cards(running)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bare: { gap: 0 },
  group: { marginTop: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, minHeight: 34 },
  iconBox: { width: 18, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 12.5, letterSpacing: -0.1 },
  meta: { fontSize: 10, opacity: 0.85 },
  members: { paddingHorizontal: 8, paddingBottom: 8 },
});
