/**
 * Numbered steps joined by a thin vertical rule (no dots): used for a run of
 * <step> blocks and for a derivation split into its chain. Every step is
 * visible by default, so the finished card matches what streamed in; the
 * header's "step through" control folds it to the first step and reveals
 * the rest one at a time.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { uiSpace } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { useLearnHost } from './host';
import { fillTemplate, isFullyRevealed, revealAll, revealNext, revealState, type RevealState } from './model';
import { ActionRow, PillAction, Rich } from './parts';
import { ScaffoldCard } from './parts';

export interface StepItem {
  /** Displayed number (a <step n="…"> value, or the position). */
  n: number;
  body: string;
}

export interface StepsCardProps {
  kind: 'step' | 'derivation';
  title?: string;
  steps: readonly StepItem[];
  testID?: string;
}

function StepRow({ step, last, kind }: { step: StepItem; last: boolean; kind: string }) {
  const { colors } = useUiTheme();
  return (
    <View role="listitem" testID={`${kind}-step-${step.n}`} style={{ flexDirection: 'row', gap: uiSpace[3] }}>
      <View aria-hidden style={{ width: 20, alignItems: 'center' }}>
        <UiText variant="labelSm" tone="secondary" style={{ fontVariant: ['tabular-nums'], lineHeight: 24 }}>{String(step.n)}</UiText>
        {last ? null : <View style={{ flex: 1, width: 1, minHeight: 8, marginTop: 2, backgroundColor: colors.hairlineStrong }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : uiSpace[3] }}>
        <Rich source={step.body} part={`${kind}-step`} />
      </View>
    </View>
  );
}

export function StepsCard({ kind, title, steps, testID }: StepsCardProps) {
  const { strings } = useLearnHost();
  const [stepping, setStepping] = useState(false);
  const [reveal, setReveal] = useState<RevealState>(() => revealState(steps.length, steps.length));
  const visible = stepping ? steps.slice(0, Math.max(1, reveal.shown)) : steps;
  const label = kind === 'derivation' ? strings.label.derivation : strings.label.step;
  const canStep = steps.length > 1;
  return (
    <ScaffoldCard
      kind={kind}
      label={label}
      testID={testID}
      trailing={canStep && !stepping ? (
        <PillAction
          label={strings.stepsStepMode}
          tone="quiet"
          testID={`${kind}-step-mode`}
          onPress={() => {
            setStepping(true);
            setReveal(revealState(steps.length, 1));
          }}
        />
      ) : undefined}
    >
      {title && title.trim() !== label ? <Rich source={title} part={`${kind}-title`} /> : null}
      <View role="list" aria-label={title || label}>
        {visible.map((step, index) => (
          <StepRow key={`${step.n}-${index}`} step={step} kind={kind} last={index === visible.length - 1} />
        ))}
      </View>
      {stepping && !isFullyRevealed(reveal) ? (
        <ActionRow>
          <PillAction
            label={fillTemplate(strings.stepsNext, { n: reveal.shown + 1, total: reveal.total })}
            tone="soft"
            testID={`${kind}-next`}
            onPress={() => setReveal(revealNext(reveal))}
          />
          <PillAction
            label={strings.stepsAll}
            tone="quiet"
            testID={`${kind}-all`}
            onPress={() => {
              setReveal(revealAll(reveal));
              setStepping(false);
            }}
          />
        </ActionRow>
      ) : null}
    </ScaffoldCard>
  );
}
