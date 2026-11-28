import type {
  DemonstrationProgram,
  DemonstrationWarning,
  DemonstrationDiagnostics,
} from '@socrates/core/demonstration';
import type { FieldSample } from './sampleField';
import type { PlotSample } from './samplePlot';
import type { SceneSample } from './sampleScene';

export type ViewSample =
  | { kind: 'field'; sample: FieldSample }
  | { kind: 'plot' | 'trajectory'; sample: PlotSample }
  | { kind: 'scene'; sample: SceneSample }
  | { kind: 'metrics'; sample: number[] }
  | { kind: 'error'; problem: string };
export type ViewPatch = { index: number; result: ViewSample; quality: 'preview' | 'full' };

export type FrameInput = {
  revision: number;
  values: Record<string, number>;
  time: number;
  playing: boolean;
  preview: boolean;
};
export type FrameOutput = {
  duration: number;
  warnings: DemonstrationWarning[];
  diagnostics?: DemonstrationDiagnostics;
  animated: boolean;
  patches: ViewPatch[];
};
export type Problem = { message: string; path: string };
export type WorkerRequest =
  | { type: 'open'; card: number; program: DemonstrationProgram }
  | { type: 'close' | 'cancel'; card: number }
  | {
      type: 'frame';
      card: number;
      id: number;
      input: FrameInput;
      known: (ViewPatch['quality'] | null)[];
    }
  | { type: 'preset'; card: number; id: number; revision: number; index: number };

export type WorkerReply = { card: number; id: number } & (
  | { type: 'frame'; frame: FrameOutput }
  | { type: 'preset'; values: Record<string, number> }
  | { type: 'error'; problem: Problem }
  | { type: 'cancelled' }
);
