import { useId, useState, type ReactNode } from 'react';
import { uiRadius, uiSpace } from '@socrates/theme';
import { UiText, type UiTextStyle } from './primitives/UiText';
import { useUiTheme } from './primitives/theme';

// CSS interprets the shared numeric line heights as multipliers in the web host.
const webLineHeight: UiTextStyle = { lineHeight: 'normal' };
const numericTextStyle: UiTextStyle[] = [webLineHeight, { fontVariant: ['tabular-nums'] }];

export function VisualStepFrame({
  label,
  position,
  children,
  playing,
}: {
  label: ReactNode;
  position: string;
  children: ReactNode;
  playing: boolean;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: uiSpace[2],
        padding: uiSpace[3],
        backgroundColor: colors.fill,
        borderRadius: uiRadius.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: uiSpace[1],
        }}
      >
        <UiText variant="labelSm" tone="secondary" style={webLineHeight}>
          {label}
        </UiText>
        <UiText variant="labelSm" tone="secondary" style={numericTextStyle}>
          {position}
        </UiText>
      </div>
      <UiText aria-live={playing ? 'off' : 'polite'} variant="bodySm" style={webLineHeight}>
        {children}
      </UiText>
    </div>
  );
}

export function VisualMetric({
  label,
  value,
  detail,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}) {
  const { colors } = useUiTheme();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: uiSpace[1],
        padding: uiSpace[3],
        minWidth: 0,
        borderRadius: uiRadius.md,
        backgroundColor: colors.fill,
      }}
    >
      <UiText variant="labelSm" tone="secondary" style={webLineHeight}>
        {label}
      </UiText>
      <UiText variant="titleSm" style={numericTextStyle}>
        {value}
      </UiText>
      {detail != null && (
        <UiText variant="bodySm" tone="secondary" style={webLineHeight}>
          {detail}
        </UiText>
      )}
    </div>
  );
}

export function VisualMeter({
  label,
  labelText,
  value,
  min,
  max,
  unit,
  showRange = true,
}: {
  label: ReactNode;
  labelText: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  showRange?: boolean;
}) {
  const { colors } = useUiTheme();
  const measurement = (amount: number) => (unit ? `${amount} ${unit}` : String(amount));
  const readout = measurement(value);
  const range = max - min;
  if (!(range > 0 && Number.isFinite(range))) return <VisualMetric label={label} value={readout} />;

  const bounded = Math.min(max, Math.max(min, value));
  const percent = ((bounded - min) / range) * 100;
  const rangeText =
    min === 0 ? `${value} / ${measurement(max)}` : `${readout} (${min}–${measurement(max)})`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: uiSpace[1], minWidth: 0 }}>
      <div
        aria-hidden={true}
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: uiSpace[2],
          justifyContent: 'space-between',
        }}
      >
        <UiText variant="labelSm" style={webLineHeight}>
          {label}
        </UiText>
        <UiText variant="labelSm" tone="secondary" style={numericTextStyle}>
          {showRange ? rangeText : readout}
        </UiText>
      </div>
      <div
        role="meter"
        aria-label={labelText}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={bounded}
        aria-valuetext={showRange ? rangeText : readout}
        style={{
          height: uiSpace[2],
          backgroundColor: colors.fillPressed,
          borderRadius: uiRadius.pill,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${percent}%`,
            backgroundColor: colors.action,
            borderRadius: uiRadius.pill,
          }}
        />
      </div>
    </div>
  );
}

export function VisualDisclosure({
  label,
  defaultOpen,
  children,
}: {
  label: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { colors } = useUiTheme();
  const id = useId();
  // A closed panel mounts its content on first open, then retains local inputs.
  const [expanded, setExpanded] = useState(() => (defaultOpen === true ? true : null));
  return (
    <div style={{ minWidth: 0 }}>
      <button
        type="button"
        className="iui-disclosure-toggle"
        aria-expanded={expanded === true}
        aria-controls={id}
        onClick={() => setExpanded((open) => !open)}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: uiSpace[2],
          width: '100%',
          paddingLeft: uiSpace[3],
          paddingRight: uiSpace[3],
          paddingTop: 0,
          paddingBottom: 0,
          border: 0,
          borderRadius: uiRadius.sm,
          backgroundColor: colors.fill,
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <UiText variant="label" style={webLineHeight}>
          {label}
        </UiText>
        <UiText aria-hidden variant="label" tone="secondary" style={webLineHeight}>
          {expanded ? '−' : '+'}
        </UiText>
      </button>
      <div
        id={id}
        style={{
          display: expanded ? 'flex' : 'none',
          flexDirection: 'column',
          gap: uiSpace[2],
          paddingTop: uiSpace[2],
        }}
      >
        {expanded !== null ? children : null}
      </div>
    </div>
  );
}
