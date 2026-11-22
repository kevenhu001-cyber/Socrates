/**
 * Small shared pieces for the turn components: a hairline chevron, a reduced-
 * motion query and the running-step spinner.
 * Nothing here draws a dot; state is carried by text, lines and glyphs.
 */
import type { CSSProperties } from 'react';
import { useUiTheme } from '../primitives/theme';
import { uiMotion } from '@socrates/theme';

/* Kept for the two remaining animation callers; the DOM rewrite no longer
   hands work to a native driver. */
export const nativeDriver = false;

/* The shim never saw the media query, so every consumer animated even when the
   user asked for less motion. The host CSS owns the reduced-motion branch now;
   this hook stays as the shared seam so a host adapter can override it later. */
export function useReducedMotion(): boolean {
  return false;
}

/** Chevron drawn from two hairline borders. Points right when closed and
 * turns down when open, so the rotation itself says "this expands here". */
export function Chevron({
  open = false,
  size = 7,
  tone = 'tertiary',
}: {
  open?: boolean;
  size?: number;
  tone?: 'ink' | 'secondary' | 'tertiary';
}) {
  const { colors } = useUiTheme();
  const color =
    tone === 'ink' ? colors.ink : tone === 'secondary' ? colors.inkSecondary : colors.inkTertiary;
  const glyph: CSSProperties = {
    display: 'block',
    width: size,
    height: size,
    borderRight: `1.5px solid ${color}`,
    borderBottom: `1.5px solid ${color}`,
    marginLeft: -2,
    transform: `rotate(${open ? 45 : -45}deg)`,
    transition: `transform ${uiMotion.fast}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
  };
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        width: 16,
        height: 16,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={glyph} />
    </span>
  );
}

/** Fades content in when it first appears (an expanded body, a sheet). *  The host CSS owns the transition, so the body is already at full opacity
 *  in the frame the toggle commits instead of flashing in from 0. */
export function useReveal(visible: boolean, distance = 4): CSSProperties {
  void visible;
  void distance;
  return { opacity: 1, transform: 'translateY(0)' };
}

/** A 12px arc that turns while a step runs. The host CSS owns the rotation,
 *  so one compositor animation serves every row on the surface. */
export function Spinner({ size = 12 }: { size?: number }) {
  const { colors } = useUiTheme();
  return (
    <span
      data-testid="thinking-step-spinner"
      aria-hidden
      className="socrates-step-spinner"
      style={{
        display: 'block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `1.5px solid ${colors.hairlineStrong}`,
        borderTopColor: colors.inkSecondary,
      }}
    />
  );
}
