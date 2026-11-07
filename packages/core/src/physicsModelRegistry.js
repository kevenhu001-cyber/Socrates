/** DOM-free model contracts shared with the compiled Node server. */
const parameter = (key, label, unit, min, max, step, initial) => ({ key, label, unit, min, max, step, initial });
export const PHYSICS_MODELS = [
  { id: 'rayleigh', title: 'Rayleigh diffraction', assumption: 'Equal incoherent sources · ideal circular pupil', equation: 'I = [2J₁(u)/u]²; θR ≈ 1.22λ/D', parameters: [parameter('separation', 'Source separation', 'reference θR', .2, 3, .01, 2.4), parameter('wavelength', 'Wavelength', 'nm', 380, 750, 1, 550), parameter('aperture', 'Aperture', 'mm', 10, 300, 1, 100)] },
  { id: 'wave-interference', title: 'Wave interference', assumption: 'Coherent cylindrical waves · smoothed source cores · illustrative 2D medium', equation: 'y = Σ A sin(kr − ωt + φ)/√r; k = 2π/λ', parameters: [parameter('wavelength', 'Wavelength', 'm', .4, 4, .05, 1.4), parameter('speed', 'Wave speed', 'm/s', .2, 4, .1, 1), parameter('separation', 'Source separation', 'm', .4, 6, .1, 3), parameter('phase', 'Relative phase', '°', 0, 360, 5, 0)] },
  { id: 'electric-field', title: 'Electric field', assumption: 'Static point charges in vacuum · source cores excluded within 0.15 m', equation: 'E = kΣ q r/|r|³; V = kΣ q/|r|', parameters: [parameter('charge1', 'Left charge', 'nC', -10, 10, .5, 3), parameter('charge2', 'Right charge', 'nC', -10, 10, .5, -3), parameter('separation', 'Charge separation', 'm', .5, 6, .1, 3)] },
  { id: 'harmonic-oscillator', title: 'Damped oscillator', assumption: 'Linear Hooke spring · viscous damping · released from rest', equation: 'mx″ + cx′ + kx = 0; E = ½mv² + ½kx²', parameters: [parameter('mass', 'Mass', 'kg', .2, 5, .1, 1), parameter('stiffness', 'Spring stiffness', 'N/m', 1, 30, .5, 8), parameter('damping', 'Damping', 'kg/s', 0, 8, .1, .3), parameter('amplitude', 'Initial displacement', 'm', .1, 2, .1, 1.5)] },
  { id: 'pendulum', title: 'Nonlinear pendulum', assumption: 'Point mass · rigid massless rod · nonlinear gravity · RK4 integration', equation: 'θ″ = −(g/L)sinθ − bθ′; E/m = ½L²ω² + gL(1 − cosθ)', parameters: [parameter('length', 'Length', 'm', .3, 3, .1, 2), parameter('gravity', 'Gravity', 'm/s²', 1, 20, .1, 9.81), parameter('angle', 'Initial angle', '°', 5, 150, 1, 60), parameter('damping', 'Angular damping', 's⁻¹', 0, 2, .05, 0)] },
  { id: 'projectile', title: 'Projectile motion', assumption: 'Uniform gravity · no air resistance · flat ground', equation: 'x = v₀ cosα · t; y = v₀ sinα · t − ½gt²', parameters: [parameter('speed', 'Launch speed', 'm/s', 1, 50, 1, 20), parameter('angle', 'Launch angle', '°', 5, 85, 1, 45), parameter('gravity', 'Gravity', 'm/s²', 1, 25, .1, 9.81)] },
];
export function physicsModelDefinition(scene) {
  return PHYSICS_MODELS.find(model => model.id === scene);
}
export function physicsParameters(scene, input = {}) {
  return Object.fromEntries((physicsModelDefinition(scene)?.parameters ?? []).map(p => {
    // Recovered or XML-encoded payloads may quote numbers or omit the object.
    const raw = input && typeof input === 'object' ? input[p.key] : undefined;
    const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    return [p.key, typeof value === 'number' && Number.isFinite(value) ? Math.min(p.max, Math.max(p.min, value)) : p.initial];
  }));
}
export function physicsParametersError(scene, input) {
  const definition = physicsModelDefinition(scene);
  if (!definition) return 'Unknown physics scene';
  if (input === undefined) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Physics parameters must be an object';
  for (const [key, value] of Object.entries(input)) {
    const p = definition.parameters.find(p => p.key === key);
    if (!p) return `Unsupported ${definition.id} parameter: ${key}`;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < p.min || value > p.max) return `${key} must be between ${p.min} and ${p.max} ${p.unit}`;
  }
  return null;
}
