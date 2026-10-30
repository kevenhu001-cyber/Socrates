export interface ChartInstance {
  setOption(options: unknown, update?: { notMerge?: boolean; replaceMerge?: string[] }): void;
  resize(): void;
  dispose(): void;
  isDisposed(): boolean;
  clear(): void;
  on(name: string, callback: () => void): void;
  dispatchAction(action: Record<string, unknown>): void;
  getDataURL(options: Record<string, unknown>): string;
}
export interface GeoGebraApi {
  evalCommand(command: string): boolean;
  setCoordSystem(xMin: number, xMax: number, yMin: number, yMax: number): void;
  getPNGBase64(scale: number, transparent: boolean, dpi: number): string;
}
/** Narrow interfaces for the self-hosted classic-script renderers. */
export interface MermaidRuntime {
  initialize(options: Record<string, unknown>): void;
  parse(code: string, options?: { suppressErrors?: boolean }): boolean | Promise<unknown>;
  render(id: string, code: string): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
}
export interface VendorGlobals {
  marked: typeof import('marked')['marked'];
  DOMPurify: typeof import('dompurify').default;
  Fuse: typeof import('fuse.js').default;
  mermaid: MermaidRuntime;
  hljs: typeof import('highlight.js').default;
  katex: { renderToString(source: string, options?: Record<string, unknown>): string; render(source: string, target: Element, options?: Record<string, unknown>): void };
  echarts: { init(target: HTMLElement, theme?: string | null, options?: Record<string, unknown>): ChartInstance };
  Plotly: {
    newPlot(target: HTMLElement | string, data: unknown[], layout?: unknown, config?: unknown): Promise<unknown>;
    purge(target: HTMLElement | string): void;
    react(target: HTMLElement | string, data: unknown[], layout?: unknown, config?: unknown): Promise<unknown>;
    relayout(target: HTMLElement | string, update: Record<string, unknown>): Promise<unknown>;
    toImage(target: HTMLElement | string, options?: Record<string, unknown>): Promise<string>;
  };
}
