import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { ToolCall } from '@socrates/contracts';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n';
import { AnimatedPressable } from './AnimatedPressable';
import type { MobileToolCall, ToolStatus } from '../data/tools/toolState';

/** Collapsed cards show this many lines; the rest is behind the toggle. */
const PREVIEW_LINES = 6;

const STATUS_KEY: Record<ToolStatus, string> = {
  running: 'tool.statusRunning',
  done: 'tool.statusDone',
  failed: 'tool.statusFailed',
};

function summarise(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  try {
    const text = JSON.stringify(input);
    if (!text || text === '{}') return '';
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  } catch {
    return '';
  }
}

/**
 * One card per tool call, folding the run's arguments, streamed progress and
 * final output together — the shape `reduceToolEvent` produces and the web
 * client's tool cards show. Output is clipped until tapped so a long stdout
 * dump cannot push the conversation off screen.
 */
export function ToolCard({ call }: { call: ToolCall | MobileToolCall }) {
  const { colors, radius, typography } = useTheme();
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const mobile = call as MobileToolCall;
  // A card with no status predates the reducer (or came from a restored
  // session); treat a present output as a finished run.
  const status: ToolStatus = mobile.status
    ?? (call.isError ? 'failed' : (call.output != null ? 'done' : 'running'));
  const statusLabel = status === 'failed' && mobile.progress == null && call.output == null
    ? t('tool.statusStopped')
    : t(STATUS_KEY[status]);

  const args = summarise(call.input) || mobile.argumentsText || '';
  const body = [mobile.progress, typeof call.output === 'string' ? call.output : summarise(call.output)]
    .filter((part) => part && part.trim())
    .join('\n');
  const detail = mobile.userMessage || mobile.errorText || '';
  const lines = body ? body.split('\n') : [];
  const clipped = lines.length > PREVIEW_LINES;
  const shown = expanded || !clipped ? body : lines.slice(0, PREVIEW_LINES).join('\n');

  const accent = status === 'failed' ? colors.danger : status === 'done' ? colors.success : colors.accent;

  return (
    <View style={[styles.card, { backgroundColor: colors.toolCardBg, borderColor: colors.toolCardBorder, borderRadius: radius.sm }]}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text numberOfLines={1} style={[styles.name, { color: colors.text, fontFamily: typography.mono }]}>{call.name}</Text>
        {status === 'running' ? <ActivityIndicator size="small" color={colors.textSubtle} /> : null}
        <Text style={[styles.status, { color: accent }]}>{statusLabel}</Text>
      </View>

      {args ? (
        <Text numberOfLines={2} style={[styles.args, { color: colors.textSubtle, fontFamily: typography.mono }]}>{args}</Text>
      ) : null}

      {detail ? <Text style={[styles.detail, { color: colors.danger }]}>{detail}</Text> : null}

      {body ? (
        <View style={[styles.output, { backgroundColor: colors.toolCardBgSunken, borderRadius: radius.xs }]}>
          <Text selectable style={[styles.outputText, { color: colors.textMuted, fontFamily: typography.mono }]}>{shown}</Text>
        </View>
      ) : status !== 'running' && !detail ? (
        <Text style={[styles.args, { color: colors.textSubtle }]}>{t('tool.noOutput')}</Text>
      ) : null}

      {clipped ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={styles.toggle}
        >
          <Text style={[styles.toggleText, { color: colors.accent }]}>
            {expanded ? t('tool.collapseOutput') : t('tool.showFullOutput')}
          </Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 10, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { flex: 1, fontSize: 12, fontWeight: '700' },
  status: { fontSize: 10, letterSpacing: 0.6, fontWeight: '700', textTransform: 'uppercase' },
  args: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  detail: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  output: { marginTop: 8, paddingHorizontal: 8, paddingVertical: 7 },
  outputText: { fontSize: 11, lineHeight: 16 },
  toggle: { alignSelf: 'flex-start', paddingVertical: 6 },
  toggleText: { fontSize: 11, fontWeight: '700' },
});
