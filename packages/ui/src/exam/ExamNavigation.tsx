/** Question navigation: step buttons, counter and the numbered pill row. */
import { dataAttributes } from '../domProps';
import { R, S, insetRing } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import type { ExamCommandHandler } from './model';
import type { ExamStrings } from './strings';

function StepButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress(): void;
}) {
  const { colors } = useUiTheme();
  const { hovered, handlers } = usePressFeedback();
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onPress}
      {...handlers}
      style={{
        appearance: 'none',
        margin: 0,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={{
          display: 'flex',
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: R.row,
          backgroundColor: hovered && !disabled ? colors.fill : colors.card,
          boxShadow: insetRing(colors.hairlineStrong),
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <UiText variant="body" tone="secondary">
          {glyph}
        </UiText>
      </span>
    </button>
  );
}

function NavPill({
  index,
  current,
  answered,
  label,
  onPress,
}: {
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
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'step' : undefined}
      onClick={onPress}
      {...handlers}
      {...dataAttributes({
        examNavPill: 1,
        answered: answered ? 'true' : 'false',
        current: current ? 'true' : 'false',
      })}
      style={{
        appearance: 'none',
        margin: 0,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          display: 'flex',
          minWidth: 32,
          height: 32,
          paddingLeft: S[50],
          paddingRight: S[50],
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: R.pill,
          backgroundColor: current ? colors.subtle : hovered ? colors.fill : colors.card,
          boxShadow: insetRing(ring, current ? 1.5 : 1),
        }}
      >
        <UiText variant="labelSm" tone={current ? 'ink' : 'secondary'}>
          {String(index + 1)}
        </UiText>
      </span>
    </button>
  );
}

function CounterDivider() {
  const { colors } = useUiTheme();
  return (
    <div
      style={{ width: 1, height: 10, alignSelf: 'center', backgroundColor: colors.hairlineStrong }}
    />
  );
}

export function ExamNavigation({
  current,
  total,
  answered,
  isSubmitted,
  strings,
  onCommand,
}: {
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        gap: S[75],
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: S[100] }}>
        <StepButton
          label={labels.previous}
          glyph="‹"
          disabled={safeCurrent <= 0}
          onPress={() => onCommand('previous')}
        />
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: S[50],
          }}
        >
          <UiText variant="body" {...dataAttributes({ examNavCurrent: 1 })}>
            {String(safeCurrent + 1)}
          </UiText>
          <UiText variant="bodySm" tone="tertiary">
            / {total}
          </UiText>
          {isSubmitted ? null : (
            <>
              <CounterDivider />
              <UiText variant="bodySm" tone="tertiary" {...dataAttributes({ examNavProgress: 1 })}>
                {answeredSet.size} {labels.answered}
              </UiText>
            </>
          )}
        </div>
        <StepButton
          label={labels.next}
          glyph="›"
          disabled={safeCurrent >= total - 1}
          onPress={() => onCommand('next')}
        />
      </div>
      <div
        role="group"
        aria-label={labels.previous}
        style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: S[50] }}
      >
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
      </div>
    </div>
  );
}
