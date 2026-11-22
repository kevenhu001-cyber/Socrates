import { Label } from '../../ui/shadcn/label';
import { NativeControl } from '../../ui/NativeControl';
import { defineComponent } from '@openuidev/react-lang';
import { useEffect, useId, useState } from 'react';
import { z } from 'zod/v4';
import { Button } from '../../ui/Button';
import { i18n } from '../../../ui/legacyI18n.ts';
import { projectile } from './projectile';

interface SimulationControlConfig {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  set: (val: number) => void;
}

function SimulationParameters({
  controls,
  id,
  onReset,
}: {
  controls: SimulationControlConfig[];
  id: string;
  onReset: () => void;
}) {
  return (
    <div className="iui-simulation-controls">
      {controls.map((c, n) => (
        <div className="iui-simulation-parameter" key={c.unit}>
          <Label htmlFor={`${id}-${n}`}>{c.label}</Label>
          <NativeControl
            id={`${id}-${n}`}
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={c.value}
            onChange={(e) => {
              onReset();
              c.set(Number(e.target.value));
            }}
          />
          <output htmlFor={`${id}-${n}`}>
            {c.value} {c.unit}
          </output>
        </div>
      ))}
    </div>
  );
}

function SimulationGraph({
  title,
  path,
  result,
  x,
  y,
}: {
  title: string;
  path: string;
  result: ReturnType<typeof projectile>;
  x: (v: number) => number;
  y: (v: number) => number;
}) {
  return (
    <svg viewBox="0 0 600 264" role="img" aria-label={title}>
      <path d="M24 16V236H580" fill="none" stroke="var(--iui-border)" />
      <path d={path} fill="none" stroke="var(--iui-muted)" strokeDasharray="5 5" />
      <circle cx={x(result.x)} cy={y(result.y)} r="7" fill="var(--primary)" />
      <text x="24" y="257" fill="currentColor">
        0 m
      </text>
      <text x="576" y="257" textAnchor="end" fill="currentColor">
        {result.range.toFixed(1)} m
      </text>
    </svg>
  );
}

function useProjectileAnimation(
  playing: boolean,
  duration: number,
  setPlaying: (p: boolean) => void,
) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      setTime((t) => Math.min(duration, t + dt));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);

  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration, setPlaying]);

  return { time, setTime };
}

export const Simulation = defineComponent({
  name: 'Simulation',
  props: z.object({
    title: z.string(),
    speed: z.number().min(1).max(50).optional(),
    angle: z.number().min(5).max(85).optional(),
    gravity: z.number().min(1).max(25).optional(),
  }),
  description:
    'Interactive ideal projectile lab without air resistance. Arguments: title, initial speed (1–50 m/s, default 20), angle (5–85 degrees, default 45), gravity (1–25 m/s², default 9.81). Editable parameters, trajectory, position/time readout, play/pause, scrub and reset run locally. Compose with Text, Chart and Card for physics lessons. Not a general physics engine.',
  component: function SimulationView({ props }) {
    const id = useId();
    const [speed, setSpeed] = useState(props.speed ?? 20),
      [angle, setAngle] = useState(props.angle ?? 45),
      [gravity, setGravity] = useState(props.gravity ?? 9.81);
    const [playing, setPlaying] = useState(false);
    const result = projectile(speed, angle, gravity, 0);
    const { time, setTime } = useProjectileAnimation(playing, result.duration, setPlaying);

    useEffect(() => {
      setSpeed(props.speed ?? 20);
      setAngle(props.angle ?? 45);
      setGravity(props.gravity ?? 9.81);
      setTime(0);
      setPlaying(false);
    }, [props.speed, props.angle, props.gravity, setTime]);

    const liveResult = projectile(speed, angle, gravity, time);
    const x = (v: number) => 24 + (v / Math.max(liveResult.range, 1)) * 552;
    const y = (v: number) => 236 - (v / Math.max(liveResult.height, 1)) * 200;
    const path = Array.from({ length: 61 }, (_, n) => {
      const p = projectile(speed, angle, gravity, (liveResult.duration * n) / 60);
      return `${n ? 'L' : 'M'}${x(p.x)},${y(p.y)}`;
    }).join(' ');

    const reset = () => {
      setPlaying(false);
      setTime(0);
    };

    const controls: SimulationControlConfig[] = [
      {
        label: i18n('intui.simSpeed', 'Speed'),
        unit: 'm/s',
        value: speed,
        min: 1,
        max: 50,
        step: 1,
        set: setSpeed,
      },
      {
        label: i18n('intui.simAngle', 'Angle'),
        unit: '°',
        value: angle,
        min: 5,
        max: 85,
        step: 1,
        set: setAngle,
      },
      {
        label: i18n('intui.simGravity', 'Gravity'),
        unit: 'm/s²',
        value: gravity,
        min: 1,
        max: 25,
        step: 0.01,
        set: setGravity,
      },
    ];

    return (
      <section className="iui-card iui-flow iui-simulation" aria-label={props.title}>
        <header>
          <h3 className="iui-title">{props.title}</h3>
          <p className="iui-caption">
            {i18n('intui.simIdeal', 'Ideal projectile · no air resistance · axes auto-scale')}
          </p>
        </header>
        <SimulationParameters controls={controls} id={id} onReset={reset} />
        <SimulationGraph title={props.title} path={path} result={liveResult} x={x} y={y} />
        <output className="iui-simulation-readout">
          t = {time.toFixed(2)} s · x = {liveResult.x.toFixed(2)} m · y = {liveResult.y.toFixed(2)}{' '}
          m
        </output>
        <div className="iui-simulation-parameter">
          <Label htmlFor={`${id}-time`}>{i18n('intui.simTime', 'Time')}</Label>
          <NativeControl
            id={`${id}-time`}
            type="range"
            min={0}
            max={liveResult.duration}
            step={0.01}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <output htmlFor={`${id}-time`}>{time.toFixed(2)} s</output>
        </div>
        <div className="iui-row iui-flow">
          <Button
            variant="default"
            aria-pressed={playing}
            onClick={() => {
              if (time >= liveResult.duration) setTime(0);
              setPlaying(!playing);
            }}
          >
            {playing ? i18n('intui.simPause', 'Pause') : i18n('intui.simPlay', 'Play')}
          </Button>
          <Button variant="outline" onClick={reset}>
            {i18n('intui.simReset', 'Reset')}
          </Button>
        </div>
      </section>
    );
  },
});
