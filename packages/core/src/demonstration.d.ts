export type DemonstrationValue = number | string;
export interface DemonstrationExpression {
  readonly kind: string;
}
export interface DemonstrationParameter {
  id: string;
  label?: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  advanced?: boolean;
}
export interface DemonstrationCurve {
  label?: string;
  expression: DemonstrationValue;
  color?: string;
  dashed?: boolean;
}
export interface DemonstrationMarker {
  label?: string;
  x: DemonstrationValue;
  y: DemonstrationValue;
  color?: string;
}
export interface DemonstrationViewBase {
  label?: string;
  x: [DemonstrationValue, DemonstrationValue];
  y: [DemonstrationValue, DemonstrationValue];
  xLabel?: string;
  yLabel?: string;
}
export interface DemonstrationPlot extends DemonstrationViewBase {
  kind: 'plot';
  /** Evaluate curves along simulation time rather than a spatial axis. */
  history?: boolean;
  /** Fixed spatial y coordinate for a cross section of a 2D field. */
  sliceY?: DemonstrationValue;
  xScale?: 'linear' | 'log';
  yScale?: 'linear' | 'log';
  curves: DemonstrationCurve[];
  markers?: DemonstrationMarker[];
}
export interface DemonstrationField extends DemonstrationViewBase {
  kind: 'field';
  expression: DemonstrationValue;
  presentation?: 'map' | 'surface';
  surfaceStyle?: 'wireframe' | 'shaded';
  zRange?: [DemonstrationValue, DemonstrationValue];
  palette?: 'light' | 'signed' | 'heat';
  tint?: [number, number, number];
  gamma?: DemonstrationValue;
  exposure?: DemonstrationValue;
  height?: number;
  vector?: [DemonstrationValue, DemonstrationValue];
  vectorScale?: DemonstrationValue;
  colorRange?: [DemonstrationValue, DemonstrationValue];
  unit?: string;
  contours?: DemonstrationValue[];
}
export interface DemonstrationTrajectory extends DemonstrationViewBase {
  kind: 'trajectory';
  horizontal: DemonstrationValue;
  vertical: DemonstrationValue;
  color?: string;
}
/** Coordinates and sizes use the same physical units as the scene axes; angles are radians. */
export type DemonstrationPoint = [DemonstrationValue, DemonstrationValue];
export interface DemonstrationObjectBase {
  label?: string;
  color?: 'ink' | 'muted' | 'blue' | 'orange' | 'red' | 'green' | 'violet';
}
export type DemonstrationObject =
  | (DemonstrationObjectBase & {
      kind: 'body';
      center: DemonstrationPoint;
      radius: DemonstrationValue;
    })
  | (DemonstrationObjectBase & {
      kind: 'block';
      center: DemonstrationPoint;
      width: DemonstrationValue;
      height: DemonstrationValue;
      angle?: DemonstrationValue;
    })
  | (DemonstrationObjectBase & {
      kind: 'path';
      points: DemonstrationPoint[];
      closed?: boolean;
      dashed?: boolean;
    })
  | (DemonstrationObjectBase & {
      kind: 'rod' | 'spring' | 'vector' | 'resistor' | 'capacitor' | 'inductor' | 'voltageSource' | 'currentSource' | 'dimension' | 'pin' | 'roller' | 'ground';
      from: DemonstrationPoint;
      to: DemonstrationPoint;
    });
export interface DemonstrationScene extends DemonstrationViewBase {
  kind: 'scene';
  objects: DemonstrationObject[];
}
export interface DemonstrationMetrics {
  kind: 'metrics';
  label?: string;
  values: { label?: string; expression: DemonstrationValue; unit?: string; digits?: number }[];
}
export type DemonstrationView =
  | DemonstrationPlot
  | DemonstrationField
  | DemonstrationTrajectory
  | DemonstrationScene
  | DemonstrationMetrics
  | { kind: 'controls' };
export interface DemonstrationProgram {
  version: 1;
  resetKey?: string;
  parameters?: DemonstrationParameter[];
  definitions?: Record<string, DemonstrationValue>;
  linearAlgebra?: ({id:string;op:'vector';values:DemonstrationValue[]} | {id:string;op:'matrix';values:DemonstrationValue[][]} | {id:string;op:'scale';a:string;factor:DemonstrationValue} | {id:string;op:'norm'|'transpose';a:string} | {id:string;op:'add'|'sub'|'dot'|'cross'|'matmul';a:string;b:string})[];
  dynamics?: {
    initial?: Record<string, DemonstrationValue>;
    derivatives?: Record<string, DemonstrationValue>;
    spatial?: {
      dimension?: 1;
      nodes: number;
      domain: [number, number];
      equation?: 'diffusion' | 'wave';
      diffusivity?: DemonstrationValue;
      speed?: DemonstrationValue;
      initialVelocity?: DemonstrationValue;
      damping?: DemonstrationValue;
      initial: DemonstrationValue;
      left: DemonstrationValue;
      right: DemonstrationValue;
      source?: DemonstrationValue;
    } | {
      dimension: 2;
      equation?: 'diffusion';
      nx: number;
      ny: number;
      xDomain: [number, number];
      yDomain: [number, number];
      diffusivity: DemonstrationValue;
      initial: DemonstrationValue;
      boundary: DemonstrationValue;
      source?: DemonstrationValue;
    };
    stateSpace?: {
      states: string[];
      initial: DemonstrationValue[];
      A: DemonstrationValue[][];
      B: DemonstrationValue[][];
      inputs: DemonstrationValue[];
      C: DemonstrationValue[][];
      D: DemonstrationValue[][];
      outputs: string[];
    };
    circuit?: {
      nodes: string[];
      elements: { kind: 'R' | 'L' | 'C' | 'V' | 'I'; id: string; p: string; n: string; value: DemonstrationValue; initial?: DemonstrationValue }[];
    };
    duration: number;
    step: number;
    method?: 'rk4' | 'rk45' | 'sdirk2' | 'grid-implicit';
    /** Nonsingular M in M*state'=derivatives; rows/columns follow initial-state key order. */
    massMatrix?: DemonstrationValue[][];
    /** Semi-explicit index-one constraints g(t, state, algebraic)=0. */
    algebraic?: { guess: Record<string, DemonstrationValue>; residuals: Record<string, DemonstrationValue>; tolerance?: number };
    rtol?: number;
    atol?: number;
    events?: { expression: DemonstrationValue; direction?: -1 | 0 | 1; terminal?: boolean; reset?: Record<string, DemonstrationValue> }[];
  };
  duration?: number;
  views: DemonstrationView[];
  presets?: { label?: string; values: Record<string, DemonstrationValue> }[];
}
export interface DemonstrationWarning {
  path: string;
  time: number;
  message: string;
}
export interface DemonstrationRuntime {
  duration: number;
  parameters: Record<string, number>;
  warnings: DemonstrationWarning[];
  eventTimes?: number[];
  /** Bit mask: x = 1, y = 2, time or dynamic state = 4. Parameters are fixed for this runtime. */
  dependencies(expression: DemonstrationValue): number;
  resetBudget(): void;
  evaluate(expression: DemonstrationValue, time?: number, x?: number, y?: number): number;
  stateAt(time: number): Record<string, number>;
}
export function parseDemonstrationExpression(input: DemonstrationValue): DemonstrationExpression;
export function evaluateDemonstrationExpression(
  ast: DemonstrationExpression,
  scope: Record<string, number>,
  budget?: { remaining: number },
): number;
export interface DemonstrationIssue {
  path: string;
  message: string;
}
export function validateDemonstration(
  input: unknown,
): { ok: true } | { ok: false; error: string; path?: string; issues?: DemonstrationIssue[] };
export function normalizeDemonstrationProgram(input: unknown): unknown;
export function normalizeDemonstrationExpression<T>(source: T): T;
export function normalizeDemonstrationIdentifier<T>(value: T): T;
export function isDemonstrationBudgetError(error: unknown): boolean;
export const DEMONSTRATION_LOOP_LIMIT: number;
/** Accepts any program shape: it normalizes, then validates, and throws on failure. */
export function createDemonstrationRuntime(
  input: unknown,
  values?: Record<string, number>,
): DemonstrationRuntime;

export function compileDemonstrationRuntime(
  input: unknown,
): (values?: Record<string, number>) => Generator<void, DemonstrationRuntime, void>;

export function demonstrationDomain(
  bounds: [DemonstrationValue, DemonstrationValue],
  runtime: Pick<DemonstrationRuntime, 'evaluate'>,
  time?: number,
  fallback?: [number, number],
): [number, number];
