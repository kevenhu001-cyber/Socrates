/**
 * The live "working" glyph on the thinking line: twelve dots on a sphere
 * (the vertices of an icosahedron, so every face of the ball looks evenly
 * filled) turning in 3D around a tilted axis.
 *
 * Each frame projects the dots with a small perspective: near dots are
 * larger and fully inked, far dots smaller and faint, which is what gives
 * the ball its depth. The dots are SVG circles, so they stay crisp at any
 * DPR, and they are re-ordered far-to-near every frame so a near dot always
 * paints over a far one.
 *
 * Colour: `currentColor`, i.e. the caption's ink.
 *
 * Motion: one requestAnimationFrame loop per glyph, writing twelve circles'
 * attributes directly (no React render per frame). One turn takes
 * `PERIOD_MS`. The loop stops while the glyph is off-screen or the tab is
 * hidden, and never starts under `prefers-reduced-motion` or forced colours,
 * where the first frame stays as a static picture. `data-motion` on the svg
 * says which state it is in (`running`, `paused`, `static`).
 */
import { useEffect, useRef, type ReactElement } from 'react';

const VIEW = 24;
const CENTER = VIEW / 2;
/** Sphere radius in viewBox units, before perspective. */
const RADIUS = 6.6;
/** Camera distance from the sphere centre; 4R keeps the near swell modest. */
const CAMERA = RADIUS * 4;
/** Dot radius at the far and near pole, before perspective. */
const DOT_FAR = 1.0;
const DOT_NEAR = 1.8;
const OPACITY_FAR = 0.26;
const OPACITY_NEAR = 1;
/** One full turn. Calm, not a spinner. */
const PERIOD_MS = 2600;
/** Axis tilt: the spin axis leans back and to the side, so dots travel on slanted paths. */
const TILT_X = -0.42;
const TILT_Z = 0.32;
const STILL_QUERY = '(prefers-reduced-motion: reduce), (forced-colors: active)';

type Vec = readonly [number, number, number];
type Dot = { cx: number; cy: number; r: number; opacity: number; z: number };

/* Icosahedron vertices (0, ±1, ±φ) and their cyclic permutations,
   normalised onto the unit sphere. */
const PHI = (1 + Math.sqrt(5)) / 2;
const NORM = Math.sqrt(1 + PHI * PHI);
const UNIT_POINTS: readonly Vec[] = [
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1],
].map(([x, y, z]) => [x / NORM, y / NORM, z / NORM] as const);

export const THINKING_DOT_COUNT = UNIT_POINTS.length;

const round = (value: number): number => Math.round(value * 100) / 100;

/** Dots at spin angle `angle`, sorted far to near (paint order). */
function frameAt(angle: number): Dot[] {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const cosX = Math.cos(TILT_X);
  const sinX = Math.sin(TILT_X);
  const cosZ = Math.cos(TILT_Z);
  const sinZ = Math.sin(TILT_Z);
  const dots = UNIT_POINTS.map(([ux, uy, uz]) => {
    /* Spin around the sphere's own vertical axis... */
    const x1 = ux * cosA + uz * sinA;
    const z1 = -ux * sinA + uz * cosA;
    /* ...then lean that axis back (about X) and sideways (about Z). */
    const y2 = uy * cosX - z1 * sinX;
    const z2 = uy * sinX + z1 * cosX;
    const x3 = x1 * cosZ - y2 * sinZ;
    const y3 = x1 * sinZ + y2 * cosZ;
    const z = z2 * RADIUS;
    const scale = CAMERA / (CAMERA - z);
    const near = (z2 + 1) / 2;
    return {
      cx: round(CENTER + x3 * RADIUS * scale),
      cy: round(CENTER + y3 * RADIUS * scale),
      r: round((DOT_FAR + (DOT_NEAR - DOT_FAR) * near) * scale),
      opacity: round(OPACITY_FAR + (OPACITY_NEAR - OPACITY_FAR) * near),
      z,
    };
  });
  return dots.sort((a, b) => a.z - b.z);
}

/** Resting pose: a quarter turn in, so the static frame reads as a ball. */
const REST_ANGLE = 0.6;
const REST_FRAME = frameAt(REST_ANGLE);

function paint(circles: readonly SVGCircleElement[], dots: readonly Dot[]): void {
  dots.forEach((dot, index) => {
    const circle = circles[index];
    if (!circle) return;
    circle.setAttribute('cx', String(dot.cx));
    circle.setAttribute('cy', String(dot.cy));
    circle.setAttribute('r', String(dot.r));
    circle.setAttribute('opacity', String(dot.opacity));
  });
}

function useOrbit(svgRef: { current: SVGSVGElement | null }): void {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return undefined;
    const circles = Array.from(svg.querySelectorAll<SVGCircleElement>('circle'));
    const still = typeof window.matchMedia === 'function' ? window.matchMedia(STILL_QUERY) : null;
    let frame = 0;
    let onScreen = true;
    let angle = REST_ANGLE;
    let last = 0;

    const tick = (now: number): void => {
      if (last) angle = (angle + ((now - last) / PERIOD_MS) * Math.PI * 2) % (Math.PI * 2);
      last = now;
      paint(circles, frameAt(angle));
      frame = window.requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };
    const sync = (): void => {
      if (still?.matches) {
        stop();
        angle = REST_ANGLE;
        paint(circles, REST_FRAME);
        svg.dataset.motion = 'static';
        return;
      }
      const run = onScreen && document.visibilityState !== 'hidden';
      svg.dataset.motion = run ? 'running' : 'paused';
      if (run && !frame) frame = window.requestAnimationFrame(tick);
      if (!run) stop();
    };

    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        sync();
      })
      : null;
    observer?.observe(svg);
    still?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      stop();
      observer?.disconnect();
      still?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [svgRef]);
}

export function ThinkingSpark({ size = 18 }: { size?: number }): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useOrbit(svgRef);
  return (
    <svg
      ref={svgRef}
      className="thinking-spark"
      data-testid="thinking-spark"
      data-motion="static"
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      aria-hidden="true"
      focusable="false"
    >
      {REST_FRAME.map((dot, index) => (
        <circle key={index} className="thinking-spark-dot" cx={dot.cx} cy={dot.cy} r={dot.r} opacity={dot.opacity} fill="currentColor" />
      ))}
    </svg>
  );
}
