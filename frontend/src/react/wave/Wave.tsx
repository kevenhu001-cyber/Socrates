/**
 * react/wave/Wave.tsx — the left-to-right wave loader.
 *
 * A travelling band of bars whose lit column sweeps across the row and wraps.
 * It replaces the per-surface rings and spinners that each announced
 * "something is happening" without saying where, and it is one element so a
 * tool row, the turn status line and a full-page loader all share the same
 * rhythm (a spinner per surface meant three tempos on one screen).
 *
 * The stagger is arithmetic, not CSS rules: bar `i` of `count` gets a delay
 * of `-(i * step)`, which makes the lit column enter from the left and exit
 * on the right while every bar animates the identical keyframe.
 */
import type { CSSProperties } from 'react';

export type WaveSize = 'inline' | 'md' | 'lg';

const SIZE_CLASS: Record<WaveSize, string> = {
  inline: 'wave-inline',
  md: 'wave-md',
  lg: 'wave-lg',
};

export interface WaveProps {
  /** Bar count. 3 reads as a dot, 5 as a band, 7 as a spectrum. */
  count?: number;
  /** Footprint: inline for a tool-icon slot, md for a status line, lg for a page. */
  size?: WaveSize;
  /** Override the bar count without touching geometry (used by the page loader). */
  className?: string;
}

export function Wave({ count = 5, size = 'md', className }: WaveProps) {
  /* A count of 0 would render an empty box that still reserves the slot —
     callers that conditionally show a wave must do it themselves. Clamping
     to 1 keeps the footprint honest either way. */
  const bars = Math.max(1, Math.floor(count));
  const step = 100 / bars;

  return (
    <span
      className={['wave', SIZE_CLASS[size], className].filter(Boolean).join(' ')}
      data-wave=""
      data-wave-size={size}
      aria-hidden="true"
    >
      {Array.from({ length: bars }, (_unused, index) => (
        <span
          key={index}
          className="wave-bar"
          style={{ '--ui-wave-delay': `${-index * step}%` } as CSSProperties}
        />
      ))}
    </span>
  );
}

export default Wave;
