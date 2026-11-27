/**
 * The live "working" glyph on the thinking line: twelve dots on a sphere
 * (the vertices of an icosahedron, so every face of the ball looks evenly
 * filled) turning in 3D around a tilted axis that slowly precesses.
 *
 * Motion is compositor-driven via the Web Animations API (`transform` and
 * `opacity` only), pausing automatically when off-screen, in hidden tabs,
 * or under `prefers-reduced-motion` / `forced-colors`.
 */
import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';

const VIEW = 24;
const RADIUS = 7.4;
const CAMERA = RADIUS * 5;
const DOT_NEAR = 2.15;
const DEPTH_RATIO = 1.65;
const OPACITY_FAR = 0.28;
const OPACITY_NEAR = 1;
const PERIOD_MS = 3200;
const SAMPLES = 72;
const TILT_X = -0.42;
const TILT_Z = 0.32;
const PRECESSION = 0.07;
const REST_PHASE = 0.1;
const STILL_QUERY = '(prefers-reduced-motion: reduce), (forced-colors: active)';

type Vec = readonly [number, number, number];
type Pose = { transform: string; opacity: number };

const PHI = (1 + Math.sqrt(5)) / 2;
const NORM = Math.sqrt(1 + PHI * PHI);
const UNIT_POINTS: readonly Vec[] = [
  [0, 1, PHI],
  [0, -1, PHI],
  [0, 1, -PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [-1, PHI, 0],
  [1, -PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [-PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, -1],
].map(([x, y, z]) => [x / NORM, y / NORM, z / NORM] as const);

export const THINKING_DOT_COUNT = UNIT_POINTS.length;

const round = (value: number, places: number): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function posesAt(phase: number): Pose[] {
  const turn = phase * Math.PI * 2;
  const cosA = Math.cos(turn);
  const sinA = Math.sin(turn);
  const tiltX = TILT_X + PRECESSION * Math.sin(turn);
  const tiltZ = TILT_Z + PRECESSION * Math.cos(turn);
  const cosX = Math.cos(tiltX);
  const sinX = Math.sin(tiltX);
  const cosZ = Math.cos(tiltZ);
  const sinZ = Math.sin(tiltZ);
  return UNIT_POINTS.map(([ux, uy, uz]) => {
    const x1 = ux * cosA + uz * sinA;
    const z1 = -ux * sinA + uz * cosA;
    const y2 = uy * cosX - z1 * sinX;
    const z2 = uy * sinX + z1 * cosX;
    const x3 = x1 * cosZ - y2 * sinZ;
    const y3 = x1 * sinZ + y2 * cosZ;
    const perspective = CAMERA / (CAMERA - z2 * RADIUS);
    const near = (z2 + 1) / 2;
    const dx = ((x3 * RADIUS * perspective) / DOT_NEAR) * 100;
    const dy = ((y3 * RADIUS * perspective) / DOT_NEAR) * 100;
    const scale = 1 / DEPTH_RATIO + (1 - 1 / DEPTH_RATIO) * near;
    return {
      transform: `translate(${round(dx, 2)}%, ${round(dy, 2)}%) scale(${round(scale, 4)})`,
      opacity: round(OPACITY_FAR + (OPACITY_NEAR - OPACITY_FAR) * near, 4),
    };
  });
}

const TRACKS: readonly Keyframe[][] = (() => {
  const frames = Array.from({ length: SAMPLES + 1 }, (_, index) =>
    posesAt((index % SAMPLES) / SAMPLES),
  );
  return UNIT_POINTS.map((_, dot) => frames.map((poses) => ({ ...poses[dot] })));
})();

const REST_POSES = posesAt(REST_PHASE);

const DOT_SHARE = (DOT_NEAR / VIEW) * 100;
const DOT_BOX: CSSProperties = {
  width: `${DOT_SHARE}%`,
  height: `${DOT_SHARE}%`,
  left: `${50 - DOT_SHARE / 2}%`,
  top: `${50 - DOT_SHARE / 2}%`,
};

function useOrbit(rootRef: { current: HTMLSpanElement | null }): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;
    const dots = Array.from(root.querySelectorAll<HTMLElement>('.thinking-spark-dot'));
    if (dots.length === 0 || typeof dots[0].animate !== 'function') return undefined;
    const still = typeof window.matchMedia === 'function' ? window.matchMedia(STILL_QUERY) : null;
    let animations: Animation[] = [];
    let onScreen = true;

    const start = (): void => {
      if (animations.length > 0) return;
      animations = dots.map((dot, index) => {
        const animation = dot.animate(TRACKS[index], {
          duration: PERIOD_MS,
          iterations: Infinity,
          easing: 'linear',
        });
        animation.currentTime = REST_PHASE * PERIOD_MS;
        return animation;
      });
    };
    const cancel = (): void => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };
    const sync = (): void => {
      if (still?.matches) {
        cancel();
        root.dataset.motion = 'static';
        return;
      }
      const run = onScreen && document.visibilityState !== 'hidden';
      root.dataset.motion = run ? 'running' : 'paused';
      start();
      animations.forEach((animation) => (run ? animation.play() : animation.pause()));
    };

    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            sync();
          })
        : null;
    observer?.observe(root);
    still?.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      cancel();
      observer?.disconnect();
      still?.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [rootRef]);
}

export function ThinkingSpark({ size = 16 }: { size?: number }): ReactElement {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  useOrbit(rootRef);
  return (
    <span
      ref={rootRef}
      className="thinking-spark"
      data-testid="thinking-spark"
      data-motion="static"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {REST_POSES.map((pose, index) => (
        <span
          key={index}
          className="thinking-spark-dot"
          style={{ ...DOT_BOX, transform: pose.transform, opacity: pose.opacity }}
        />
      ))}
    </span>
  );
}
