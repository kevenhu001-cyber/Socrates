import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react';
import {
  createDemonstrationRuntime,
  normalizeDemonstrationProgram,
  validateDemonstration,
  type DemonstrationProgram,
  type DemonstrationParameter,
} from '@socrates/core';
import { MathText } from '../../rn/useInlineMath';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../legacy/gateway';
import { BlockSkeleton } from '../BlockSkeleton';
import { DemoPlot } from './DemonstrationPlot';
import { DemoScene } from './DemonstrationScene';
import { DemoField } from './DemonstrationField';
import { DemoIssue } from './DemonstrationIssue';

const format = (value: number, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—';
const errorPath = (error: unknown) => error && typeof error === 'object' && typeof (error as { path?: unknown }).path === 'string'
  ? (error as { path: string }).path
  : '';

type ParsedProgram = { program: DemonstrationProgram | null; error: string; path: string };
type Calculation = { runtime: ReturnType<typeof createDemonstrationRuntime> | null; error: string; path: string };
type DemoView = DemonstrationProgram['views'][number];

function failureHeadline(path: string): string {
  return path
    ? i18n('intui.demo.invalidAt', 'Demonstration error in {path}').replace('{path}', path)
    : i18n('intui.demo.unavailable', 'This demonstration could not complete its calculation.');
}

function parseProgram(serialized: string): ParsedProgram {
  try {
    const program = normalizeDemonstrationProgram(JSON.parse(serialized) as unknown);
    const result = validateDemonstration(program);
    return result.ok
      ? { program: program as DemonstrationProgram, error: '', path: '' }
      : { program: null, error: result.error, path: result.path ?? '' };
  } catch {
    return { program: null, error: 'Invalid demonstration', path: '' };
  }
}

function calculate(program: DemonstrationProgram | null, values: Record<string, number>, parsed: ParsedProgram): Calculation {
  if (!program) return { runtime: null, error: parsed.error, path: parsed.path };
  try {
    return { runtime: createDemonstrationRuntime(program, values), error: '', path: '' };
  } catch (error) {
    return {
      runtime: null,
      error: error instanceof Error ? error.message : 'Calculation failed',
      path: errorPath(error),
    };
  }
}

function nextParameterValues(
  program: DemonstrationProgram | null,
  prior: DemonstrationProgram | null,
  previous: Record<string, number>,
): Record<string, number> {
  const reset = prior?.resetKey !== program?.resetKey;
  return Object.fromEntries((program?.parameters ?? []).map((parameter) => {
    const old = prior?.parameters?.find((item) => item.id === parameter.id);
    const value = reset || !old || old.value !== parameter.value ? parameter.value : previous[parameter.id];
    return [parameter.id, Number.isFinite(value) ? Math.max(parameter.min, Math.min(parameter.max, value)) : parameter.value];
  }));
}

function usePlayback(duration: number, host: RefObject<HTMLElement | null>) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    setPlaying(!media.matches && duration > 0);
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, [duration, host]);

  useEffect(() => {
    if (!playing || !visible || reduced || !duration) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (document.hidden) {
        previous = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (now - previous >= 50) {
        const delta = Math.min(.1, (now - previous) / 1000);
        previous = now;
        setTime((value) => Math.min(duration, value + delta));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, reduced, duration]);

  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration]);

  return { time, setTime, playing, setPlaying, reduced };
}

function useDemonstration(input: unknown, host: RefObject<HTMLElement | null>) {
  const serialized = JSON.stringify(input) ?? 'null';
  const parsed = useMemo(() => parseProgram(serialized), [serialized]);
  const program = parsed.program;
  const previousProgram = useRef<DemonstrationProgram | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const id = useId();
  const calculation = useMemo(() => calculate(program, values, parsed), [program, values, parsed]);
  const duration = calculation.runtime?.duration ?? 0;
  const playback = usePlayback(duration, host);
  const { time, setTime, playing, setPlaying, reduced } = playback;

  useEffect(() => {
    const prior = previousProgram.current;
    previousProgram.current = program;
    setTime(0);
    setValues((previous) => nextParameterValues(program, prior, previous));
  }, [program, setTime]);

  return { parsed, program, values, setValues, id, calculation, duration, time, setTime, playing, setPlaying, reduced };
}

function ParameterControl({ parameter, value, id, onChange }: {
  parameter: DemonstrationParameter;
  value: number;
  id: string;
  onChange: (key: string, value: number) => void;
}) {
  const controlId = `${id}-${parameter.id}`;
  return <div className="demo-control" key={parameter.id}>
    <Label htmlFor={controlId}><MathText text={parameter.label || parameter.id} /></Label>
    <NativeControl id={controlId} type="range" min={parameter.min} max={parameter.max}
      step={parameter.step ?? (parameter.max - parameter.min) / 100} value={value}
      onChange={(event) => onChange(parameter.id, Number(event.target.value))} />
    <output htmlFor={controlId}>{format(value)}{parameter.unit ? <span> {parameter.unit}</span> : null}</output>
  </div>;
}

function ParameterControls({ program, runtime, id, onChange, advanced = false }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  id: string;
  onChange: (key: string, value: number) => void;
  advanced?: boolean;
}) {
  const parameters = program.parameters?.filter((parameter) => Boolean(parameter.advanced) === advanced) ?? [];
  return <div className="demo-controls">{parameters.map((parameter) => <ParameterControl key={parameter.id}
    parameter={parameter} value={runtime.parameters[parameter.id]} id={id} onChange={onChange} />)}</div>;
}

function AdvancedParameters({ program, runtime, id, onChange }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  id: string;
  onChange: (key: string, value: number) => void;
}) {
  if (!program.parameters?.some((parameter) => parameter.advanced)) return null;
  return <details className="demo-advanced"><summary>{i18n('intui.demo.parameters', 'More parameters')}</summary>
    <ParameterControls program={program} runtime={runtime} id={id} onChange={onChange} advanced />
  </details>;
}

function PresetButtons({ program, runtime, setTime, setPlaying, setValues }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const [error, setError] = useState('');
  if (!program.presets?.length) return null;
  return <><div className="demo-presets">{program.presets.map((preset, index) => <Button key={index} variant="outline" size="sm" onClick={() => {
    try {
      runtime.resetBudget();
      const values = Object.fromEntries(Object.entries(preset.values).map(([key, expression]) => {
        const value = runtime.evaluate(expression);
        const parameter = program.parameters?.find(parameter => parameter.id === key);
        if (!Number.isFinite(value) || !parameter || value < parameter.min || value > parameter.max) throw Error(`Preset ${key}: value must be finite and within its parameter range`);
        return [key, value];
      }));
      setPlaying(false);
      setTime(0);
      setValues(previous => ({ ...previous, ...values }));
      setError('');
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }

  }}><MathText text={preset.label} /></Button>)}</div>{error ? <div className="demo-note" role="status"><DemoIssue headline={failureHeadline('presets')} details={[error]} /></div> : null}</>;
}

function TimeControls({ duration, time, playing, reduced, setTime, setPlaying }: {
  duration: number;
  time: number;
  playing: boolean;
  reduced: boolean;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean | ((previous: boolean) => boolean)) => void;
}) {
  if (duration <= 0) return null;
  return <div className="demo-time">
    <Button size="sm" variant="ghost" disabled={reduced} aria-pressed={playing} onClick={() => {
      if (time >= duration) setTime(0);
      setPlaying((value) => !value);
    }}>{playing ? i18n('intui.simPause', 'Pause') : i18n('intui.simPlay', 'Play')}</Button>
    <NativeControl type="range" min={0} max={duration} step="any" value={time} aria-label={i18n('intui.simTime', 'Time')}
      onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} />
    <output>{time.toFixed(2)} s</output>
  </div>;
}

function FailureState({ program, streaming, error, path, onRestore }: {
  program: DemonstrationProgram | null;
  streaming: boolean;
  error: string;
  path: string;
  onRestore: () => void;
}) {
  if (streaming && !program) return <section className="demonstration" aria-busy="true"><BlockSkeleton /></section>;
  return <section className="demonstration demo-error" role="status">
    <DemoIssue headline={failureHeadline(path)} details={[error]} />
    {program ? <Button size="sm" variant="outline" onClick={onRestore}>{i18n('intui.demo.reset', 'Restore defaults')}</Button> : null}
  </section>;
}

function RuntimeWarning({ runtime, onRestore }: { runtime: NonNullable<Calculation['runtime']>; onRestore: () => void }) {
  const warning = runtime.warnings[0];
  if (!warning) return null;
  const headline = i18n('intui.demo.dynamicsStopped', 'The simulation stopped at t = {t} s').replace('{t}', format(warning.time, 2));
  return <div className="demo-error" role="status">
    <DemoIssue headline={headline} details={runtime.warnings.map((item) => item.message)} />
    <Button size="sm" variant="outline" onClick={onRestore}>{i18n('intui.demo.reset', 'Restore defaults')}</Button>
  </div>;
}

function metricValue(runtime: NonNullable<Calculation['runtime']>, expression: string | number, time: number): number {
  try { return runtime.evaluate(expression, time); }
  catch { return Number.NaN; }
}

function renderView(view: DemoView, index: number, program: DemonstrationProgram, runtime: NonNullable<Calculation['runtime']>, time: number, id: string, onChange: (key: string, value: number) => void, pause: () => void): ReactNode {
  if (view.kind === 'controls') return <ParameterControls key={index} program={program} runtime={runtime} id={id} onChange={onChange} />;
  if (view.kind === 'scene') return <DemoScene key={index} view={view} runtime={runtime} time={time} />;
  if (view.kind === 'field') return <DemoField key={index} view={view} runtime={runtime} time={time} onError={pause} />;
  if (view.kind === 'metrics') return <dl className="demo-metrics" key={index}>{view.values.map((value, itemIndex) => <div key={itemIndex}>
    <dt><MathText text={value.label} /></dt>
    <dd>{format(metricValue(runtime, value.expression, time), value.digits ?? 3)}{value.unit ? <span> {value.unit}</span> : null}</dd>
  </div>)}</dl>;
  return <DemoPlot key={index} view={view} runtime={runtime} time={time} />;
}

function DemonstrationViews({ program, runtime, time, id, onChange, pause }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  time: number;
  id: string;
  onChange: (key: string, value: number) => void;
  pause: () => void;
}) {
  return <div className="demo-views">{program.views.map((view, index) => renderView(view, index, program, runtime, time, id, onChange, pause))}</div>;
}

function DemonstrationControls({ program, runtime, id, onChange, setTime, setPlaying, setValues }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  id: string;
  onChange: (key: string, value: number) => void;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
}) {
  const hasControlView = program.views.some((view) => view.kind === 'controls');
  return <>
    {!hasControlView ? <ParameterControls program={program} runtime={runtime} id={id} onChange={onChange} /> : null}
    <AdvancedParameters program={program} runtime={runtime} id={id} onChange={onChange} />
    <PresetButtons program={program} runtime={runtime} setTime={setTime} setPlaying={setPlaying} setValues={setValues} />
  </>;
}

function DemonstrationContent({ program, runtime, title, id, time, playing, reduced, setTime, setPlaying, setValues, pause, onChange, onRestore }: {
  program: DemonstrationProgram;
  runtime: NonNullable<Calculation['runtime']>;
  title?: string;
  id: string;
  time: number;
  playing: boolean;
  reduced: boolean;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean | ((previous: boolean) => boolean)) => void;
  setValues: Dispatch<SetStateAction<Record<string, number>>>;
  pause: () => void;
  onChange: (key: string, value: number) => void;
  onRestore: () => void;
}) {
  return <>
    {title ? <header className="demo-heading">{title}</header> : null}
    <RuntimeWarning runtime={runtime} onRestore={onRestore} />
    <DemonstrationViews program={program} runtime={runtime} time={time} id={id} onChange={onChange} pause={pause} />
    <DemonstrationControls program={program} runtime={runtime} id={id} onChange={onChange} setTime={setTime} setPlaying={setPlaying} setValues={setValues} />
    <TimeControls duration={runtime.duration} time={time} playing={playing} reduced={reduced} setTime={setTime} setPlaying={setPlaying} />
  </>;
}

export function Demonstration({ program: input, title, streaming = false }: { program: unknown; title?: string; streaming?: boolean }) {
  const host = useRef<HTMLElement>(null);
  const model = useDemonstration(input, host);
  const { setPlaying } = model;
  const pause = useCallback(() => setPlaying(false), [setPlaying]);
  const restore = () => { model.setPlaying(false); model.setTime(0); model.setValues({}); };
  if (!model.calculation.runtime || !model.program) {
    return <FailureState program={model.program} streaming={streaming} error={model.calculation.error} path={model.calculation.path} onRestore={restore} />;
  }
  const runtime = model.calculation.runtime;
  runtime.resetBudget();
  const update = (key: string, value: number) => {
    model.setPlaying(false);
    model.setTime(0);
    model.setValues((previous) => ({ ...previous, [key]: value }));
  };
  return <section className="demonstration" ref={host} aria-label={title || i18n('intui.demo.title', 'Interactive demonstration')} data-demonstration="1">
    <DemonstrationContent program={model.program} runtime={runtime} title={title} id={model.id} time={model.time}
      playing={model.playing} reduced={model.reduced} setTime={model.setTime} setPlaying={model.setPlaying}
      setValues={model.setValues} pause={pause} onChange={update} onRestore={restore} />
  </section>;
}
