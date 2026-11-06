/** Fraunhofer diffraction by an ideal circular pupil. Units: Airy first-zero radius. */
export const AIRY_ZERO = 3.8317059702075125;
export function besselJ1(x: number): number {
  // Integral representation; periodic quadrature is stable at the radii used here.
  let sum = 0;
  const samples = 128;
  for (let i = 0; i < samples; i++) {
    const t = (i + .5) * Math.PI / samples;
    sum += Math.cos(t - x * Math.sin(t));
  }
  return sum / samples;
}
export function airyIntensity(radius: number): number {
  const u = AIRY_ZERO * Math.abs(radius);
  if (u < 1e-6) return 1;
  return (2 * besselJ1(u) / u) ** 2;
}
export function rayleighAngle(wavelengthNm: number, apertureMm: number): number {
  return AIRY_ZERO / Math.PI * wavelengthNm * 1e-6 / apertureMm;
}
const LUT_STEP = 1 / 512;
let lookup: Float64Array | undefined;
export function sampledAiry(radius: number): number {
  lookup ??= Float64Array.from({ length: 4097 }, (_, i) => airyIntensity(i * LUT_STEP));
  const index = Math.abs(radius) / LUT_STEP;
  const lower = Math.floor(index);
  if (lower >= lookup.length - 1) return 0;
  return lookup[lower] + (lookup[lower + 1] - lookup[lower]) * (index - lower);
}
export function pairIntensity(x: number, y: number, separation: number): number {
  // Mutually incoherent equal-brightness sources: intensities, not amplitudes, add.
  return sampledAiry(Math.hypot(x - separation / 2, y)) + sampledAiry(Math.hypot(x + separation / 2, y));
}
export function boundedParameter(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
