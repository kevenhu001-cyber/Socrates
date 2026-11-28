import { record, finite, located, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { normalizeDemonstrationExpression } from '../expression/parser.js';

// A deliberately bounded method-of-lines frontend for 1D diffusion/reaction.
// Lower to the same state variables, expression validation and Worker solver;
// no parallel simulation protocol or arbitrary user code.

// Uniform Cartesian method of lines for the 2D scalar diffusion equation.
// Boundary expressions are evaluated at each node, not at the plotting point.
function lowerSpatial2D(program, dynamics, spec) {
  const invalid = (message) => {
    throw located('dynamics.spatial', Error(message));
  };
  const {
    nx,
    ny,
    xDomain,
    yDomain,
    diffusivity,
    initial,
    boundary,
    source = 0,
    equation = 'diffusion',
  } = spec;
  const domainOK = (d) =>
    Array.isArray(d) &&
    d.length === 2 &&
    d.every((v) => finite(v) && Math.abs(v) <= 1e6) &&
    d[1] > d[0];
  if (
    dynamics.method !== 'rk45' ||
    equation !== 'diffusion' ||
    dynamics.initial !== undefined ||
    dynamics.derivatives !== undefined ||
    dynamics.massMatrix !== undefined
  )
    invalid('2D diffusion uses RK45 and replaces initial/derivatives maps');
  if (
    ![nx, ny].every((n) => Number.isInteger(n) && n >= 3 && n <= 7) ||
    !domainOK(xDomain) ||
    !domainOK(yDomain)
  )
    invalid('2D diffusion needs 3–7 nodes per axis and finite increasing domains');
  if (
    ![diffusivity, initial, boundary, source].every(
      (v) => finite(v) || (typeof v === 'string' && v.length > 0 && v.length <= 400),
    )
  )
    invalid('2D initial, boundary, diffusivity and source need bounded expressions');
  if (finite(diffusivity) && diffusivity < 0) invalid('Diffusivity cannot be negative');
  if (
    (program.parameters !== undefined && !Array.isArray(program.parameters)) ||
    (program.definitions !== undefined && !record(program.definitions))
  )
    invalid('Parameters and definitions must have their normal program shapes');
  const dx = (xDomain[1] - xDomain[0]) / (nx - 1);
  const dy = (yDomain[1] - yDomain[0]) / (ny - 1);
  if (dx < 1e-9 || dy < 1e-9) invalid('Grid spacing is too small');
  const id = (i, j) => `gridR${j}C${i}`;
  const rowId = (j) => `gridRow${j}`;
  const used = [
    ...(program.parameters ?? []).map((p) => p?.id),
    ...Object.keys(program.definitions ?? {}),
  ];
  if (used.some((name) => typeof name === 'string' && /^grid(?:R|Value)/.test(name)))
    invalid('gridR*, gridRow* and gridValue are reserved in 2D models');
  const edge = (i, j) => i === 0 || i === nx - 1 || j === 0 || j === ny - 1;
  const local = (value, i, j, allowU) =>
    String(normalizeDemonstrationExpression(value))
      .replace(/(?<![A-Za-z_])x(?![A-Za-z0-9_])/g, `(${xDomain[0] + i * dx})`)
      .replace(/(?<![A-Za-z_])y(?![A-Za-z0-9_])/g, `(${yDomain[0] + j * dy})`)
      .replace(/(?<![A-Za-z_])u(?![A-Za-z0-9_])/g, allowU ? id(i, j) : 'u');
  const value = (i, j) => (edge(i, j) ? `(${local(boundary, i, j, false)})` : id(i, j));
  const initialStates = {},
    derivatives = {};
  const definitions = { ...program.definitions };
  for (let j = 1; j < ny - 1; j++)
    for (let i = 1; i < nx - 1; i++) {
      const q = id(i, j),
        a = local(diffusivity, i, j, true);
      const laplace = `(${value(i - 1, j)}-2*${q}+${value(i + 1, j)})/(${dx})^2+(${value(i, j - 1)}-2*${q}+${value(i, j + 1)})/(${dy})^2`;
      initialStates[q] = local(initial, i, j, false);
      derivatives[q] = `if((${a})>=0,(${a})*(${laplace})+(${local(source, i, j, true)}),sqrt(-1))`;
    }
  for (let j = 0; j < ny; j++)
    definitions[rowId(j)] = Array.from(
      { length: nx },
      (_, i) => `${value(i, j)}*max(0,1-abs((x-(${xDomain[0]}))/(${dx})-${i}))`,
    ).join('+');
  definitions.gridValue = `if(x>=${xDomain[0]}&&x<=${xDomain[1]}&&y>=${yDomain[0]}&&y<=${yDomain[1]},${Array.from(
    { length: ny },
    (_, j) => `${rowId(j)}*max(0,1-abs((y-(${yDomain[0]}))/(${dy})-${j}))`,
  ).join('+')},sqrt(-1))`;
  const { spatial: _spatial, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial: initialStates, derivatives } };
}

// Compile a small linear RLC network into ODE states and algebraic MNA
// expressions. Currents are positive p -> n. Capacitor voltage and inductor
// current are independent states; ideal sources are algebraic constraints.

// Matrix state-space models lower into the existing scalar runtime, preserving
// a single solver and making individual states/outputs available to all views.

function lowerSpatialProgram(program) {
  const dynamics = program.dynamics;
  if (!record(dynamics) || dynamics.spatial === undefined) return program;
  const spec = dynamics.spatial;
  if (record(spec) && spec.dimension === 2) return lowerSpatial2D(program, dynamics, spec);
  const invalid = (message) => {
    throw located('dynamics.spatial', Error(message));
  };
  if (
    !record(spec) ||
    (spec.dimension !== undefined && spec.dimension !== 1) ||
    dynamics.method !== 'rk45' ||
    dynamics.initial !== undefined ||
    dynamics.derivatives !== undefined
  )
    invalid('Spatial diffusion requires RK45 and replaces initial/derivatives maps');
  const {
    nodes,
    domain,
    diffusivity,
    initial,
    left,
    right,
    source = 0,
    equation = 'diffusion',
    speed,
    initialVelocity = 0,
    damping = 0,
  } = spec;
  if (!['diffusion', 'wave'].includes(equation)) invalid('Use diffusion or wave');
  const wave = equation === 'wave';
  if (
    !Number.isInteger(nodes) ||
    nodes < 3 ||
    nodes > (wave ? 18 : 24) ||
    !Array.isArray(domain) ||
    domain.length !== 2 ||
    !domain.every((v) => finite(v) && Math.abs(v) <= 1e6) ||
    domain[0] >= domain[1]
  )
    invalid('Use 3–24 nodes and a finite increasing numeric domain');
  for (const value of [
    wave ? speed : diffusivity,
    initial,
    left,
    right,
    source,
    ...(wave ? [initialVelocity, damping] : []),
  ])
    if (!finite(value) && (typeof value !== 'string' || !value.length || value.length > 1600))
      invalid(
        'Diffusivity, initial profile, left/right boundary and source must be mathematical expressions',
      );
  if (!wave && finite(diffusivity) && diffusivity < 0) invalid('Diffusivity cannot be negative');
  if (wave && finite(speed) && speed <= 0) invalid('Wave speed must be positive');
  if (wave && finite(damping) && damping < 0) invalid('Damping must be nonnegative');
  if (dynamics.massMatrix !== undefined)
    invalid('Spatial models cannot also declare a mass matrix');
  const dx = (domain[1] - domain[0]) / (nodes - 1);
  if (!finite(dx) || dx < 1e-9) invalid('Grid spacing is too small');
  const stateName = (i) => `grid${i}`;
  const velocityName = (i) => `gridV${i}`;
  const parts = Array.from({ length: Math.ceil(nodes / 4) }, (_, i) => `gridPart${i}`);
  const generated = [
    ...Array.from({ length: nodes }, (_, i) => stateName(i)),
    ...(wave ? Array.from({ length: nodes - 2 }, (_, i) => velocityName(i + 1)) : []),
    ...parts,
    'gridValue',
  ];
  if (
    (program.parameters !== undefined && !Array.isArray(program.parameters)) ||
    (program.definitions !== undefined && !record(program.definitions))
  )
    invalid('Parameters and definitions must have their normal program shapes');
  const used = new Set([
    ...(program.parameters ?? []).map((p) => p?.id),
    ...Object.keys(program.definitions ?? {}),
  ]);
  if (generated.some((id) => used.has(id)))
    invalid('grid names are reserved inside spatial models');
  const definitions = { ...program.definitions };
  const initialStates = {},
    derivatives = {};
  // Explicit variable tokens only; the parser will validate every lowered expression.
  const local = (expression, i, allowU) =>
    String(normalizeDemonstrationExpression(expression))
      .replace(/(?<![A-Za-z_])x(?![A-Za-z0-9_])/g, `(${domain[0] + i * dx})`)
      .replace(/(?<![A-Za-z_])u(?![A-Za-z0-9_])/g, allowU ? stateName(i) : 'u');
  definitions.grid0 = local(left, 0, false);
  definitions[stateName(nodes - 1)] = local(right, nodes - 1, false);
  for (let i = 1; i < nodes - 1; i++) {
    initialStates[stateName(i)] = local(initial, i, false);
    const laplace = `(${stateName(i - 1)}-2*${stateName(i)}+${stateName(i + 1)})/(${dx})^2`;
    if (wave) {
      const c = local(speed, i, true),
        damp = local(damping, i, true);
      initialStates[velocityName(i)] = local(initialVelocity, i, false);
      derivatives[stateName(i)] = velocityName(i);
      derivatives[velocityName(i)] =
        `if((${c})>0&&(${damp})>=0,(${c})^2*(${laplace})-(${damp})*${velocityName(i)}+(${local(source, i, true)}),sqrt(-1))`;
    } else {
      const alpha = local(diffusivity, i, true);
      derivatives[stateName(i)] =
        `if((${alpha})>=0,(${alpha})*(${laplace})+(${local(source, i, true)}),sqrt(-1))`;
    }
  }
  for (let part = 0; part < parts.length; part++) {
    const terms = [];
    for (let i = part * 4; i < Math.min(nodes, (part + 1) * 4); i++)
      terms.push(`${stateName(i)}*max(0,1-abs((x-(${domain[0]}))/(${dx})-${i}))`);
    definitions[parts[part]] = terms.join('+');
  }
  definitions.gridValue = `if(x>=${domain[0]}&&x<=${domain[1]},${parts.join('+')},sqrt(-1))`;
  const { spatial: _spatial, ...rest } = dynamics;
  return { ...program, definitions, dynamics: { ...rest, initial: initialStates, derivatives } };
}

export { lowerSpatialProgram };
