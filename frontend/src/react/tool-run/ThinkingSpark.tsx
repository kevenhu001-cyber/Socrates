/**
 * The live "working" glyph on the thinking line: an eight-ray spark drawn as
 * one inline SVG path, so it stays vector at every zoom level.
 *
 * Colour: `currentColor`, i.e. the caption's ink. The ChatGPT reference
 * palette is neutral (greys plus one blue action), so the spark reads as
 * part of the text rather than a brand-coloured badge.
 *
 * Motion (features/thinking-activity.css): the outer group turns slowly
 * while the rays breathe in scale. Both stop under
 * `prefers-reduced-motion`, leaving the static glyph.
 */
import type { ReactElement } from 'react';

/* Alternating long / short rays with slightly uneven lengths, closing on a
   2.1px core; the round-joined stroke softens every tip. */
const SPARK_PATH = 'M12 1.4 12.8 10.06 17.09 6.91 13.94 11.2 22 12 13.94 12.8 17.52 17.52 12.8 13.94 12 22.6 11.2 13.94 7.05 16.95 10.06 12.8 1.8 12 10.06 11.2 6.63 6.63 11.2 10.06Z';

export function ThinkingSpark({ size = 18 }: { size?: number }): ReactElement {
  return (
    <svg
      className="thinking-spark"
      data-testid="thinking-spark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g className="thinking-spark-turn">
        <path className="thinking-spark-rays" d={SPARK_PATH} fill="currentColor" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      </g>
    </svg>
  );
}
