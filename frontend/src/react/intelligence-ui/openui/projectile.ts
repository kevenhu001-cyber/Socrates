/** Ideal projectile, SI units, launch and landing at the same elevation. */
export function projectile(speed: number, angle: number, gravity: number, time: number) {
  const a = angle * Math.PI / 180, vx = speed * Math.cos(a), vy = speed * Math.sin(a);
  const duration = 2 * vy / gravity, t = Math.max(0, Math.min(time, duration));
  return { x: vx * t, y: Math.max(0, vy * t - gravity * t * t / 2), duration, range: vx * duration, height: vy * vy / (2 * gravity) };
}
