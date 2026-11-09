import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { createPhysicsRuntime, physicsModelDefinition, physicsParameters, type PhysicsPoint } from '@socrates/core';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../legacy/gateway';

export interface ModelLabProps { scene: string; title?: string; parameters?: Record<string, unknown> }
const tr = (key: string, fallback: string) => i18n(`intui.physics.${key}`, fallback);
type PhysicsRuntime = ReturnType<typeof createPhysicsRuntime>;
type PhysicsFrame = ReturnType<PhysicsRuntime['frame']>;
type PhysicsDefinition = NonNullable<ReturnType<typeof physicsModelDefinition>>;
type PhysicsWorld = PhysicsRuntime['world'];
type Coordinate = { x: number; y: number };

function screenPoint(point: PhysicsPoint, world: PhysicsWorld, width: number, height: number): Coordinate {
  return {
    x: (point.x - world.left) / (world.right - world.left) * width,
    y: (world.top - point.y) / (world.top - world.bottom) * height,
  };
}

function worldPoint(x: number, y: number, world: PhysicsWorld, width: number, height: number): Coordinate {
  return {
    x: world.left + x / width * (world.right - world.left),
    y: world.top - y / height * (world.top - world.bottom),
  };
}

function drawFieldImage(
  context: CanvasRenderingContext2D,
  field: NonNullable<PhysicsRuntime['field']>,
  time: number,
  width: number,
  height: number,
  worldAt: (x: number, y: number) => Coordinate,
): void {
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = worldAt(x, y);
      const value = Math.tanh(field(point.x, point.y, time) * .7);
      const weight = Math.abs(value);
      const color = value >= 0 ? [252, 180, 90] : [70, 165, 255];
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        image.data[offset + channel] = [8, 14, 24][channel] + weight * (color[channel] - [8, 14, 24][channel]);
      }
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function drawArrow(context: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
  context.beginPath();
  context.moveTo(x - dx / 2, y - dy / 2);
  context.lineTo(x + dx / 2, y + dy / 2);
  context.lineTo(x + dx / 2 - dx * .4 - dy * .3, y + dy / 2 - dy * .4 + dx * .3);
  context.moveTo(x + dx / 2, y + dy / 2);
  context.lineTo(x + dx / 2 - dx * .4 + dy * .3, y + dy / 2 - dy * .4 - dx * .3);
  context.stroke();
}

function drawVectorField(
  context: CanvasRenderingContext2D,
  vector: NonNullable<PhysicsRuntime['vector']>,
  worldAt: (x: number, y: number) => Coordinate,
  width: number,
  height: number,
): void {
  context.strokeStyle = 'rgba(255,255,255,.65)';
  for (let y = 14; y < height; y += 22) {
    for (let x = 14; x < width; x += 22) {
      const point = worldAt(x, y);
      const value = vector(point.x, point.y);
      const magnitude = Math.hypot(value.x, value.y);
      if (magnitude < 1e-8) continue;
      const length = Math.min(9, 2 + Math.log1p(magnitude) * 2);
      drawArrow(context, x, y, value.x / magnitude * length, -value.y / magnitude * length);
    }
  }
}

function drawAxes(context: CanvasRenderingContext2D, world: PhysicsWorld, width: number, height: number): void {
  const origin = screenPoint({ x: 0, y: 0 }, world, width, height);
  context.globalAlpha = .2;
  context.beginPath();
  context.moveTo(0, origin.y);
  context.lineTo(width, origin.y);
  context.stroke();
  context.globalAlpha = 1;
}

function drawPaths(context: CanvasRenderingContext2D, paths: PhysicsFrame['paths'], world: PhysicsWorld, width: number, height: number): void {
  for (const path of paths) {
    context.beginPath();
    path.forEach((point, index) => {
      const screen = screenPoint(point, world, width, height);
      if (index) context.lineTo(screen.x, screen.y);
      else context.moveTo(screen.x, screen.y);
    });
    context.stroke();
  }
}

function drawBodies(context: CanvasRenderingContext2D, bodies: PhysicsFrame['bodies'], world: PhysicsWorld, hasField: boolean, width: number, height: number, ink: string, accent: string): void {
  for (const body of bodies) {
    const point = screenPoint(body, world, width, height);
    context.fillStyle = hasField ? 'white' : accent;
    context.beginPath();
    context.arc(point.x, point.y, body.sign === undefined ? 5 : 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = hasField ? 'white' : ink;
    context.fillText(body.label, point.x, point.y - 13);
    if (body.sign !== undefined) {
      context.fillStyle = 'rgb(8,14,24)';
      context.fillText(body.sign > 0 ? '+' : body.sign < 0 ? '−' : '0', point.x, point.y + 4);
    }
  }
}

function drawPhysicsFrame(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, runtime: PhysicsRuntime, time: number): void {
  const width = canvas.width;
  const height = canvas.height;
  const world = runtime.world;
  const worldAt = (x: number, y: number) => worldPoint(x, y, world, width, height);
  context.clearRect(0, 0, width, height);
  const style = getComputedStyle(canvas);
  const ink = style.getPropertyValue('--ui-ink').trim() || 'currentColor';
  const accent = style.getPropertyValue('--primary').trim() || ink;
  if (runtime.field) drawFieldImage(context, runtime.field, time, width, height, worldAt);
  context.strokeStyle = runtime.field ? 'rgba(255,255,255,.65)' : ink;
  context.lineWidth = 1;
  if (runtime.vector) drawVectorField(context, runtime.vector, worldAt, width, height);
  if (!runtime.field) drawAxes(context, world, width, height);
  context.strokeStyle = accent;
  context.lineWidth = 1.8;
  const data = runtime.frame(time);
  drawPaths(context, data.paths, world, width, height);
  context.font = '12px sans-serif';
  context.textAlign = 'center';
  drawBodies(context, data.bodies, world, Boolean(runtime.field), width, height, ink, accent);
}

function usePhysicsCanvas(canvas: RefObject<HTMLCanvasElement | null>, runtime: PhysicsRuntime, time: number, setAvailable: (available: boolean) => void): void {
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) {
      setAvailable(false);
      return;
    }
    drawPhysicsFrame(element, context, runtime, time);
  }, [canvas, runtime, time, setAvailable]);
}

function usePhysicsPlayback(isStatic: boolean, duration: number, canvas: RefObject<HTMLCanvasElement | null>) {
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
    setPlaying(!media.matches && !isStatic);
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (canvas.current) observer.observe(canvas.current);
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, [canvas, isStatic]);

  useEffect(() => {
    if (!playing || !visible || reduced || isStatic) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (document.hidden) {
        previous = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      if (now - previous >= 40) {
        const delta = Math.min(.1, (now - previous) / 1000);
        previous = now;
        setTime((value) => Math.min(duration, value + delta));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, reduced, isStatic, duration]);

  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration]);

  return { time, setTime, playing, setPlaying, reduced };
}

function usePhysicsLab(scene: string, parameters: Record<string, unknown>) {
  const definition = physicsModelDefinition(scene);
  const serialized = JSON.stringify(physicsParameters(scene, parameters));
  const defaults = useMemo(() => JSON.parse(serialized) as Record<string, number>, [serialized]);
  const [local, setLocal] = useState(defaults);
  const [available, setAvailable] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const id = useId();
  const runtime = useMemo(() => createPhysicsRuntime(scene, local), [scene, local]);
  const isStatic = scene === 'electric-field';
  const playback = usePhysicsPlayback(isStatic, runtime.duration, canvas);
  const { time, setTime, playing, setPlaying, reduced } = playback;

  useEffect(() => {
    setLocal(defaults);
    setTime(0);
  }, [defaults, setTime]);
  usePhysicsCanvas(canvas, runtime, time, setAvailable);

  const snapshot = runtime.frame(time);
  const profile = useMemo(() => Array.from({ length: 241 }, (_, index) => {
    const time = runtime.duration * index / 240;
    return { time, value: runtime.profile(time) };
  }), [runtime]);
  const profilePath = profile.map((point, index) => `${index ? 'L' : 'M'}${index * 2},${52 - point.value / runtime.profileScale * 42}`).join(' ');
  return { definition, local, setLocal, available, canvas, id, runtime, isStatic, time, setTime, playing, setPlaying, reduced, snapshot, profilePath };
}

type PhysicsLabModel = ReturnType<typeof usePhysicsLab>;

function PhysicsHeader({ title, scene, definition }: { title?: string; scene: string; definition: PhysicsDefinition }) {
  return <header><strong>{title || tr(`${scene}.title`, definition.title || scene)}</strong><p>{tr(`${scene}.assumption`, definition.assumption)}</p></header>;
}

function fieldLegend(isStatic: boolean): string {
  return tr(
    isStatic ? 'potentialLegend' : 'waveLegend',
    isStatic
      ? 'Blue: negative potential · amber: positive potential · arrows: electric field direction · P: probe at (0 m, 1 m)'
      : 'Blue: negative displacement · amber: positive displacement · P: sample at (0 m, 1 m)',
  );
}

function PhysicsStatus({ model }: { model: PhysicsLabModel }) {
  return <>
    {!model.available ? <p role="status">{tr('noCanvas', 'Canvas unavailable. Read the chart and numerical results below.')}</p> : null}
    {model.runtime.field ? <p className="intui-physics-caption">{fieldLegend(model.isStatic)}</p> : null}
  </>;
}

function PhysicsMetrics({ model }: { model: PhysicsLabModel }) {
  return <div className="intui-physics-metrics" aria-live={model.playing ? 'off' : 'polite'}>
    {model.snapshot.metrics.map((metric) => <span key={metric.label}>
      {tr(metric.label, metric.label)} <strong>{metric.value.toFixed(3)}</strong> {metric.unit === 'relative' ? tr('relative', 'relative units') : metric.unit}
    </span>)}
  </div>;
}

function ProfileBounds({ isStatic, duration }: { isStatic: boolean; duration: number }) {
  const start = isStatic ? '−5 m' : '0 s';
  const end = isStatic ? '5 m' : `${duration.toFixed(1)} s`;
  return <>
    <text x="0" y="109" fill="currentColor" fontSize="10">{start}</text>
    <text x="480" y="109" fill="currentColor" fontSize="10" textAnchor="end">{end}</text>
  </>;
}

function ProfilePlot({ model }: { model: PhysicsLabModel }) {
  const unit = model.runtime.profileUnit === 'relative' ? tr('relative', 'relative units') : model.runtime.profileUnit;
  return <figure className="intui-physics-plot">
    <figcaption>{tr(model.runtime.profileLabel, model.runtime.profileLabel)} ({unit})</figcaption>
    <svg viewBox="0 0 480 110" role="img" aria-label={tr(model.runtime.profileLabel, model.runtime.profileLabel)}>
      <path d="M0 52H480" stroke="currentColor" opacity=".2" />
      <path d={model.profilePath} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {!model.isStatic ? <line x1={model.time / model.runtime.duration * 480} x2={model.time / model.runtime.duration * 480} y1="4" y2="100" stroke="currentColor" opacity=".5" /> : null}
      <ProfileBounds isStatic={model.isStatic} duration={model.runtime.duration} />
    </svg>
  </figure>;
}

function PlaybackControls({ model }: { model: PhysicsLabModel }) {
  if (model.isStatic) return null;
  return <>
    <div className="intui-physics-toolbar">
      <Button variant="outline" disabled={model.reduced} aria-pressed={model.playing} onClick={() => {
        if (model.time >= model.runtime.duration) model.setTime(0);
        model.setPlaying((value) => !value);
      }}>{model.playing ? i18n('intui.simPause', 'Pause') : i18n('intui.simPlay', 'Play')}</Button>
      <Button variant="outline" onClick={() => { model.setPlaying(false); model.setTime(0); }}>{i18n('intui.simReset', 'Reset')}</Button>
    </div>
    <Label className="intui-physics-parameter" htmlFor={`${model.id}-time`}>
      {i18n('intui.simTime', 'Time')} · {model.time.toFixed(2)} s
      <NativeControl id={`${model.id}-time`} type="range" min={0} max={model.runtime.duration} step="any" value={model.time} onChange={(event) => {
        model.setPlaying(false);
        model.setTime(Number(event.target.value));
      }} />
    </Label>
  </>;
}

function PhysicsParameters({ model, definition, scene }: { model: PhysicsLabModel; definition: PhysicsDefinition; scene: string }) {
  return <details><summary>{tr('parameters', 'Model parameters')}</summary>
    {definition.parameters.map((parameter) => <Label className="intui-physics-parameter" key={parameter.key} htmlFor={`${model.id}-${parameter.key}`}>
      <span>{tr(`${scene}.${parameter.key}`, parameter.label)} · {model.local[parameter.key]} {parameter.unit}</span>
      <NativeControl id={`${model.id}-${parameter.key}`} type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={model.local[parameter.key]} onChange={(event) => {
        model.setPlaying(false);
        model.setTime(0);
        model.setLocal((values) => ({ ...values, [parameter.key]: Number(event.target.value) }));
      }} />
    </Label>)}
  </details>;
}

function ModelLabView({ scene, title, model }: { scene: string; title?: string; model: PhysicsLabModel }) {
  const definition = model.definition;
  if (!definition) return null;
  return <section className="intui-physics demonstration" aria-label={title || tr(`${scene}.title`, definition.title || scene)} data-physics-scene={scene}>
    <PhysicsHeader title={title} scene={scene} definition={definition} />
    <canvas ref={model.canvas} width={480} height={240} role="img" aria-label={title || tr(`${scene}.title`, definition.title || scene)} />
    <p className="intui-physics-caption">x ∈ [{model.runtime.world.left.toFixed(1)}, {model.runtime.world.right.toFixed(1)}] m · y ∈ [{model.runtime.world.bottom.toFixed(1)}, {model.runtime.world.top.toFixed(1)}] m</p>
    <PhysicsStatus model={model} />
    <PhysicsMetrics model={model} />
    <ProfilePlot model={model} />
    <p className="intui-physics-caption">{definition.equation}</p>
    <PlaybackControls model={model} />
    <PhysicsParameters model={model} definition={definition} scene={scene} />
  </section>;
}

/** One renderer consumes semantic fields, vectors, bodies, paths and metrics
 * from every registered model. Model output never supplies JavaScript/shaders. */
export function ModelLab({ scene, title, parameters = {} }: ModelLabProps) {
  const model = usePhysicsLab(scene, parameters);
  return <ModelLabView scene={scene} title={title} model={model} />;
}
