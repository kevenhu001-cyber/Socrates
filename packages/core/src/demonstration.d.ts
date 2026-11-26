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
  interpolation?: 'linear' | 'step' | 'points' | 'stem';
  samples?: number;
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
  slicePlane?: {axis:'x'|'y'|'z';at:DemonstrationValue};
  presentation?: 'map' | 'surface' | 'curve3d' | 'vectors3d' | 'parametricSurface' | 'isosurface';
  isoLevel?: DemonstrationValue;
  surface3d?: [DemonstrationValue,DemonstrationValue,DemonstrationValue];
  uRange?: [DemonstrationValue,DemonstrationValue];
  vRange?: [DemonstrationValue,DemonstrationValue];
  markers?: DemonstrationMarker[];
  curve3d?: [DemonstrationValue, DemonstrationValue, DemonstrationValue];
  vector3d?: [DemonstrationValue, DemonstrationValue, DemonstrationValue];
  parameterRange?: [DemonstrationValue, DemonstrationValue];
  curveHistory?: boolean;
  surfaceStyle?: 'wireframe' | 'shaded';
  zRange?: [DemonstrationValue, DemonstrationValue];
  palette?: 'light' | 'signed' | 'heat';
  tint?: [number, number, number];
  gamma?: DemonstrationValue;
  exposure?: DemonstrationValue;
  height?: number;
  vector?: [DemonstrationValue, DemonstrationValue];
  vectorScale?: DemonstrationValue;
  streamlines?: boolean;
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
  | (DemonstrationObjectBase & {kind:'cell';center:DemonstrationPoint;radius:DemonstrationValue})
  | (DemonstrationObjectBase & {kind:'atom';center:DemonstrationPoint;radius:DemonstrationValue;element:string})
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
      kind: 'rod' | 'spring' | 'vector' | 'resistor' | 'capacitor' | 'inductor' | 'voltageSource' | 'currentSource' | 'dimension' | 'pin' | 'roller' | 'ground' | 'bond' | 'doubleBond' | 'tripleBond' | 'reactionArrow' | 'reversibleArrow' | 'inhibition';
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
  diagnostics?: boolean;
  resetKey?: string;
  parameters?: DemonstrationParameter[];
  definitions?: Record<string, DemonstrationValue>;
  analysis?: {kind:'fft';expression:DemonstrationValue;timeRange:[number,number];samples?:number;window?:'rectangular'|'hann';removeMean?:boolean;lowpass?:DemonstrationValue} | {kind:'eigen';matrix:DemonstrationValue[][]} | {kind:'sweep';parameter:string;range:[number,number];samples?:number;expression:DemonstrationValue;time?:number};
  finiteElement?: {nodes:number[];diffusion:DemonstrationValue;reaction?:DemonstrationValue;source:DemonstrationValue;left:DemonstrationValue;right:DemonstrationValue};
  optimization?: {variables:{id:string;initial:DemonstrationValue;min:number;max:number}[];objective:DemonstrationValue;goal?:'min'|'max';tolerance?:number;maxIterations?:number};
  nonlinearSystem?: {guess:Record<string,DemonstrationValue>;residuals:Record<string,DemonstrationValue>;tolerance?:number;maxIterations?:number};
  sparseSystem?: {method?:'pcg'|'bicgstab';size:number;entries:[number,number,DemonstrationValue][];rhs:DemonstrationValue[];tolerance?:number;maxIterations?:number};
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
    mechanics?: {coordinates:{position:string;velocity:string;initialPosition:DemonstrationValue;initialVelocity:DemonstrationValue;acceleration:DemonstrationValue}[]};
    coupledFields?: {dimension:1|2;nx:number;ny?:number;xDomain:[number,number];yDomain?:[number,number];boundary:'periodic'|'noFlux';fields:{id:string;initial:DemonstrationValue;diffusivity:DemonstrationValue;reaction?:DemonstrationValue;advection?:[DemonstrationValue]|[DemonstrationValue,DemonstrationValue]}[]};
    reactionNetwork?: {seed?:number;species:{id:string;initial:DemonstrationValue;composition?:Record<string,number>}[];reactions:{id:string;reactants:Record<string,number>;products:Record<string,number>;rateConstant?:DemonstrationValue;rate?:DemonstrationValue}[]};
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
    method?: 'rk4' | 'rk45' | 'sdirk2' | 'grid-implicit' | 'ssa' | 'grid-heun' | 'verlet';
    /** Nonsingular M in M*state'=derivatives; rows/columns follow initial-state key order. */
    massMatrix?: DemonstrationValue[][];
    /** Semi-explicit index-one constraints g(t, state, algebraic)=0. */
    algebraic?: { guess: Record<string, DemonstrationValue>; residuals: Record<string, DemonstrationValue>; tolerance?: number };
    rtol?: number;
    atol?: number;
    events?: { expression: DemonstrationValue; direction?: -1 | 0 | 1; rearmTolerance?: number; terminal?: boolean; reset?: Record<string, DemonstrationValue> }[];
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
export interface DemonstrationDiagnostics {
  method: string;
  acceptedSteps?: number;
  rejectedSteps?: number;
  events?: number;
  derivativeEvaluations?: number;
  maxLocalError?: number;
  minStep?: number;
  maxStep?: number;
  gridNodes?: number;
  storedValues?: number;
  unknowns?: number;
  nonzeros?: number;
  iterations?: number;
  relativeResidual?: number;
  absoluteResidual?: number;
  diffusionCFL?: number;
  transportCFL?: number;
  adColumns?: number;
  finiteDifferenceColumns?: number;
  projectedGradient?: number;
  objectiveEvaluations?: number;
  analysisSamples?: number;
  eigenResidual?: number;
  eigenOrthogonality?: number;
  eigenIterations?: number;
}
export interface DemonstrationRuntime {
  duration: number;
  parameters: Record<string, number>;
  warnings: DemonstrationWarning[];
  eventTimes?: number[];
  diagnostics?: DemonstrationDiagnostics;
  /** Bit mask: x = 1, y = 2, time/state = 4, spaceZ = 8. Parameters are fixed per runtime. */
  dependencies(expression: DemonstrationValue): number;
  resetBudget(): void;
  evaluate(expression: DemonstrationValue, time?: number, x?: number, y?: number, spaceZ?: number): number;
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
