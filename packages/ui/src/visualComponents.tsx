import { useId, useState, type ReactNode } from 'react';
import { uiRadius, uiSpace } from '@socrates/theme';
import { UiText } from './primitives/UiText';
import { useUiTheme } from './primitives/theme';
import { Platform, Pressable, View } from './react-web';

// CSS interprets the shared numeric line heights as multipliers in the web host.
const webLineHeight = Platform.select({ web: { lineHeight: 'normal' } });
const numericTextStyle = [webLineHeight, { fontVariant: ['tabular-nums'] }];

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
    <View
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: uiSpace[2],
        padding: uiSpace[3],
        backgroundColor: colors.fill,
        borderRadius: uiRadius.md,
      }}
    >
      <View
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
      </View>
      <UiText aria-live={playing ? 'off' : 'polite'} variant="bodySm" style={webLineHeight}>
        {children}
      </UiText>
    </View>
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
    <View
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
    </View>
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
    <View style={{ display: 'flex', flexDirection: 'column', gap: uiSpace[1], minWidth: 0 }}>
      <View
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
      </View>
      <View
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
        <View
          style={{
            height: '100%',
            width: `${percent}%`,
            backgroundColor: colors.action,
            borderRadius: uiRadius.pill,
          }}
        />
      </View>
    </View>
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
    <View style={{ minWidth: 0 }}>
      <Pressable
        className="iui-disclosure-toggle"
        aria-expanded={expanded === true}
        aria-controls={id}
        onPress={() => setExpanded((open) => !open)}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: uiSpace[2],
          paddingLeft: uiSpace[3],
          paddingRight: uiSpace[3],
          borderRadius: uiRadius.sm,
          backgroundColor: colors.fill,
        }}
      >
        <UiText variant="label" style={webLineHeight}>
          {label}
        </UiText>
        <UiText aria-hidden variant="label" tone="secondary" style={webLineHeight}>
          {expanded ? '−' : '+'}
        </UiText>
      </Pressable>
      <View
        nativeID={id}
        style={{
          display: expanded ? 'flex' : 'none',
          flexDirection: 'column',
          gap: uiSpace[2],
          paddingTop: uiSpace[2],
        }}
      >
        {expanded !== null ? children : null}
      </View>
    </View>
  );
}
