/**
 * Numbered steps joined by a thin vertical rule (no dots): used for a run of
 * <step> blocks and for a derivation split into its chain. Every step is
 * visible by default, so the finished card matches what streamed in; the
 * header's "step through" control folds it to the first step and reveals
 * the rest one at a time.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { R, S, insetRing } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { useLearnHost } from './host';
import { fillTemplate, isFullyRevealed, revealAll, revealNext, revealState, type RevealState } from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard } from './parts';

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

/**
 * One step: a numbered capsule (site "How a session flows" index, `01`)
 * on a 1px rail that runs down to the next step. The capsule carries the
 * number, so the rail never needs a marker.
 */
function StepRow({ step, last, kind, first }: { step: StepItem; last: boolean; kind: string; /** The step just revealed while stepping through: its capsule is ink. */ first: boolean }) {
  const { colors } = useUiTheme();
  return (
    <View testID={`${kind}-step-${step.n}`} style={{ flexDirection: 'row', gap: S[200] }}>
      <View aria-hidden style={{ width: 32, alignItems: 'center' }}>
        <View
          style={{
            minWidth: 32,
            height: 24,
            paddingHorizontal: 6,
            borderRadius: R.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: first ? colors.ink : colors.card,
            boxShadow: first ? undefined : insetRing(colors.hairlineStrong),
          }}
        >
          <UiText variant="labelSm" tone={first ? 'onInk' : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>{String(step.n).padStart(2, '0')}</UiText>
        </View>
        {last ? null : <View style={{ flex: 1, width: 1, minHeight: 8, marginTop: S[50], marginBottom: -S[50], backgroundColor: colors.hairlineStrong }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingTop: 1, paddingBottom: last ? 0 : S[300] }}>
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
          size="sm"
          testID={`${kind}-step-mode`}
          onPress={() => {
            setStepping(true);
            setReveal(revealState(steps.length, 1));
          }}
        />
      ) : undefined}
    >
      {title && title.trim() !== label ? <Rich source={title} part={`${kind}-title`} /> : null}
      <View role="group" aria-label={title || label}>
        {visible.map((step, index) => (
          <StepRow key={`${step.n}-${index}`} step={step} kind={kind} first={stepping && index === visible.length - 1} last={index === visible.length - 1} />
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
