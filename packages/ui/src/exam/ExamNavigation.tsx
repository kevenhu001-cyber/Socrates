/** Question navigation: step buttons, counter and the numbered pill row. */
import { Pressable, View } from 'react-native';
import { dataSet } from '../learn/parts';
import { R, S, insetRing } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import type { ExamCommandHandler } from './model';
import type { ExamStrings } from './strings';

function StepButton({ label, glyph, disabled, onPress }: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress(): void;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <Pressable role="button" aria-label={label} aria-disabled={disabled || undefined} disabled={disabled} onPress={onPress} {...handlers}>
      <View style={{
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: R.row,
        backgroundColor: hovered && !disabled ? colors.fill : colors.card,
        boxShadow: insetRing(colors.hairlineStrong),
        opacity: disabled ? 0.4 : 1,
      }}>
        <UiText variant="body" tone="secondary">{glyph}</UiText>
      </View>
    </Pressable>
  );
}

function NavPill({ index, current, answered, label, onPress }: {
  index: number;
  current: boolean;
  answered: boolean;
  label: string;
  onPress(): void;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  const ring = current ? colors.ink : answered ? colors.inkSecondary : colors.hairlineStrong;
  return (
    <Pressable
      role="button"
      aria-label={label}
      {...({ 'aria-current': current ? 'step' : undefined } as object)}
      onPress={onPress}
      {...handlers}
      {...dataSet({ examNavPill: 1, answered: answered ? 'true' : 'false', current: current ? 'true' : 'false' })}
    >
      <View style={{
        minWidth: 32,
        height: 32,
        paddingHorizontal: S[50],
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: R.pill,
        backgroundColor: current ? colors.subtle : hovered ? colors.fill : colors.card,
        boxShadow: insetRing(ring, current ? 1.5 : 1),
      }}>
        <UiText variant="labelSm" tone={current ? 'ink' : 'secondary'}>{String(index + 1)}</UiText>
      </View>
    </Pressable>
  );
}

function CounterDivider() {
  const { colors } = useUiTheme();
  return <View style={{ width: 1, height: 10, alignSelf: 'center', backgroundColor: colors.hairlineStrong }} />;
}

export function ExamNavigation({ current, total, answered, isSubmitted, strings, onCommand }: {
  current: number;
  total: number;
  answered: number[];
  isSubmitted: boolean;
  strings: ExamStrings;
  onCommand: ExamCommandHandler;
}) {
  const safeCurrent = Math.max(0, Math.min(total - 1, current));
  const answeredSet = new Set(answered);
  const labels = strings.nav;

  return (
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: S[75] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[100] }}>
        <StepButton label={labels.previous} glyph="‹" disabled={safeCurrent <= 0} onPress={() => onCommand('previous')} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: S[50] }}>
          <UiText variant="body" {...dataSet({ examNavCurrent: 1 })}>{String(safeCurrent + 1)}</UiText>
          <UiText variant="bodySm" tone="tertiary">/ {total}</UiText>
          {isSubmitted ? null : (
            <>
              <CounterDivider />
              <UiText variant="bodySm" tone="tertiary" {...dataSet({ examNavProgress: 1 })}>
                {answeredSet.size} {labels.answered}
              </UiText>
            </>
          )}
        </View>
        <StepButton label={labels.next} glyph="›" disabled={safeCurrent >= total - 1} onPress={() => onCommand('next')} />
      </View>
      <View role="group" aria-label={labels.previous} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S[50] }}>
        {Array.from({ length: total }, (_, index) => (
          <NavPill
            key={index}
            index={index}
            current={index === safeCurrent}
            answered={answeredSet.has(index)}
            label={`${index + 1}${answeredSet.has(index) ? `, ${labels.answered}` : ''}`}
            onPress={() => onCommand('jump', index)}
          />
        ))}
      </View>
    </View>
  );
}
