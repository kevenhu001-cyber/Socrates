/**
 * RN-7 — the question box, drawn in the marketing site's component language
 * (site home-refresh.css `.ask-box`): one white sheet, 24px radius, no
 * border — the edge is a 1px hairline ring folded into a soft shadow that
 * deepens on hover and focus. The stacked layout uses three slots:
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
import { uiRadius, uiShadow, uiStep, uiMotion } from '@socrates/theme';
import { dataAttributes } from '../domProps';
import { domStyle } from '../domStyle';
import { useUiTheme } from '../primitives/theme';
import { ComposerControls, type ComposerControlsProps } from './ComposerControls';

export interface ComposerFrameProps {
  /** Keyboard focus is inside the editor (host-tracked). */
  focused: boolean;
  /** The host can expand the inline layout without replacing its slots. */
  expanded?: boolean;
  /** Phone layout: tighter sheet padding. */
  compact?: boolean;
  /**
   * `inline` places the tools and send controls around the editor.
   * `stacked` (default) gives the editor and controls their own rows.
   */
  layout?: 'stacked' | 'inline';
  /** Sheet fill. Web passes the mode's composer surface; native defaults to
   *  the card paper. */
  surface?: string;
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

export function ComposerFrame({
  focused,
  expanded = false,
  compact = false,
  layout = 'stacked',
  surface,
  shadows,
  top,
  topVisible = false,
  body,
  hidden,
  controls,
}: ComposerFrameProps) {
  const { colors } = useUiTheme();
  const [hovered, setHovered] = useState(false);
  const shadow = shadows ?? uiShadow.light;
  const inline = layout === 'inline';
  return (
    <div
      {...dataAttributes({
        composerFrame: '',
        focused: focused ? 'true' : 'false',
        expanded: expanded ? 'true' : 'false',
        layout: inline ? 'inline' : 'stacked',
      })}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={domStyle({
        width: '100%',
        borderRadius: inline
          ? `var(--composer-frame-radius, ${uiRadius.composer}px)`
          : compact
            ? uiRadius.card + uiStep[25]
            : uiRadius.card,
        backgroundColor: surface ?? colors.card,
        /* The inline sheet is flat: its edge is a fill step, not a ring. The
           web layer draws the focus hairline so the frame keeps no shadow. */
        boxShadow: inline
          ? undefined
          : focused
            ? shadow.fieldFocus
            : hovered
              ? shadow.fieldHover
              : shadow.field,
        transitionProperty: inline ? undefined : 'box-shadow, background-color',
        transitionDuration: inline ? undefined : `${uiMotion.slow - 100}ms`,
        transitionTimingFunction: inline ? undefined : uiMotion.easeOut,
        paddingTop: inline ? uiStep[75] : compact ? uiStep[75] : uiStep[200],
        paddingBottom: inline ? uiStep[75] : uiStep[75],
        paddingHorizontal: uiStep[75],
      })}
    >
      {top ? (
        <div
          {...dataAttributes({ composerSlot: 'top' })}
          style={domStyle({
            paddingHorizontal: compact ? uiStep[75] : uiStep[100],
            marginBottom: topVisible ? uiStep[75] : 0,
          })}
        >
          {top}
        </div>
      ) : null}
      {inline ? (
        <div
          {...dataAttributes({ composerSlot: 'inline' })}
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: uiStep[25],
            minHeight: 36,
          }}
        >
          <ComposerControls {...controls} compact={compact} part="leading" />
          <div
            {...dataAttributes({ composerSlot: 'body' })}
            style={{
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
              padding: `var(--composer-body-padding, 3px 0 3px ${uiStep[50]}px)`,
            }}
          >
            {body}
          </div>
          <div
            {...dataAttributes({ composerSlot: 'trailing' })}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              /* Phone controls carry a 4px hit slop on each side, so the rail
                 keeps a wider rhythm there; the send rule adds its own 4px. */
              gap: compact ? uiStep[50] : uiStep[25],
              flexShrink: 0,
            }}
          >
            <ComposerControls {...controls} compact={compact} part="trailing" />
          </div>
        </div>
      ) : (
        <>
          <div
            {...dataAttributes({ composerSlot: 'body' })}
            style={domStyle({
              paddingHorizontal: compact ? uiStep[75] : uiStep[100],
              minHeight: 26,
              marginBottom: uiStep[75],
            })}
          >
            {body}
          </div>
          <div
            {...dataAttributes({ composerSlot: 'rail' })}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              /* The phone reference keeps an 8px gap between the rail controls;
             desktop uses the quieter 4px rhythm. */
              gap: compact ? uiStep[100] : uiStep[50],
              minHeight: 36,
            }}
          >
            <ComposerControls {...controls} compact={compact} />
          </div>
        </>
      )}
      {hidden}
    </div>
  );
}
