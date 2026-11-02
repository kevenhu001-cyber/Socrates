/**
 * RN-5 diagnostic surface. One host view takes turns showing the loading,
 * question, results and failure screens; every control reports a command to
 * the host (`data-diag-command` stays on each control for the web shell).
 * Question / option / notice copy arrives as host-rendered rich content
 * (`renderRich`), so math and links keep the shell's renderer.
 */
import { type ReactNode } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { H, R, S, focusRing, insetRing, shadow, sheets, transition } from '../look';
import { useReducedMotion } from '../turn/parts';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { PillAction, dataSet } from '../learn/parts';
import { diagnosticReport, type DiagnosticResultNode } from './model';
import { fill } from './strings';

export type DiagnosticCommand = 'cancel' | 'retry' | 'builtin' | 'select' | 'previous' | 'next' | 'skip' | 'finish' | 'proceed';
export type DiagnosticCommandHandler = (command: DiagnosticCommand, index?: number) => void;

export interface DiagnosticOption {
  letter: string;
  /** Host rich source, handed to `renderRich` (markdown on web, formatted at paint time). */
  text: string;
}

export interface DiagnosticResultsCopy {
  coverage: string;
  /** `{n}` familiar of `{total}`. */
  coverageOf: string;
  gaps: string;
  next: string;
  /** `{name}`. */
  startsWith: string;
  /** `{names}`. */
  focus: string;
  allFamiliar: string;
  rankLabel: string;
  /** Joins the focus names ("、" in zh, ", " in en). */
  separator: string;
  /** RN-6: shown while the AI analysis of the answers is being written. */
  analyzing?: string;
}

/**
 * RN-6: the AI-written part of the results. `reasons` is keyed by the
 * node's position in `nodes`. Absent (older hosts) or `none` means the
 * computed copy stands alone; `loading` keeps it and adds a quiet line.
 */
export interface DiagnosticInsight {
  status: 'loading' | 'ready' | 'none';
  summary?: string | null;
  nextStep?: string | null;
  reasons?: Record<number, string>;
}

export type DiagnosticScreen =
  | { kind: 'loading'; loadingText: string; percent: number; step: string; cancelLabel: string }
  | {
      kind: 'question';
      numberLabel: string;
      questionHtml: string;
      options: DiagnosticOption[];
      selected: number | null;
      isFirst: boolean;
      isLast: boolean;
      labels: { back: string; skip: string; next: string; begin: string };
    }
  | {
      kind: 'results';
      title: string;
      noticeHtml: string;
      nodes: DiagnosticResultNode[];
      summary: string;
      continueLabel: string;
      statusLabels: { fuzzy: string; blank: string };
      copy: DiagnosticResultsCopy;
      insight?: DiagnosticInsight;
    }
  | { kind: 'error'; title: string; reason: string; retryLabel: string; builtinLabel: string };

export type RenderDiagnosticRich = (source: string, part: 'diag-question' | 'diag-option' | 'diag-notice') => ReactNode;
/** RN-11: one line of plain copy (gap names, AI reasons) — the host can typeset `$…$`. */
export type RenderDiagnosticText = (text: string, part: string) => ReactNode;

const plainText: RenderDiagnosticText = (text) => text;

export function DiagnosticPanel({ screen, onCommand, renderRich, renderText = plainText }: { screen: DiagnosticScreen; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich; renderText?: RenderDiagnosticText }) {
  if (screen.kind === 'loading') return <Loading screen={screen} onCommand={onCommand} />;
  if (screen.kind === 'question') return <Question screen={screen} onCommand={onCommand} renderRich={renderRich} />;
  if (screen.kind === 'results') return <Results screen={screen} onCommand={onCommand} renderRich={renderRich} renderText={renderText} />;
  return <Failure screen={screen} onCommand={onCommand} />;
}

/** Site pricing / feature card: white, 24px radius, hairline ring + soft lift, 32px inset. */
function Card({ children, maxWidth = 720, data }: { children: ReactNode; maxWidth?: number; data?: Record<string, string> }) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const pad = width < 769 ? S[300] : S[400];
  return (
    <View
      {...dataSet(data ?? {})}
      style={{ alignSelf: 'center', width: '100%', maxWidth, gap: S[300], padding: pad, borderRadius: R.stage, backgroundColor: colors.card, boxShadow: shadow(colors, 'raised') }}
    >
      {children}
    </View>
  );
}

function Bar({ percent, label }: { percent: number; label?: string }) {
  const { colors } = useUiTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ height: 4, width: '100%', borderRadius: R.pill, backgroundColor: colors.fill, overflow: 'hidden' }}>
      <View style={{ height: 4, width: `${value}%`, borderRadius: R.pill, backgroundColor: colors.ink }} />
    </View>
  );
}

function Loading({ screen, onCommand }: { screen: Extract<DiagnosticScreen, { kind: 'loading' }>; onCommand: DiagnosticCommandHandler }) {
  return (
    <Card data={{ diagScreen: 'loading' }}>
      <View style={{ alignItems: 'center', gap: S[200], paddingVertical: S[300] }}>
        <UiText variant="bodySm" tone="secondary" align="center" aria-live="polite">{screen.loadingText}</UiText>
        <View style={{ width: '100%', maxWidth: 300, gap: S[75] }}>
          <Bar percent={screen.percent} label={screen.loadingText} />
          <UiText variant="labelSm" tone="tertiary" align="center">{screen.step}</UiText>
        </View>
        <PillAction label={screen.cancelLabel} onPress={() => onCommand('cancel')} data={{ diagCommand: 'cancel' }} />
      </View>
    </Card>
  );
}

/** Same row as the quiz (site `.ui-option`): 12px radius, inset hairline, ink ring and #f9f9f9 when chosen. */
function OptionRow({ option, index, selected, onCommand, renderRich }: { option: DiagnosticOption; index: number; selected: boolean; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { hovered, focused, handlers } = usePressFeedback();
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onPress={() => onCommand('select', index)}
      {...handlers}
      {...dataSet({ diagCommand: 'select', diagIndex: index })}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: S[100],
        minHeight: H.option + 4,
        paddingLeft: S[100],
        paddingRight: S[200],
        paddingVertical: S[100],
        borderRadius: R.row,
        backgroundColor: selected || hovered ? subtle : colors.card,
        boxShadow: insetRing(selected ? colors.ink : hovered ? colors.hairlineStrong : colors.hairline, selected ? 1.5 : 1),
        ...focusRing(colors, focused),
        ...transition('background-color, box-shadow', reduced),
      }}
    >
      <View aria-hidden style={{ width: 24, height: 24, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : colors.card, boxShadow: selected ? undefined : insetRing(colors.hairlineStrong) }}>
        <UiText variant="labelSm" tone={selected ? 'onInk' : 'secondary'}>{option.letter}</UiText>
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>{renderRich(option.text, 'diag-option')}</View>
    </Pressable>
  );
}

function Question({ screen, onCommand, renderRich }: { screen: Extract<DiagnosticScreen, { kind: 'question' }>; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  const { colors } = useUiTheme();
  const answered = screen.selected !== null && screen.selected >= 0;
  const advance = screen.isLast ? 'finish' : 'next';
  return (
    <Card data={{ diagScreen: 'question' }}>
      <View style={{ alignSelf: 'flex-start', height: H.tag, justifyContent: 'center', paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: colors.fill }}>
        <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400', fontVariant: ['tabular-nums'] }}>{screen.numberLabel}</UiText>
      </View>
      <View>{renderRich(screen.questionHtml, 'diag-question')}</View>
      <View role="radiogroup" aria-label={screen.numberLabel} style={{ gap: S[75] }}>
        {screen.options.map((option, index) => (
          <OptionRow key={`${option.letter}-${index}`} option={option} index={index} selected={screen.selected === index} onCommand={onCommand} renderRich={renderRich} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S[75], paddingTop: S[200], borderTopWidth: 1, borderTopColor: colors.hairline }}>
        <View style={{ opacity: screen.isFirst ? 0 : 1 }} pointerEvents={screen.isFirst ? 'none' : 'auto'} aria-hidden={screen.isFirst || undefined}>
          <PillAction label={screen.labels.back} onPress={() => onCommand('previous')} data={{ diagCommand: 'previous' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: S[75] }}>
          <PillAction tone="soft" label={screen.labels.skip} onPress={() => onCommand('skip')} data={{ diagCommand: 'skip' }} />
          <PillAction tone="solid" label={screen.isLast ? screen.labels.begin : screen.labels.next} disabled={!answered} onPress={() => onCommand(advance)} data={{ diagCommand: advance }} />
        </View>
      </View>
    </Card>
  );
}

function Results({ screen, onCommand, renderRich, renderText }: { screen: Extract<DiagnosticScreen, { kind: 'results' }>; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich; renderText: RenderDiagnosticText }) {
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  const report = diagnosticReport(screen.nodes);
  const copy = screen.copy;
  const insight = screen.insight?.status === 'ready' ? screen.insight : null;
  const aiNext = insight?.nextStep?.trim() || '';
  const aiSummary = insight?.summary?.trim() || '';
  return (
    <View {...dataSet({ diagScreen: 'results' })} style={{ alignSelf: 'center', width: '100%', maxWidth: 640, gap: S[300] }}>
      <UiText variant="title" align="center" role="heading" aria-level={2}>{screen.title}</UiText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S[100] }}>
        <View {...dataSet({ diagCoverage: report.coverage })} style={{ flexGrow: 1, flexBasis: 240, gap: S[100], padding: S[300], borderRadius: R.sheet, backgroundColor: subtle, boxShadow: insetRing(colors.hairline) }}>
          <UiText variant="labelSm" tone="tertiary">{copy.coverage}</UiText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: S[75], marginTop: 'auto' }}>
            <UiText variant="title" style={{ fontVariant: ['tabular-nums'] }}>{`${report.coverage}%`}</UiText>
            <UiText variant="labelSm" tone="secondary">{fill(copy.coverageOf, { n: report.familiar, total: report.total })}</UiText>
          </View>
          <Bar percent={report.coverage} label={copy.coverage} />
        </View>
        <View {...dataSet({ diagNext: '1' })} style={{ flexGrow: 1, flexBasis: 240, gap: S[75], padding: S[300], borderRadius: R.sheet, backgroundColor: subtle, boxShadow: insetRing(colors.hairline) }}>
          <UiText variant="labelSm" tone="tertiary">{copy.next}</UiText>
          {aiNext ? (
            <>
              <UiText variant="bodySm" {...dataSet({ diagAiNext: '1' })}>{renderText(aiNext, 'diag-ai-next')}</UiText>
              {aiSummary ? <UiText variant="bodySm" tone="secondary" {...dataSet({ diagAiSummary: '1' })}>{renderText(aiSummary, 'diag-ai-summary')}</UiText> : null}
            </>
          ) : (
            <>
              {report.startsWith ? <UiText variant="bodySm">{renderText(fill(copy.startsWith, { name: report.startsWith }), 'diag-starts-with')}</UiText> : null}
              <UiText variant="bodySm" tone="secondary">{report.focus.length ? renderText(fill(copy.focus, { names: report.focus.join(copy.separator) }), 'diag-focus') : copy.allFamiliar}</UiText>
              {screen.insight?.status === 'loading' && copy.analyzing ? (
                <UiText variant="labelSm" tone="tertiary" aria-live="polite" {...dataSet({ diagAnalyzing: '1' })}>{copy.analyzing}</UiText>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={{ gap: S[100] }}>
        <UiText variant="labelSm" tone="secondary" style={{ paddingHorizontal: S[50] }}>{copy.gaps}</UiText>
        <View role="list" aria-label={copy.gaps} style={{ borderRadius: R.card, backgroundColor: colors.card, boxShadow: shadow(colors, 'raised'), overflow: 'hidden' }}>
          {report.ranked.map((node, index) => {
            const familiar = node.status === 'fuzzy';
            const reason = insight?.reasons?.[node.order]?.trim() || '';
            return (
              <View
                key={`${node.name}-${node.order}`}
                role="listitem"
                aria-label={`${fill(copy.rankLabel, { n: node.rank })} ${node.name}, ${familiar ? screen.statusLabels.fuzzy : screen.statusLabels.blank}`}
                {...dataSet({ diagRank: node.rank, diagStatus: node.status })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: S[100], minHeight: 56, paddingHorizontal: S[200], paddingVertical: S[100], borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }}
              >
                <View aria-hidden style={{ minWidth: 32, height: 24, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, boxShadow: insetRing(colors.hairlineStrong) }}>
                  <UiText variant="labelSm" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>{String(node.rank).padStart(2, '0')}</UiText>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <UiText variant="label">{renderText(node.name, 'diag-node')}</UiText>
                  {reason ? <UiText variant="labelSm" tone="secondary" style={{ fontWeight: '400' }} {...dataSet({ diagReason: node.order })}>{renderText(reason, 'diag-reason')}</UiText> : null}
                </View>
                <View style={{ height: H.tag, justifyContent: 'center', paddingHorizontal: 10, borderRadius: R.pill, backgroundColor: familiar ? colors.card : colors.fill, boxShadow: familiar ? insetRing(colors.ink, 1.5) : undefined }}>
                  <UiText variant="eyebrow" tone={familiar ? 'ink' : 'tertiary'} style={{ letterSpacing: 0 }}>{familiar ? screen.statusLabels.fuzzy : screen.statusLabels.blank}</UiText>
                </View>
              </View>
            );
          })}
        </View>
        <UiText variant="labelSm" tone="tertiary" align="center">{screen.summary}</UiText>
      </View>

      <View style={{ padding: S[200], borderRadius: R.card, backgroundColor: subtle, boxShadow: insetRing(colors.hairline) }}>{renderRich(screen.noticeHtml, 'diag-notice')}</View>

      <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
        <PillAction tone="solid" label={screen.continueLabel} onPress={() => onCommand('proceed')} data={{ diagCommand: 'proceed' }} />
      </View>
    </View>
  );
}

function Failure({ screen, onCommand }: { screen: Extract<DiagnosticScreen, { kind: 'error' }>; onCommand: DiagnosticCommandHandler }) {
  return (
    <Card maxWidth={520} data={{ diagScreen: 'error' }}>
      <View style={{ alignItems: 'center', gap: S[100], paddingVertical: S[300] }} role="alert">
        <UiText variant="titleSm" align="center">{screen.title}</UiText>
        {screen.reason ? <UiText variant="labelSm" tone="tertiary" align="center" style={{ maxWidth: 340 }}>{screen.reason}</UiText> : null}
        <View style={{ flexDirection: 'row', gap: S[75], marginTop: S[75] }}>
          <PillAction tone="solid" label={screen.retryLabel} onPress={() => onCommand('retry')} data={{ diagCommand: 'retry' }} />
          <PillAction label={screen.builtinLabel} onPress={() => onCommand('builtin')} data={{ diagCommand: 'builtin' }} />
        </View>
      </View>
    </Card>
  );
}
