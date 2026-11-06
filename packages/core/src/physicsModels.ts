/** Reviewed numerical kernels and semantic drawing data. No DOM or executable model output. */
import { physicsParameters } from './physicsModelRegistry.js';
export { PHYSICS_MODELS, physicsModelDefinition, physicsParameters, physicsParametersError, type PhysicsModelDefinition, type PhysicsParameter } from './physicsModelRegistry.js';

export interface PhysicsPoint { x: number; y: number }
export interface PhysicsBody extends PhysicsPoint { label: string; sign?: number }
export interface PhysicsMetric { label: string; value: number; unit: string }
export interface PhysicsFrame { bodies: PhysicsBody[]; paths: PhysicsPoint[][]; metrics: PhysicsMetric[] }
export interface PhysicsRuntime {
  duration: number;
  world: { left: number; right: number; bottom: number; top: number };
  frame: (time: number) => PhysicsFrame;
  field?: (x: number, y: number, time: number) => number;
  vector?: (x: number, y: number) => PhysicsPoint;
  profile: (time: number) => number;
  profileLabel: string;
  profileUnit: string;
  profileScale: number;
}

/** Exact free response, including critically damped and overdamped cases. */
export function oscillatorState(t: number, mass: number, stiffness: number, damping: number, amplitude: number) {
  const alpha = damping / (2 * mass), omega2 = stiffness / mass, discriminant = omega2 - alpha * alpha;
  let x: number, v: number;
  if (Math.abs(discriminant) < 1e-9) {
    x = amplitude * (1 + alpha * t) * Math.exp(-alpha * t);
    v = -amplitude * alpha * alpha * t * Math.exp(-alpha * t);
  } else if (discriminant > 0) {
    const w = Math.sqrt(discriminant), decay = Math.exp(-alpha * t);
    x = amplitude * decay * (Math.cos(w * t) + alpha / w * Math.sin(w * t));
    v = -amplitude * decay * omega2 / w * Math.sin(w * t);
  } else {
    const beta = Math.sqrt(-discriminant), r1 = -alpha + beta, r2 = -alpha - beta;
    x = amplitude * (-r2 * Math.exp(r1 * t) + r1 * Math.exp(r2 * t)) / (r1 - r2);
    v = amplitude * r1 * r2 * (-Math.exp(r1 * t) + Math.exp(r2 * t)) / (r1 - r2);
  }
  return { x, v, energy: .5 * mass * v * v + .5 * stiffness * x * x };
}
export function electricField(x: number, y: number, charge1: number, charge2: number, separation: number) {
  let ex = 0, ey = 0, potential = 0;
  for (const [cx, charge] of [[-separation / 2, charge1], [separation / 2, charge2]]) {
    const dx = x - cx, r = Math.hypot(dx, y);
    if (r < .15) continue;
    const strength = 8.9875517923 * charge;
    ex += strength * dx / r ** 3; ey += strength * y / r ** 3;
    potential += strength / r;
  }
  return { x: ex, y: ey, potential };
}
/** Fixed-step RK4, prepared once per parameter change rather than per frame. */
export function pendulumTrajectory(length: number, gravity: number, initialAngle: number, damping: number, duration = 20) {
  const dt = 1 / 120, samples = [{ angle: initialAngle, velocity: 0 }];
  const acceleration = (a: number, v: number) => -gravity / length * Math.sin(a) - damping * v;
  let angle = initialAngle, velocity = 0;
  for (let i = 0; i < Math.ceil(duration / dt); i++) {
    const a1 = velocity, v1 = acceleration(angle, velocity);
    const a2 = velocity + dt * v1 / 2, v2 = acceleration(angle + dt * a1 / 2, velocity + dt * v1 / 2);
    const a3 = velocity + dt * v2 / 2, v3 = acceleration(angle + dt * a2 / 2, velocity + dt * v2 / 2);
    const a4 = velocity + dt * v3, v4 = acceleration(angle + dt * a3, velocity + dt * v3);
    angle += dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
    velocity += dt / 6 * (v1 + 2 * v2 + 2 * v3 + v4);
    samples.push({ angle, velocity });
  }
  return (time: number) => {
    const index = Math.max(0, Math.min(samples.length - 1, time / dt)), i = Math.floor(index), f = index - i;
    const a = samples[i], b = samples[Math.min(i + 1, samples.length - 1)];
    return { angle: a.angle + (b.angle - a.angle) * f, velocity: a.velocity + (b.velocity - a.velocity) * f };
  };
}
const metric = (label: string, value: number, unit: string): PhysicsMetric => ({ label, value, unit });
const world = { left: -5, right: 5, bottom: -2.5, top: 2.5 };
const empty = (): PhysicsFrame => ({ bodies: [], paths: [], metrics: [] });
export function createPhysicsRuntime(scene: string, input: Record<string, unknown>): PhysicsRuntime {
  const p = physicsParameters(scene, input);
  if (scene === 'wave-interference') {
    const field = (x: number, y: number, t: number) => [-1, 1].reduce((sum, sign) => {
      const r = Math.max(.15, Math.hypot(x - sign * p.separation / 2, y));
      return sum + Math.sin(2 * Math.PI / p.wavelength * (r - p.speed * t) + (sign === 1 ? p.phase * Math.PI / 180 : 0)) / Math.sqrt(r);
    }, 0);
    return { duration: 20, world, field, frame: t => ({ bodies: [...[-1, 1].map(sign => ({ x: sign * p.separation / 2, y: 0, label: sign === -1 ? 'S₁' : 'S₂' })), { x: 0, y: 1, label: 'P' }], paths: [], metrics: [metric('frequency', p.speed / p.wavelength, 'Hz'), metric('displacement', field(0, 1, t), 'relative')] }), profile: t => field(0, 1, t), profileLabel: 'probeDisplacement', profileUnit: 'relative', profileScale: 4 };
  }
  if (scene === 'electric-field') {
    const sample = (x: number, y: number) => electricField(x, y, p.charge1, p.charge2, p.separation);
    const probe = sample(0, 1);
    return { duration: 20, world, field: (x, y) => sample(x, y).potential / 30, vector: sample,
      frame: () => ({ bodies: [{ x: -p.separation / 2, y: 0, label: `${p.charge1} nC`, sign: p.charge1 }, { x: p.separation / 2, y: 0, label: `${p.charge2} nC`, sign: p.charge2 }, { x: 0, y: 1, label: 'P' }], paths: [], metrics: [metric('fieldAtProbe', Math.hypot(probe.x, probe.y), 'N/C'), metric('potentialAtProbe', probe.potential, 'V')] }),
      profile: x => sample((x / 20 - .5) * 10, 1).potential, profileLabel: 'potentialSection', profileUnit: 'V', profileScale: Math.max(10, (Math.abs(p.charge1) + Math.abs(p.charge2)) * 12) };
  }
  if (scene === 'harmonic-oscillator') {
    const sample = (t: number) => oscillatorState(t, p.mass, p.stiffness, p.damping, p.amplitude);
    return { duration: 20, world, frame: t => {
      const s = sample(t), end = s.x;
      const spring = [{ x: -4, y: 0 }, ...Array.from({ length: 25 }, (_, i) => ({ x: -3.7 + (end + 3.4) * i / 24, y: i === 0 || i === 24 ? 0 : i % 2 ? .2 : -.2 })), { x: end, y: 0 }];
      return { bodies: [{ x: end, y: 0, label: `${p.mass} kg` }], paths: [spring, [{ x: -4, y: -1 }, { x: -4, y: 1 }]], metrics: [metric('displacement', s.x, 'm'), metric('velocity', s.v, 'm/s'), metric('energy', s.energy, 'J')] };
    }, profile: t => sample(t).x, profileLabel: 'displacementTime', profileUnit: 'm', profileScale: p.amplitude };
  }
  if (scene === 'pendulum') {
    const sample = pendulumTrajectory(p.length, p.gravity, p.angle * Math.PI / 180, p.damping);
    return { duration: 20, world: { left: -(2 * p.length + 1), right: 2 * p.length + 1, top: 2 + p.length + .5, bottom: 2 - p.length - .5 }, frame: t => {
      const s = sample(t), bob = { x: p.length * Math.sin(s.angle), y: 2 - p.length * Math.cos(s.angle), label: 'm' };
      return { bodies: [bob], paths: [[{ x: 0, y: 2 }, bob]], metrics: [metric('angle', s.angle * 180 / Math.PI, '°'), metric('angularVelocity', s.velocity, 'rad/s'), metric('specificEnergy', .5 * (p.length * s.velocity) ** 2 + p.gravity * p.length * (1 - Math.cos(s.angle)), 'J/kg')] };
    }, profile: t => sample(t).angle * 180 / Math.PI, profileLabel: 'angleTime', profileUnit: '°', profileScale: p.angle };
  }
  if (scene === 'projectile') {
    const vx = p.speed * Math.cos(p.angle * Math.PI / 180), vy = p.speed * Math.sin(p.angle * Math.PI / 180), duration = 2 * vy / p.gravity;
    const position = (t: number) => ({ x: vx * t, y: Math.max(0, vy * t - .5 * p.gravity * t * t) });
    return { duration, world: { left: -vx * duration * .05, right: vx * duration * 1.1, bottom: -vy * duration * .03, top: vy ** 2 / (2 * p.gravity) * 1.3 }, frame: t => ({ bodies: [{ ...position(t), label: 'm' }], paths: [Array.from({ length: 81 }, (_, i) => position(duration * i / 80))], metrics: [metric('horizontalPosition', vx * t, 'm'), metric('height', position(t).y, 'm'), metric('velocity', Math.hypot(vx, vy - p.gravity * t), 'm/s')] }), profile: t => position(t).y, profileLabel: 'heightTime', profileUnit: 'm', profileScale: vy ** 2 / (2 * p.gravity) };
  }
  return { duration: 20, world, frame: empty, profile: () => 0, profileLabel: '', profileUnit: '', profileScale: 1 };
}
