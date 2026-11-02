/**
 * RN-7 — the question box, drawn in the marketing site's component language
 * (site home-refresh.css `.ask-box`): one white sheet, 24px radius, no
 * border — the edge is a 1px hairline ring folded into a soft shadow that
 * deepens on hover and focus (never a colour). Two storeys, always:
 *
 *   [top]       attachments (optional)
 *   [body]      the host's editor (web: the rich editor, kept as is)
 *   [rail]      + · · · · · · · · · · · · · · effort  mic  (send)
 *
 * The 36px controls sit 8px in from the sheet edge so they are concentric
 * with the 24px corner. The host supplies the editor and the attachment
 * row as slots; everything else is drawn here.
 */
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { uiRadius, uiShadow, uiStep, uiMotion } from '@socrates/theme';
import { useUiTheme } from '../primitives/theme';
import { dataSet } from '../learn/parts';
import { ComposerControls, type ComposerControlsProps } from './ComposerControls';

export interface ComposerFrameProps {
  /** Keyboard focus is inside the editor (host-tracked). */
  focused: boolean;
  /** Phone layout: tighter sheet padding. */
  compact?: boolean;
  /** Shadow recipe; the web passes `var(--ui-elevation-field*)` so the
   * active mode decides. Defaults to the light recipe. */
  shadows?: { field: string; fieldHover: string; fieldFocus: string };
  top?: ReactNode;
  /** Whether the top slot currently shows anything (keeps the rhythm exact). */
  topVisible?: boolean;
  body: ReactNode;
  /** Non-visual host nodes (hidden file input). */
  hidden?: ReactNode;
  controls: Omit<ComposerControlsProps, 'compact'>;
}

export function ComposerFrame({ focused, compact = false, shadows, top, topVisible = false, body, hidden, controls }: ComposerFrameProps) {
  const { colors } = useUiTheme();
  const [hovered, setHovered] = useState(false);
  const shadow = shadows ?? uiShadow.light;
  return (
    <View
      {...dataSet({ composerFrame: '', focused: focused ? 'true' : 'false' })}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        width: '100%',
        borderRadius: uiRadius.card,
        backgroundColor: colors.card,
        boxShadow: focused ? shadow.fieldFocus : hovered ? shadow.fieldHover : shadow.field,
        transitionProperty: 'box-shadow',
        transitionDuration: `${uiMotion.slow - 100}ms`,
        transitionTimingFunction: uiMotion.easeOut,
        paddingTop: compact ? uiStep[100] : uiStep[200],
        paddingBottom: uiStep[75],
        paddingHorizontal: uiStep[75],
      } as object}
    >
      {top ? <View {...dataSet({ composerSlot: 'top' })} style={{ paddingHorizontal: compact ? uiStep[75] : uiStep[100], marginBottom: topVisible ? uiStep[75] : 0 }}>{top}</View> : null}
      <View {...dataSet({ composerSlot: 'body' })} style={{ paddingHorizontal: compact ? uiStep[75] : uiStep[100], minHeight: 26, marginBottom: uiStep[75] }}>
        {body}
      </View>
      <View
        {...dataSet({ composerSlot: 'rail' })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: uiStep[50], minHeight: 36 }}
      >
        <ComposerControls {...controls} compact={compact} />
      </View>
      {hidden}
    </View>
  );
}
