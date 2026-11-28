import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  normalizeDemonstrationProgram,
  validateDemonstration,
} from '@socrates/core/demonstrationLight';
import {
  type DemonstrationProgram,
  type DemonstrationWarning,
  type DemonstrationDiagnostics,
  type DemonstrationParameter,
} from '@socrates/core/demonstration';
import { MathText } from '../../rn/useInlineMath';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../../ui/legacyI18n.ts';
import { BlockSkeleton } from '../BlockSkeleton';
import { DemoPlot } from './DemonstrationPlot';
import { DemoScene } from './DemonstrationScene';
import { DemoField } from './DemonstrationField';
import { demoUnit } from './mathLabels';
import { DemoIssue } from './DemonstrationIssue';
import { useDemonstrationFrames, useDemonstrationVisibility } from './useDemonstrationFrames';
import { usePlayback, usePreview } from './interaction/playback';
import type { ViewSample } from './demonstrationProtocol';

type Preset = ReturnType<typeof useDemonstrationFrames>['preset'];

const format = (value: number, digits = 3) =>
  Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—';
type ParsedProgram = { program: DemonstrationProgram | null; error: string; path: string };
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

function nextParameterValues(
  program: DemonstrationProgram | null,
  prior: DemonstrationProgram | null,
  previous: Record<string, number>,
): Record<string, number> {
  const reset = prior?.resetKey !== program?.resetKey;
  return Object.fromEntries(
    (program?.parameters ?? []).map((parameter) => {
      const old = prior?.parameters?.find((item) => item.id === parameter.id);
      const value =
        reset || !old || old.value !== parameter.value ? parameter.value : previous[parameter.id];
      return [
        parameter.id,
        Number.isFinite(value)
          ? Math.max(parameter.min, Math.min(parameter.max, value))
          : parameter.value,
      ];
    }),
  );
}

function ParameterControl({
  parameter,
  value,
  id,
  onChange,
}: {
  parameter: DemonstrationParameter;
  value: number;
  id: string;
  onChange: (key: string, value: number) => void;
}) {
  const controlId = `${id}-${parameter.id}`;
  return (
    <div className="demo-control" key={parameter.id}>
      <Label htmlFor={controlId}>
        <MathText text={parameter.label || parameter.id} />
      </Label>
      <NativeControl
        id={controlId}
        type="range"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step ?? (parameter.max - parameter.min) / 100}
        value={value}
        onChange={(event) => onChange(parameter.id, Number(event.target.value))}
      />
      <output htmlFor={controlId}>
        {format(value)}
        {parameter.unit ? (
          <span>
            {' '}
            <MathText text={demoUnit(parameter.unit)} />
          </span>
        ) : null}
      </output>
    </div>
  );
}

const ParameterControls = memo(function ParameterControls({
  program,
  values,
  id,
  onChange,
  advanced = false,
}: {
  program: DemonstrationProgram;
  values: Record<string, number>;
  id: string;
  onChange: (key: string, value: number) => void;
  advanced?: boolean;
}) {
  const parameters =
    program.parameters?.filter((parameter) => Boolean(parameter.advanced) === advanced) ?? [];
  return (
    <div className="demo-controls">
      {parameters.map((parameter) => (
        <ParameterControl
          key={parameter.id}
          parameter={parameter}
          value={values[parameter.id] ?? parameter.value}
          id={id}
          onChange={onChange}
        />
      ))}
    </div>
  );
});

function AdvancedParameters({
  program,
  values,
  id,
  onChange,
}: {
  program: DemonstrationProgram;
  values: Record<string, number>;
  id: string;
  onChange: (key: string, value: number) => void;
}) {
  if (!program.parameters?.some((parameter) => parameter.advanced)) return null;
  return (
    <details className="demo-advanced">
      <summary>{i18n('intui.demo.parameters', 'More parameters')}</summary>
      <ParameterControls program={program} values={values} id={id} onChange={onChange} advanced />
    </details>
  );
}

function PresetButtons({
  program,
  preset,
  onPreset,
}: {
  program: DemonstrationProgram;
  preset: Preset;
  onPreset: (values: Record<string, number>) => void;
}) {
  const [error, setError] = useState('');
  if (!program.presets?.length) return null;
  return (
    <>
      <div className="demo-presets">
        {program.presets.map((item, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() =>
              preset(index, (values, problem) => {
                setError(problem?.message ?? '');
                if (values) onPreset(values);
              })
            }
          >
            <MathText text={item.label} />
          </Button>
        ))}
      </div>
      {error ? (
        <div className="demo-note" role="status">
          <DemoIssue headline={failureHeadline('presets')} details={[error]} />
        </div>
      ) : null}
    </>
  );
}

function TimeControls({
  duration,
  time,
  playing,
  reduced,
  setTime,
  setPlaying,
  onScrub,
}: {
  duration: number;
  time: number;
  playing: boolean;
  reduced: boolean;
  onScrub: (time: number) => void;
  setTime: (time: number) => void;
  setPlaying: (playing: boolean | ((previous: boolean) => boolean)) => void;
}) {
  if (duration <= 0) return null;
  return (
    <div className="demo-time">
      <Button
        size="sm"
        variant="ghost"
        disabled={reduced}
        aria-pressed={playing}
        onClick={() => {
          if (time >= duration) setTime(0);
          setPlaying((value) => !value);
        }}
      >
        {playing ? i18n('intui.simPause', 'Pause') : i18n('intui.simPlay', 'Play')}
      </Button>
      <NativeControl
        type="range"
        min={0}
        max={duration}
        step="any"
        value={time}
        aria-label={i18n('intui.simTime', 'Time')}
        onChange={(event) => onScrub(Number(event.target.value))}
      />
      <output>{time.toFixed(2)} s</output>
    </div>
  );
}

function FailureState({
  streaming,
  error,
  path,
}: {
  streaming: boolean;
  error: string;
  path: string;
}) {
  if (streaming)
    return (
      <section className="demonstration" aria-busy="true">
        <BlockSkeleton />
      </section>
    );
  return (
    <section className="demonstration demo-error" role="status">
      <DemoIssue headline={failureHeadline(path)} details={[error]} />
    </section>
  );
}

const restoreLabel = () => i18n('intui.demo.reset', 'Restore defaults');

function RuntimeWarning({
  warnings,
  onRestore,
}: {
  warnings: DemonstrationWarning[];
  onRestore: () => void;
}) {
  const warning = warnings[0];
  if (!warning) return null;
  const headline = i18n(
    'intui.demo.dynamicsStopped',
    'The simulation stopped at t = {t} s',
  ).replace('{t}', format(warning.time, 2));
  return (
    <div className="demo-error" role="status">
      <DemoIssue headline={headline} details={warnings.map((item) => item.message)} />
      <Button size="sm" variant="outline" onClick={onRestore}>
        {restoreLabel()}
      </Button>
    </div>
  );
}

const DemoMetrics = memo(function DemoMetrics({
  view,
  values,
}: {
  view: Extract<DemoView, { kind: 'metrics' }>;
  values?: number[];
}) {
  return (
    <dl className="demo-metrics">
      {view.values.map((value, index) => (
        <div key={index}>
          <dt>
            <MathText text={value.label} />
          </dt>
          <dd>
            {format(values?.[index] ?? Number.NaN, value.digits ?? 3)}
            {value.unit ? (
              <span>
                {' '}
                <MathText text={demoUnit(value.unit)} />
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
});

function renderView(view: DemoView, index: number, result: ViewSample | undefined) {
  const problem = result?.kind === 'error' ? result.problem : undefined;
  switch (view.kind) {
    case 'controls':
      return null;
    case 'field':
      return (
        <DemoField
          key={index}
          view={view}
          sample={result?.kind === 'field' ? result.sample : undefined}
          problem={problem}
        />
      );
    case 'scene':
      return (
        <DemoScene
          key={index}
          view={view}
          sample={result?.kind === 'scene' ? result.sample : undefined}
        />
      );
    case 'metrics':
      return (
        <DemoMetrics
          key={index}
          view={view}
          values={result?.kind === 'metrics' ? result.sample : undefined}
        />
      );
    default:
      return (
        <DemoPlot
          key={index}
          view={view}
          sample={result?.kind === view.kind ? result.sample : undefined}
          problem={problem}
        />
      );
  }
}

function useDemonstrationState(program: DemonstrationProgram | null, visible: boolean) {
  const [previousProgram, setPreviousProgram] = useState(program);
  const [values, setValues] = useState<Record<string, number>>({});
  if (program !== previousProgram) {
    setPreviousProgram(program);
    setValues(nextParameterValues(program, previousProgram, values));
  }
  const { time, setTime, playing, setPlaying, reduced, play } = usePlayback(program, visible);
  const { preview, requestPreview } = usePreview(visible);
  const { snapshot, ready, problem, preset } = useDemonstrationFrames(
    program,
    visible,
    values,
    time,
    playing,
    preview,
  );
  const duration = snapshot?.duration ?? 0;
  const fieldFailed = snapshot?.views.some(
    (result, index) => result?.kind === 'error' && program?.views[index]?.kind === 'field',
  );
  useEffect(() => play(duration), [play, duration]);
  useEffect(() => {
    if ((snapshot && time >= duration) || problem || fieldFailed) setPlaying(false);
    if (snapshot && time > duration) setTime(duration);
  }, [duration, time, snapshot, problem, fieldFailed, setPlaying, setTime]);

  const restore = useCallback(() => {
    setPlaying(false);
    setTime(0);
    setValues({});
  }, [setPlaying, setTime]);
  const onChange = useCallback(
    (key: string, value: number) => {
      setPlaying(false);
      setTime(0);
      setValues((previous) => ({ ...previous, [key]: value }));
      requestPreview();
    },
    [setPlaying, setTime, requestPreview],
  );
  const onPreset = useCallback(
    (next: Record<string, number>) => {
      setPlaying(false);
      setTime(0);
      setValues((previous) => ({ ...previous, ...next }));
    },
    [setPlaying, setTime],
  );
  const onScrub = useCallback(
    (next: number) => {
      setPlaying(false);
      setTime(next);
      requestPreview();
    },
    [setPlaying, setTime, requestPreview],
  );

  return {
    values,
    time,
    setTime,
    playing,
    setPlaying,
    reduced,
    snapshot,
    ready,
    problem,
    preset,
    duration,
    restore,
    onChange,
    onPreset,
    onScrub,
  };
}

const diagnosticLabels: [keyof Omit<DemonstrationDiagnostics, 'method'>, string, string][] = [
  ['acceptedSteps', 'acceptedSteps', 'Accepted steps'],
  ['rejectedSteps', 'rejectedSteps', 'Rejected steps'],
  ['events', 'events', 'Events'],
  ['derivativeEvaluations', 'derivativeEvaluations', 'Derivative evaluations'],
  ['maxLocalError', 'maxLocalError', 'Maximum accepted normalized local error'],
  ['minStep', 'minStep', 'Minimum step (s)'],
  ['maxStep', 'maxStep', 'Maximum step (s)'],
  ['gridNodes', 'gridNodes', 'Grid nodes'],
  ['storedValues', 'storedValues', 'Stored scalar values'],
  ['unknowns', 'unknowns', 'Unknowns'],
  ['nonzeros', 'nonzeros', 'Matrix nonzero entries'],
  ['iterations', 'iterations', 'Iterations'],
  ['relativeResidual', 'relativeResidual', 'Relative residual'],
  ['absoluteResidual', 'absoluteResidual', 'Absolute residual'],
  ['diffusionCFL', 'diffusionCFL', 'Diffusion CFL'],
  ['transportCFL', 'transportCFL', 'Combined transport CFL'],
  ['adColumns', 'adColumns', 'Automatic differentiation columns'],
  ['finiteDifferenceColumns', 'finiteDifferenceColumns', 'Finite-difference columns'],
  ['projectedGradient', 'projectedGradient', 'Projected gradient norm'],
  ['objectiveEvaluations', 'objectiveEvaluations', 'Objective evaluations'],
  ['analysisSamples', 'analysisSamples', 'Analysis samples'],
  ['eigenResidual', 'eigenResidual', 'Scaled eigen residual'],
  ['eigenOrthogonality', 'eigenOrthogonality', 'Orthogonality error'],
  ['eigenIterations', 'eigenIterations', 'Eigen rotations'],
];
function SolverDiagnostics({ value }: { value: DemonstrationDiagnostics }) {
  return (
    <details className="demo-advanced">
      <summary>
        {i18n('intui.demo.diagnostics', 'Solver diagnostics')} · {value.method}
      </summary>
      <dl className="demo-metrics">
        {diagnosticLabels.map(([key, label, fallback]) => {
          const number = value[key];
          return number === undefined ? null : (
            <div key={key}>
              <dt>{i18n('intui.demo.diag.' + label, fallback)}</dt>
              <dd>{Number(number.toPrecision(5)).toString()}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}
function DemonstrationBody({
  program,
  title,
  id,
  state,
}: {
  program: DemonstrationProgram;
  title?: string;
  id: string;
  state: ReturnType<typeof useDemonstrationState>;
}) {
  const {
    values,
    time,
    setTime,
    playing,
    setPlaying,
    reduced,
    snapshot,
    problem,
    preset,
    duration,
    restore,
    onChange,
    onPreset,
    onScrub,
  } = state;
  const controls = (
    <ParameterControls
      key="parameters"
      program={program}
      values={values}
      id={id}
      onChange={onChange}
    />
  );
  const hasEmbeddedControls = program.views.some((view) => view.kind === 'controls');

  return (
    <>
      {title ? <header className="demo-heading">{title}</header> : null}
      {problem ? (
        <div className="demo-error" role="status">
          <DemoIssue headline={failureHeadline(problem.path)} details={[problem.message]} />
          <Button size="sm" variant="outline" onClick={restore}>
            {restoreLabel()}
          </Button>
        </div>
      ) : null}
      {snapshot?.warnings.length ? (
        <RuntimeWarning warnings={snapshot.warnings} onRestore={restore} />
      ) : null}
      <div className="demo-views">
        {program.views.map((view, index) =>
          view.kind === 'controls' ? controls : renderView(view, index, snapshot?.views[index]),
        )}
      </div>
      {snapshot?.diagnostics && <SolverDiagnostics value={snapshot.diagnostics} />}
      {!hasEmbeddedControls ? controls : null}
      <AdvancedParameters program={program} values={values} id={id} onChange={onChange} />
      <PresetButtons program={program} preset={preset} onPreset={onPreset} />
      <TimeControls
        duration={duration}
        time={Math.min(time, duration)}
        playing={playing}
        reduced={reduced}
        setTime={setTime}
        setPlaying={setPlaying}
        onScrub={onScrub}
      />
    </>
  );
}

export function Demonstration({
  program: input,
  title,
  streaming = false,
}: {
  program: unknown;
  title?: string;
  streaming?: boolean;
}) {
  const host = useRef<HTMLElement>(null);
  const id = useId();
  const serialized = useMemo(() => JSON.stringify(input) ?? 'null', [input]);
  const parsed = useMemo(() => parseProgram(serialized), [serialized]);
  const { program } = parsed;
  const visible = useDemonstrationVisibility(host);
  const state = useDemonstrationState(program, visible);
  const quality = state.ready ? 'full' : state.snapshot ? 'preview' : undefined;

  return (
    <section
      className="demonstration"
      ref={host}
      aria-label={title || i18n('intui.demo.title', 'Interactive demonstration')}
      data-demonstration={program ? '1' : undefined}
      data-demo-quality={quality}
    >
      {program ? (
        <DemonstrationBody program={program} title={title} id={id} state={state} />
      ) : (
        <FailureState streaming={streaming} error={parsed.error} path={parsed.path} />
      )}
    </section>
  );
}
