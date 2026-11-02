/**
 * RN-5 diagnostic surface. One host view takes turns showing the loading,
 * question, results and failure screens; every control reports a command to
 * the host (`data-diag-command` stays on each control for the web shell).
 * Question / option / notice copy arrives as host-rendered rich content
 * (`renderRich`), so math and links keep the shell's renderer.
 */
import { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { uiRadius, uiSpace } from '@socrates/theme';
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
  /** Host-rendered rich source (HTML on web). */
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
    }
  | { kind: 'error'; title: string; reason: string; retryLabel: string; builtinLabel: string };

export type RenderDiagnosticRich = (source: string, part: 'diag-question' | 'diag-option' | 'diag-notice') => ReactNode;

export function DiagnosticPanel({ screen, onCommand, renderRich }: { screen: DiagnosticScreen; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  if (screen.kind === 'loading') return <Loading screen={screen} onCommand={onCommand} />;
  if (screen.kind === 'question') return <Question screen={screen} onCommand={onCommand} renderRich={renderRich} />;
  if (screen.kind === 'results') return <Results screen={screen} onCommand={onCommand} renderRich={renderRich} />;
  return <Failure screen={screen} onCommand={onCommand} />;
}

function Card({ children, maxWidth = 720, data }: { children: ReactNode; maxWidth?: number; data?: Record<string, string> }) {
  const { colors } = useUiTheme();
  return (
    <View
      {...dataSet(data ?? {})}
      style={{ alignSelf: 'center', width: '100%', maxWidth, gap: uiSpace[5], padding: uiSpace[5], borderRadius: uiRadius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card }}
    >
      {children}
    </View>
  );
}

function Bar({ percent, label }: { percent: number; label?: string }) {
  const { colors } = useUiTheme();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} style={{ height: 4, width: '100%', borderRadius: uiRadius.pill, backgroundColor: colors.fill, overflow: 'hidden' }}>
      <View style={{ height: 4, width: `${value}%`, borderRadius: uiRadius.pill, backgroundColor: colors.ink }} />
    </View>
  );
}

function Loading({ screen, onCommand }: { screen: Extract<DiagnosticScreen, { kind: 'loading' }>; onCommand: DiagnosticCommandHandler }) {
  return (
    <Card data={{ diagScreen: 'loading' }}>
      <View style={{ alignItems: 'center', gap: uiSpace[3], paddingVertical: uiSpace[5] }}>
        <UiText variant="bodySm" tone="secondary" align="center" aria-live="polite">{screen.loadingText}</UiText>
        <View style={{ width: '100%', maxWidth: 300, gap: uiSpace[2] }}>
          <Bar percent={screen.percent} label={screen.loadingText} />
          <UiText variant="labelSm" tone="tertiary" align="center">{screen.step}</UiText>
        </View>
        <PillAction label={screen.cancelLabel} onPress={() => onCommand('cancel')} data={{ diagCommand: 'cancel' }} />
      </View>
    </Card>
  );
}

function OptionRow({ option, index, selected, onCommand, renderRich }: { option: DiagnosticOption; index: number; selected: boolean; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  const { colors } = useUiTheme();
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
        gap: uiSpace[3],
        paddingHorizontal: uiSpace[4],
        paddingVertical: uiSpace[3],
        borderRadius: uiRadius.lg,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.ink : colors.hairline,
        backgroundColor: selected ? colors.fill : hovered ? colors.fill : 'transparent',
        outlineStyle: focused ? 'solid' : undefined,
        outlineWidth: focused ? 2 : 0,
        outlineColor: colors.ink,
        outlineOffset: 2,
      }}
    >
      <View aria-hidden style={{ minWidth: 28, height: 22, paddingHorizontal: uiSpace[2], borderRadius: uiRadius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.ink : 'transparent', borderWidth: selected ? 0 : 1, borderColor: colors.hairlineStrong }}>
        <UiText variant="eyebrow" tone={selected ? 'onInk' : 'secondary'} style={{ letterSpacing: 0 }}>{option.letter}</UiText>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{renderRich(option.text, 'diag-option')}</View>
    </Pressable>
  );
}

function Question({ screen, onCommand, renderRich }: { screen: Extract<DiagnosticScreen, { kind: 'question' }>; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  const answered = screen.selected !== null && screen.selected >= 0;
  const advance = screen.isLast ? 'finish' : 'next';
  return (
    <Card data={{ diagScreen: 'question' }}>
      <UiText variant="labelSm" tone="tertiary">{screen.numberLabel}</UiText>
      <View>{renderRich(screen.questionHtml, 'diag-question')}</View>
      <View role="radiogroup" aria-label={screen.numberLabel} style={{ gap: uiSpace[2] }}>
        {screen.options.map((option, index) => (
          <OptionRow key={`${option.letter}-${index}`} option={option} index={index} selected={screen.selected === index} onCommand={onCommand} renderRich={renderRich} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiSpace[2] }}>
        <View style={{ opacity: screen.isFirst ? 0 : 1 }} pointerEvents={screen.isFirst ? 'none' : 'auto'} aria-hidden={screen.isFirst || undefined}>
          <PillAction label={screen.labels.back} onPress={() => onCommand('previous')} data={{ diagCommand: 'previous' }} />
        </View>
        <View style={{ flexDirection: 'row', gap: uiSpace[2] }}>
          <PillAction label={screen.labels.skip} onPress={() => onCommand('skip')} data={{ diagCommand: 'skip' }} />
          <PillAction tone="solid" label={screen.isLast ? screen.labels.begin : screen.labels.next} disabled={!answered} onPress={() => onCommand(advance)} data={{ diagCommand: advance }} />
        </View>
      </View>
    </Card>
  );
}

function Results({ screen, onCommand, renderRich }: { screen: Extract<DiagnosticScreen, { kind: 'results' }>; onCommand: DiagnosticCommandHandler; renderRich: RenderDiagnosticRich }) {
  const { colors } = useUiTheme();
  const report = diagnosticReport(screen.nodes);
  const copy = screen.copy;
  return (
    <View {...dataSet({ diagScreen: 'results' })} style={{ alignSelf: 'center', width: '100%', maxWidth: 640, gap: uiSpace[4] }}>
      <UiText variant="title" align="center" role="heading" aria-level={2}>{screen.title}</UiText>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: uiSpace[3] }}>
        <View {...dataSet({ diagCoverage: report.coverage })} style={{ flexGrow: 1, flexBasis: 240, gap: uiSpace[3], padding: uiSpace[4], borderRadius: uiRadius.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card }}>
          <UiText variant="labelSm" tone="tertiary">{copy.coverage}</UiText>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: uiSpace[2] }}>
            <UiText variant="title" style={{ fontVariant: ['tabular-nums'] }}>{`${report.coverage}%`}</UiText>
            <UiText variant="labelSm" tone="secondary">{fill(copy.coverageOf, { n: report.familiar, total: report.total })}</UiText>
          </View>
          <Bar percent={report.coverage} label={copy.coverage} />
        </View>
        <View {...dataSet({ diagNext: '1' })} style={{ flexGrow: 1, flexBasis: 240, gap: uiSpace[2], padding: uiSpace[4], borderRadius: uiRadius.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card }}>
          <UiText variant="labelSm" tone="tertiary">{copy.next}</UiText>
          {report.startsWith ? <UiText variant="bodySm">{fill(copy.startsWith, { name: report.startsWith })}</UiText> : null}
          <UiText variant="bodySm" tone="secondary">{report.focus.length ? fill(copy.focus, { names: report.focus.join(copy.separator) }) : copy.allFamiliar}</UiText>
        </View>
      </View>

      <View style={{ gap: uiSpace[2] }}>
        <UiText variant="labelSm" tone="tertiary">{copy.gaps}</UiText>
        <View role="list" aria-label={copy.gaps} style={{ borderRadius: uiRadius.lg, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card, overflow: 'hidden' }}>
          {report.ranked.map((node, index) => {
            const familiar = node.status === 'fuzzy';
            return (
              <View
                key={`${node.name}-${node.order}`}
                role="listitem"
                aria-label={`${fill(copy.rankLabel, { n: node.rank })} ${node.name}, ${familiar ? screen.statusLabels.fuzzy : screen.statusLabels.blank}`}
                {...dataSet({ diagRank: node.rank, diagStatus: node.status })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: uiSpace[3], paddingHorizontal: uiSpace[4], paddingVertical: uiSpace[3], borderTopWidth: index ? 1 : 0, borderTopColor: colors.hairline }}
              >
                <UiText variant="labelSm" tone="tertiary" style={{ width: 22, fontVariant: ['tabular-nums'] }}>{String(node.rank).padStart(2, '0')}</UiText>
                <UiText variant="label" style={{ flex: 1, minWidth: 0 }}>{node.name}</UiText>
                <View style={{ paddingHorizontal: uiSpace[3], paddingVertical: 2, borderRadius: uiRadius.pill, borderWidth: familiar ? 1.5 : 1, borderColor: familiar ? colors.ink : colors.hairlineStrong }}>
                  <UiText variant="eyebrow" tone={familiar ? 'ink' : 'tertiary'} style={{ letterSpacing: 0 }}>{familiar ? screen.statusLabels.fuzzy : screen.statusLabels.blank}</UiText>
                </View>
              </View>
            );
          })}
        </View>
        <UiText variant="labelSm" tone="tertiary" align="center">{screen.summary}</UiText>
      </View>

      <View style={{ padding: uiSpace[4], borderRadius: uiRadius.lg, backgroundColor: colors.fill }}>{renderRich(screen.noticeHtml, 'diag-notice')}</View>

      <View style={{ alignItems: 'center' }}>
        <PillAction tone="solid" label={screen.continueLabel} onPress={() => onCommand('proceed')} data={{ diagCommand: 'proceed' }} />
      </View>
    </View>
  );
}

function Failure({ screen, onCommand }: { screen: Extract<DiagnosticScreen, { kind: 'error' }>; onCommand: DiagnosticCommandHandler }) {
  return (
    <Card maxWidth={520} data={{ diagScreen: 'error' }}>
      <View style={{ alignItems: 'center', gap: uiSpace[3], paddingVertical: uiSpace[4] }} role="alert">
        <UiText variant="titleSm" align="center">{screen.title}</UiText>
        {screen.reason ? <UiText variant="labelSm" tone="tertiary" align="center" style={{ maxWidth: 340 }}>{screen.reason}</UiText> : null}
        <View style={{ flexDirection: 'row', gap: uiSpace[2], marginTop: uiSpace[1] }}>
          <PillAction tone="solid" label={screen.retryLabel} onPress={() => onCommand('retry')} data={{ diagCommand: 'retry' }} />
          <PillAction label={screen.builtinLabel} onPress={() => onCommand('builtin')} data={{ diagCommand: 'builtin' }} />
        </View>
      </View>
    </Card>
  );
}
