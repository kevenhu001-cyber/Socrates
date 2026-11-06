import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPhysicsRuntime, physicsModelDefinition, physicsParameters, type PhysicsPoint } from '@socrates/core';
import { Button } from '../../ui/Button';
import { NativeControl } from '../../ui/NativeControl';
import { Label } from '../../ui/shadcn/label';
import { i18n } from '../../legacy/gateway';

export interface ModelLabProps { scene: string; title?: string; parameters?: Record<string, unknown> }
const tr = (key: string, fallback: string) => i18n(`intui.physics.${key}`, fallback);

/** One renderer consumes semantic fields, vectors, bodies, paths and metrics
 * from every registered model. Model output never supplies JavaScript/shaders. */
export function ModelLab({ scene, title, parameters = {} }: ModelLabProps) {
  const definition = physicsModelDefinition(scene);
  const serialized = JSON.stringify(physicsParameters(scene, parameters));
  const defaults = useMemo(() => JSON.parse(serialized) as Record<string, number>, [serialized]);
  const [local, setLocal] = useState(defaults);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [available, setAvailable] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const id = useId();
  const runtime = useMemo(() => createPhysicsRuntime(scene, local), [scene, local]);
  const isStatic = scene === 'electric-field';
  useEffect(() => { setLocal(defaults); setTime(0); }, [defaults]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    update(); setPlaying(!media.matches && !isStatic);
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (canvas.current) observer.observe(canvas.current);
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, [isStatic]);
  useEffect(() => {
    if (!playing || !visible || reduced || isStatic) return;
    let frame = 0, previous = performance.now();
    const tick = (now: number) => {
      if (document.hidden) { previous = now; frame = requestAnimationFrame(tick); return; }
      if (now - previous >= 40) {
        const dt = Math.min(.1, (now - previous) / 1000); previous = now;
        setTime(value => Math.min(runtime.duration, value + dt));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, reduced, isStatic, runtime.duration]);
  useEffect(() => { if (time >= runtime.duration) setPlaying(false); }, [time, runtime.duration]);
  const snapshot = runtime.frame(time);
  const profile = useMemo(() => Array.from({ length: 241 }, (_, i) => ({ time: runtime.duration * i / 240, value: runtime.profile(runtime.duration * i / 240) })), [runtime]);
  const profilePath = profile.map((point, i) => `${i ? 'L' : 'M'}${i * 2},${52 - point.value / runtime.profileScale * 42}`).join(' ');
  const sceneTitle = title || tr(`${scene}.title`, definition?.title || scene);
  useEffect(() => {
    const element = canvas.current, context = element?.getContext('2d');
    if (!element || !context) { setAvailable(false); return; }
    const width = element.width, height = element.height, w = runtime.world;
    const screen = (p: PhysicsPoint) => ({ x: (p.x - w.left) / (w.right - w.left) * width, y: (w.top - p.y) / (w.top - w.bottom) * height });
    const worldAt = (x: number, y: number) => ({ x: w.left + x / width * (w.right - w.left), y: w.top - y / height * (w.top - w.bottom) });
    context.clearRect(0, 0, width, height);
    const style = getComputedStyle(element);
    const ink = style.getPropertyValue('--ui-ink').trim() || 'currentColor';
    const accent = style.getPropertyValue('--primary').trim() || ink;
    if (runtime.field) {
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const p = worldAt(x, y), value = Math.tanh(runtime.field(p.x, p.y, time) * .7), weight = Math.abs(value);
        const color = value >= 0 ? [252, 180, 90] : [70, 165, 255];
        const offset = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) image.data[offset + c] = [8, 14, 24][c] + weight * (color[c] - [8, 14, 24][c]);
        image.data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    }
    context.strokeStyle = runtime.field ? 'rgba(255,255,255,.65)' : ink;
    context.lineWidth = 1;
    if (runtime.vector) for (let y = 14; y < height; y += 22) for (let x = 14; x < width; x += 22) {
      const p = worldAt(x, y), v = runtime.vector(p.x, p.y), magnitude = Math.hypot(v.x, v.y);
      if (magnitude < 1e-8) continue;
      const length = Math.min(9, 2 + Math.log1p(magnitude) * 2), dx = v.x / magnitude * length, dy = -v.y / magnitude * length;
      context.beginPath(); context.moveTo(x - dx / 2, y - dy / 2); context.lineTo(x + dx / 2, y + dy / 2);
      context.lineTo(x + dx / 2 - dx * .4 - dy * .3, y + dy / 2 - dy * .4 + dx * .3);
      context.moveTo(x + dx / 2, y + dy / 2); context.lineTo(x + dx / 2 - dx * .4 + dy * .3, y + dy / 2 - dy * .4 - dx * .3); context.stroke();
    }
    if (!runtime.field) {
      const origin = screen({ x: 0, y: 0 });
      context.globalAlpha = .2; context.beginPath(); context.moveTo(0, origin.y); context.lineTo(width, origin.y); context.stroke(); context.globalAlpha = 1;
    }
    context.strokeStyle = accent; context.lineWidth = 1.8;
    const data = runtime.frame(time);
    for (const path of data.paths) {
      context.beginPath(); path.forEach((p, i) => { const point = screen(p); if (i) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); }); context.stroke();
    }
    context.font = '12px sans-serif'; context.textAlign = 'center';
    for (const body of data.bodies) {
      const p = screen(body);
      context.fillStyle = runtime.field ? 'white' : accent;
      context.beginPath(); context.arc(p.x, p.y, body.sign === undefined ? 5 : 8, 0, Math.PI * 2); context.fill();
      context.fillStyle = runtime.field ? 'white' : ink; context.fillText(body.label, p.x, p.y - 13);
      if (body.sign !== undefined) {
        context.fillStyle = 'rgb(8,14,24)'; context.fillText(body.sign > 0 ? '+' : body.sign < 0 ? '−' : '0', p.x, p.y + 4);
      }
    }
  }, [runtime, time]);
  if (!definition) return null;
  return <section className="intui-physics demonstration" aria-label={sceneTitle} data-physics-scene={scene}>
    <header><strong>{sceneTitle}</strong><p>{tr(`${scene}.assumption`, definition.assumption)}</p></header>
    <canvas ref={canvas} width={480} height={240} role="img" aria-label={sceneTitle} />
    <p className="intui-physics-caption">x ∈ [{runtime.world.left.toFixed(1)}, {runtime.world.right.toFixed(1)}] m · y ∈ [{runtime.world.bottom.toFixed(1)}, {runtime.world.top.toFixed(1)}] m</p>
    {!available ? <p role="status">{tr('noCanvas', 'Canvas unavailable. Read the chart and numerical results below.')}</p> : null}
    {runtime.field ? <p className="intui-physics-caption">{tr(isStatic ? 'potentialLegend' : 'waveLegend', isStatic ? 'Blue: negative potential · amber: positive potential · arrows: electric field direction · P: probe at (0 m, 1 m)' : 'Blue: negative displacement · amber: positive displacement · P: sample at (0 m, 1 m)')}</p> : null}
    <div className="intui-physics-metrics" aria-live={playing ? 'off' : 'polite'}>{snapshot.metrics.map(m => <span key={m.label}>{tr(m.label, m.label)} <strong>{m.value.toFixed(3)}</strong> {m.unit === 'relative' ? tr('relative', 'relative units') : m.unit}</span>)}</div>
    <figure className="intui-physics-plot"><figcaption>{tr(runtime.profileLabel, runtime.profileLabel)} ({runtime.profileUnit === 'relative' ? tr('relative', 'relative units') : runtime.profileUnit})</figcaption>
      <svg viewBox="0 0 480 110" role="img" aria-label={tr(runtime.profileLabel, runtime.profileLabel)}><path d="M0 52H480" stroke="currentColor" opacity=".2" /><path d={profilePath} fill="none" stroke="currentColor" strokeWidth="1.5" />{!isStatic ? <line x1={time / runtime.duration * 480} x2={time / runtime.duration * 480} y1="4" y2="100" stroke="currentColor" opacity=".5" /> : null}<text x="0" y="109" fill="currentColor" fontSize="10">{isStatic ? '−5 m' : '0 s'}</text><text x="480" y="109" fill="currentColor" fontSize="10" textAnchor="end">{isStatic ? '5 m' : `${runtime.duration.toFixed(1)} s`}</text></svg>
    </figure>
    <p className="intui-physics-caption">{definition.equation}</p>
    {!isStatic ? <><div className="intui-physics-toolbar"><Button variant="outline" disabled={reduced} aria-pressed={playing} onClick={() => { if (time >= runtime.duration) setTime(0); setPlaying(value => !value); }}>{playing ? i18n('intui.simPause', 'Pause') : i18n('intui.simPlay', 'Play')}</Button><Button variant="outline" onClick={() => { setPlaying(false); setTime(0); }}>{i18n('intui.simReset', 'Reset')}</Button></div>
      <Label className="intui-physics-parameter" htmlFor={`${id}-time`}>{i18n('intui.simTime', 'Time')} · {time.toFixed(2)} s<NativeControl id={`${id}-time`} type="range" min={0} max={runtime.duration} step="any" value={time} onChange={event => { setPlaying(false); setTime(Number(event.target.value)); }} /></Label></> : null}
    <details><summary>{tr('parameters', 'Model parameters')}</summary>{definition.parameters.map(p => <Label className="intui-physics-parameter" key={p.key} htmlFor={`${id}-${p.key}`}><span>{tr(`${scene}.${p.key}`, p.label)} · {local[p.key]} {p.unit}</span><NativeControl id={`${id}-${p.key}`} type="range" min={p.min} max={p.max} step={p.step} value={local[p.key]} onChange={event => { setPlaying(false); setTime(0); setLocal(values => ({ ...values, [p.key]: Number(event.target.value) })); }} /></Label>)}</details>
  </section>;
}
