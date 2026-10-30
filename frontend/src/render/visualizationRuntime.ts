import type { OwnedRootHandle } from '../react/lib/boot/ownedRoot';
import type { VizSpec } from './visualizationSpec.ts';
import type { ChartInstance } from '../types/vendorRuntime.ts';
export interface ExportableChart {
  dispatchAction?: (action: Record<string, unknown>) => void;
  getDataURL(options: { type: string; pixelRatio: number; backgroundColor: string }): string | Promise<string>;
}
export interface VisualizationCard extends HTMLElement {
  webkitRequestFullscreen?: () => void;
  _visualizationDisposed?: boolean;
  _visualizationCleanup?: (() => void) | null;
  _visualizationReactRoots?: OwnedRootHandle[];
  _visualizationUpdate?: (next: VizSpec) => boolean;
}
export interface VisualizationMountOptions {
  toolCallId?: string;
  signal?: AbortSignal;
  noReset?: boolean;
  onReset?: (() => void) | null;
}
export interface LiveChart { chart: ChartInstance; spec: VizSpec }
export interface VisualizationRenderState { chart: (ExportableChart & Partial<Omit<ChartInstance, 'getDataURL' | 'dispatchAction'>>) | null; liveEntry: LiveChart | null }
