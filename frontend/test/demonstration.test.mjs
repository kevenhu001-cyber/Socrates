import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleField } from '../src/react/intelligent-ui/demonstration/sampleField.ts';
import { samplePlot } from '../src/react/intelligent-ui/demonstration/samplePlot.ts';
import {
  parseDemonstrationExpression,
  evaluateDemonstrationExpression,
  demonstrationDomain,
  validateDemonstration,
  createDemonstrationRuntime,
  validateIntelligentUi,
} from '@socrates/core';
const examples = JSON.parse(
  readFileSync(
    new URL('../../docs/examples/algorithmic-demonstrations.json', import.meta.url),
    'utf8',
  ),
);
const calc = (expression, scope = {}) =>
  evaluateDemonstrationExpression(parseDemonstrationExpression(expression), scope);

test('mathematical language supports precedence, lazy branches, sums and recurrences', () => {
  assert.equal(calc('-2^2 + 3*4'), 8);
  assert.equal(calc('2^3^2'), 512);
  assert.equal(calc('sum(k,1,N,k^2)', { N: 4 }), 30);
  assert.equal(calc('iterate(v,1,8,v*2)'), 256);
  assert.equal(calc('if(x==0,1,sin(x)/x)', { x: 0 }), 1);
  assert.equal(calc('0 && missing'), 0);
  assert.ok(Math.abs(calc('sinc(0)') - 1) < 1e-15);
  assert.equal(calc('sinratio(6,pi)'), -1);
  assert.ok(calc('airy(0)') === 1);
  assert.ok(calc('airy(3.8317059702)') < 1e-7);
});
test('expressions cannot execute code, access objects, perform unbounded loops or exceed budget', () => {
  for (const expression of [
    'window.location',
    'Math.random()',
    'fetch("/api")',
    'x=>x',
    '[1,2]',
    'constructor(1)',
    '1e999',
    'sin(1,2)',
    'a;alert(1)',
    'x=1',
  ])
    assert.throws(() => parseDemonstrationExpression(expression));
  for (const expression of ['sum(k,0,1e30,k)', 'sum(k,0,2000,k)', 'iterate(v,1,2000,v+1)'])
    assert.throws(() => calc(expression));
  assert.throws(() =>
    evaluateDemonstrationExpression(
      parseDemonstrationExpression('sum(k,1,100,k^2)'),
      {},
      { remaining: 20 },
    ),
  );
});
test('new composed programs validate without registering physics model IDs', () => {
  for (const program of Object.values(examples)) {
    assert.deepEqual(validateDemonstration(program), { ok: true });
    assert.equal(
      validateIntelligentUi({
        version: 1,
        nodes: [{ id: 'new-algorithm', type: 'demonstration', program }],
      }).ok,
      true,
    );
  }
  const invalid = [
    { ...examples.grating, definitions: { a: 'b+1', b: 'a' } },
    { ...examples.grating, parameters: [{ id: 'x', min: 0, max: 1, value: 0.5 }] },
    { ...examples.lorenz, dynamics: { ...examples.lorenz.dynamics, step: 'not-a-number' } },
    { ...examples.grating, views: [{ kind: 'script', x: [0, 1], y: [0, 1] }] },
  ];
  for (const program of invalid) assert.equal(validateDemonstration(program).ok, false);
});
test('grating curves and raster field share physical definitions and removable singularities', () => {
  const runtime = createDemonstrationRuntime(examples.grating);
  assert.equal(runtime.evaluate('intensity', 0, 0), 1);
  assert.ok(
    Math.abs(runtime.evaluate('intensity', 0, 1) - runtime.evaluate('envelope', 0, 1)) < 1e-12,
  );
  assert.ok(runtime.evaluate('intensity', 0, 1 / 6) < 1e-20);
  const shifted = createDemonstrationRuntime(examples.grating, { wavelength: 650 });
  assert.ok(
    Math.abs(
      shifted.evaluate('intensity', 0, 650 / 550) - shifted.evaluate('envelope', 0, 650 / 550),
    ) < 1e-12,
  );
});
test('algorithmic Airy composition reproduces Rayleigh saddle and independently labeled sources', () => {
  const runtime = createDemonstrationRuntime(examples.airy);
  assert.ok(Math.abs(runtime.evaluate('total') - 0.735) < 0.001);
  assert.ok(Math.abs(runtime.evaluate('left', 0, -0.5) - 1) < 1e-12);
  assert.ok(
    Math.abs(runtime.evaluate('left', 0, 0.2) - runtime.evaluate('right', 0, -0.2)) < 1e-12,
  );
});
test('generic RK4 integrates an unregistered oscillator and Lorenz system with bounded state', () => {
  const oscillator = {
    version: 1,
    dynamics: {
      initial: { q: 1, v: 0 },
      derivatives: { q: 'v', v: '-q' },
      duration: 10,
      step: 0.01,
    },
    views: [{ kind: 'trajectory', x: [-2, 2], y: [-2, 2], horizontal: 'q', vertical: 'v' }],
  };
  const runtime = createDemonstrationRuntime(oscillator);
  for (const t of [0, 1, 2, 5, 10]) {
    const s = runtime.stateAt(t);
    assert.ok(Math.abs(s.q - Math.cos(t)) < 1e-8);
    assert.ok(Math.abs(s.q * s.q + s.v * s.v - 1) < 1e-8);
  }
  const lorenz = createDemonstrationRuntime(examples.lorenz);
  assert.ok(Math.abs(lorenz.stateAt(1).X - -9.37857) < 0.001);
  assert.ok(Object.values(lorenz.stateAt(20)).every(Number.isFinite));
  const divergent = {
    ...oscillator,
    dynamics: { ...oscillator.dynamics, derivatives: { q: '1e100*q', v: 'v' } },
  };
  // Divergence keeps the valid history and reports where it stopped.
  const stopped = createDemonstrationRuntime(divergent);
  assert.match(stopped.warnings[0].message, /diverged/);
  assert.ok(stopped.duration < divergent.dynamics.duration);
  assert.ok(Object.values(stopped.stateAt(stopped.duration)).every(Number.isFinite));
});

test('parameter-dependent axes keep linked intensity curves visible with calibrated bounds', () => {
  const normal = createDemonstrationRuntime(examples.airy),
    close = createDemonstrationRuntime(examples.airy, { s: 0.2 });
  const bounds = examples.airy.views[1].y;
  assert.deepEqual(demonstrationDomain(bounds, normal), [0, 1.12]);
  assert.ok(demonstrationDomain(bounds, close)[1] > close.evaluate('total'));
  assert.deepEqual(demonstrationDomain([1, 0], normal), [0, 1]);
  assert.throws(() => demonstrationDomain([0, '1/0'], normal), /finite/);
  assert.deepEqual(demonstrationDomain([0, '1/0'], normal, 0, [-1, 1]), [-1, 1]);
});

test('sampling only evaluates referenced definitions and retains a finite resettable budget', () => {
  const runtime = createDemonstrationRuntime({
    version: 1,
    definitions: { costly: 'sum(k,1,128,sum(j,1,128,k*j))', signal: 'sin(x)' },
    views: [{ kind: 'metrics', values: [{ label: 'signal', expression: 'signal' }] }],
  });
  for (let i = 0; i < 2000; i++) assert.equal(runtime.evaluate('signal', 0, 0), 0);
  assert.equal(runtime.evaluate('costly'), ((128 * 129) / 2) ** 2);
  assert.throws(() => {
    for (let i = 0; i < 100; i++)
      runtime.evaluate('costly+x+sum(k,1,128,sum(j,1,128,k*j*x))', 0, i);
  }, /budget exceeded/);
  runtime.resetBudget();
  assert.equal(runtime.evaluate('signal', 0, 0), 0);
});

test('model notation and XML-encoded programs are normalized before validation', () => {
  for (const [expression, expected] of [
    ['x²+2x', 8],
    ['2πx', 4 * Math.PI],
    ['3·x − 1', 5],
    ['Math.sin(x)**2', Math.sin(2) ** 2],
    ['y = x^2', 4],
    ['√(4x)', Math.sqrt(8)],
    ['x>0 ? 1 : -1', 1],
    ['ln(e)', 1],
    ['（1＋2）×3', 9],
  ])
    assert.ok(Math.abs(calc(expression, { x: 2 }) - expected) < 1e-12, expression);
  const program = {
    version: '1',
    parameters: { item: [{ id: 'A', label: 'A', value: '5', min: '2', max: '0' }] },
    definitions: { f: 'g+1', g: 'A·x' },
    views: { item: [{ type: 'plot', x: { item: ['1', '-1'] }, y: ['-3', '3'], curves: 'f' }] },
  };
  assert.deepEqual(validateDemonstration(program), { ok: true });
  const runtime = createDemonstrationRuntime(program);
  assert.equal(runtime.parameters.A, 2);
  assert.equal(runtime.evaluate('f', 0, 1), 3);
  const located = validateDemonstration({
    version: 1,
    parameters: [{ id: 'a', value: 1, min: 0, max: 2 }],
    views: [{ kind: 'plot', x: [0, 1], y: [0, 1], curves: [{ expression: 'A*x' }] }],
  });
  assert.equal(located.ok, false);
  assert.equal(located.path, 'views[0].curves[0]');
  assert.match(located.error, /did you mean a/);
});

test('physical scene composition uses shared ODE state, units and parameter changes', () => {
  const scenes = JSON.parse(
    readFileSync(
      new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url),
      'utf8',
    ),
  );
  for (const program of Object.values(scenes)) {
    assert.deepEqual(validateDemonstration(program), { ok: true });
    assert.equal(
      validateIntelligentUi({
        version: 1,
        nodes: [{ id: 'scene', type: 'demonstration', program }],
      }).ok,
      true,
    );
  }
  const runtime = createDemonstrationRuntime(scenes.oscillator);
  const quarterPeriod = Math.PI / 4;
  assert.ok(Math.abs(runtime.evaluate('q', quarterPeriod)) < 0.0001);
  assert.ok(Math.abs(runtime.evaluate('v', quarterPeriod) + 2) < 0.0001);
  assert.ok(Math.abs(runtime.evaluate('energy', quarterPeriod) - 2) < 0.0003);
  const heavier = createDemonstrationRuntime(scenes.oscillator, { mass: 2 });
  assert.ok(heavier.evaluate('q', quarterPeriod) > 0.4);
  const pendulum = createDemonstrationRuntime(scenes.pendulum);
  for (const time of [0, 1, 3])
    assert.ok(
      Math.abs(Math.hypot(pendulum.evaluate('bobX', time), pendulum.evaluate('bobY', time)) - 1.4) <
        1e-10,
    );
});

test('scene objects reject missing coordinates, invalid sizes, unsafe expressions and excess geometry', () => {
  const scene = (objects) => ({
    version: 1,
    views: [{ kind: 'scene', x: [-2, 2], y: [-1, 1], objects }],
  });
  const body = { kind: 'body', center: [0, 0], radius: 0.1 };
  for (const object of [
    { ...body, center: [0] },
    { ...body, radius: -1 },
    { ...body, center: ['unknown', 0] },
    { ...body, radius: 'fetch(1)' },
    { ...body, color: 'url(https://example.com)' },
    { kind: 'block', center: [0, 0], width: 1 },
    { kind: 'spring', from: [0, 0] },
    { kind: 'script' },
  ]) {
    const result = validateDemonstration(scene([object]));
    assert.equal(result.ok, false, JSON.stringify(object));
    assert.match(result.path, /views\[0\].objects/);
  }
  assert.equal(validateDemonstration(scene([])).ok, false);
  assert.equal(validateDemonstration(scene(Array.from({ length: 33 }, () => body))).ok, false);
  assert.equal(
    validateDemonstration(scene([{ ...body, center: { item: ['0', '1'] }, radius: '0.1' }])).ok,
    true,
  );
});

test('editable physics catalog stays portable and is present in the published examples', async () => {
  const { PHYSICS_EXAMPLES, PHYSICS_EXAMPLE_ASSUMPTIONS } =
    await import('../../packages/core/src/physicsExamples.js');
  const published = JSON.parse(
    readFileSync(
      new URL('../../docs/examples/intelligent-ui-physics.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(published, PHYSICS_EXAMPLES);
  assert.equal(Object.keys(PHYSICS_EXAMPLES).length, 9);
  for (const [id, program] of Object.entries(PHYSICS_EXAMPLES)) {
    assert.ok(PHYSICS_EXAMPLE_ASSUMPTIONS[id]);
    assert.deepEqual(validateDemonstration(program), { ok: true }, id);
    const runtime = createDemonstrationRuntime(program);
    assert.deepEqual(runtime.warnings, [], id);
  }
});

test('coupled springs and magnetic motion preserve their declared invariants', async () => {
  const { PHYSICS_EXAMPLES } = await import('../../packages/core/src/physicsExamples.js');
  const coupled = createDemonstrationRuntime(PHYSICS_EXAMPLES.coupledOscillators);
  const energy = coupled.evaluate('energy');
  for (const t of [1, 4, 12, 20])
    assert.ok(Math.abs(coupled.evaluate('energy', t) - energy) < 1e-6);
  const particle = createDemonstrationRuntime(PHYSICS_EXAMPLES.chargedParticle);
  for (const t of [0, 1, 6, 12]) {
    assert.ok(Math.abs(particle.evaluate('kinetic', t) - 0.5) < 1e-5);
    assert.ok(Math.abs(particle.evaluate('px^2+(py+1)^2', t) - 1) < 1e-5);
  }
  const orbit = createDemonstrationRuntime(PHYSICS_EXAMPLES.keplerOrbit);
  const orbitalEnergy = orbit.evaluate('energy'),
    angular = orbit.evaluate('angular');
  for (const t of [2, 8, 16]) {
    assert.ok(Math.abs(orbit.evaluate('energy', t) - orbitalEnergy) < 1e-5);
    assert.ok(Math.abs(orbit.evaluate('angular', t) - angular) < 1e-5);
  }
});

test('RC and thermal examples match initial and one-time-constant limits', async () => {
  const { PHYSICS_EXAMPLES } = await import('../../packages/core/src/physicsExamples.js');
  const rc = createDemonstrationRuntime(PHYSICS_EXAMPLES.rcCharging);
  assert.equal(rc.evaluate('voltage'), 0);
  assert.ok(Math.abs(rc.evaluate('voltage', 2) - 5 * (1 - Math.exp(-1))) < 1e-10);
  const thermal = createDemonstrationRuntime(PHYSICS_EXAMPLES.thermalCooling);
  assert.equal(thermal.evaluate('temperature'), 90);
  assert.ok(Math.abs(thermal.evaluate('temperature', 5) - (20 + 70 / Math.E)) < 1e-10);
});

test('path and expression presets validate geometry, dependencies and resource limits', () => {
  const program = {
    version: 1,
    parameters: [{ id: 'a', value: 1, min: 0, max: 3 }],
    views: [
      {
        kind: 'scene',
        x: [-1, 1],
        y: [-1, 1],
        objects: [
          {
            kind: 'path',
            points: [
              [0, 0],
              ['a', 1],
            ],
            dashed: true,
          },
        ],
      },
    ],
    presets: [{ label: 'Double', values: { a: 'min(3,2*a)' } }],
  };
  assert.equal(validateDemonstration(program).ok, true);
  for (const points of [
    [[0, 0]],
    [[0]],
    Array.from({ length: 65 }, () => [0, 0]),
    [
      [0, 0],
      ['unknown', 1],
    ],
  ]) {
    const invalid = structuredClone(program);
    invalid.views[0].objects[0].points = points;
    assert.equal(validateDemonstration(invalid).ok, false);
  }
  const invalid = structuredClone(program);
  invalid.presets[0].values.a = 'unknown';
  assert.equal(validateDemonstration(invalid).ok, false);
});

test('runtime dependencies follow definitions, lexical loop bindings and dynamic state', () => {
  const runtime = createDemonstrationRuntime({
    ...examples.lorenz,
    definitions: {
      ...examples.lorenz.definitions,
      horizontal: 'x+2',
      vertical: 'y+3',
      combined: 'horizontal+vertical',
      localOnly: 'sum(k,1,3,k^2)',
      lexical: 'sum(k,1,3,horizontal+k)',
      sampled: 'combined+localOnly',
    },
  });
  assert.equal(runtime.dependencies('localOnly'), 0);
  assert.equal(runtime.dependencies('lexical'), 1);
  assert.equal(runtime.dependencies('sampled'), 3);
  assert.equal(runtime.evaluate('lexical', 0, 10), 42);
  assert.equal(runtime.evaluate('sampled', 0, 10, 2), 31);
  assert.equal(runtime.evaluate('sampled', 0, -10, 5), 14);
  const state = Object.keys(examples.lorenz.dynamics.initial)[0];
  assert.equal(runtime.dependencies(state), 4);
  for (const time of [0, 0.31, 20, 0.31]) {
    runtime.evaluate('sampled', time, 1, 1);
    assert.equal(runtime.evaluate(state, time, 1, 1), runtime.stateAt(time)[state]);
  }
});

test('cooperative RK4 can yield and produces the same complete history as the synchronous runtime', async () => {
  const { compileDemonstrationRuntime } = await import('@socrates/core/demonstration');
  const job = compileDemonstrationRuntime(examples.lorenz)();
  let result = job.next();
  assert.equal(result.done, false);
  while (!result.done) result = job.next();
  const sync = createDemonstrationRuntime(examples.lorenz);
  assert.equal(result.value.duration, 20);
  assert.deepEqual(result.value.warnings, sync.warnings);
  for (const time of [0, 0.023, 2.36, 15.2, 20])
    assert.deepEqual(result.value.stateAt(time), sync.stateAt(time));
});

test('adaptive RK45 integrates a nonstiff RC decay and interpolates in time', () => {
  const runtime = createDemonstrationRuntime({
    version: 1,
    parameters: [{ id: 'tau', value: 2, min: 0.5, max: 4 }],
    dynamics: {
      method: 'rk45', duration: 10, step: 0.25,
      initial: { voltage: 5 }, derivatives: { voltage: '-voltage/tau' },
    },
    views: [{ kind: 'plot', history: true, x: [0, 10], y: [0, 5], curves: [{ expression: 'voltage' }] }],
  });
  assert.equal(runtime.duration, 10);
  assert.deepEqual(runtime.warnings, []);
  for (const time of [0, 0.123, 1.55, 5, 10])
    assert.ok(Math.abs(runtime.stateAt(time).voltage - 5*Math.exp(-time/2)) < 2e-5);
});

test('hybrid dynamics locate a falling impact and apply simultaneous state resets', () => {
  const runtime = createDemonstrationRuntime({
    version: 1,
    dynamics: {
      method: 'rk45', duration: 1, step: 0.1,
      initial: { height: 1, velocity: 0 },
      derivatives: { height: 'velocity', velocity: -9.81 },
      events: [{ expression: 'height', direction: -1, reset: { height: 0, velocity: '-0.8*velocity' } }],
    },
    views: [{ kind: 'trajectory', x: [0, 1], y: [0, 2], horizontal: 't', vertical: 'height' }],
  });
  assert.deepEqual(runtime.warnings, []);
  const impact = Math.sqrt(2/9.81);
  assert.ok(runtime.stateAt(impact-0.0001).velocity < 0);
  assert.ok(runtime.stateAt(impact+0.0001).velocity > 0);
  assert.ok(runtime.stateAt(0.6).height > 0);
});

test('terminal event limits playback to a root, not the next output sample', () => {
  const runtime = createDemonstrationRuntime({
    version: 1,
    dynamics: {
      method: 'rk45', duration: 5, step: 0.2,
      initial: { q: 1 }, derivatives: { q: -1 },
      events: [{ expression: 'q', direction: -1, terminal: true }],
    },
    views: [{ kind: 'metrics', values: [{ expression: 'q' }] }],
  });
  assert.ok(Math.abs(runtime.duration-1) < 1e-8);
  assert.ok(Math.abs(runtime.stateAt(5).q) < 1e-8);
});

test('spatial diffusion uses the same runtime and agrees with a heat-equation mode', () => {
  const program = {
    version: 1,
    dynamics: {
      method: 'rk45', duration: 1, step: 0.01,
      spatial: { nodes: 11, domain: [0, 1], diffusivity: 0.1,
        initial: 'sin(pi*x)', left: 0, right: 0 },
    },
    views: [{ kind: 'plot', x: [0, 1], y: [0, 1], curves: [{ expression: 'gridValue' }] }],
  };
  assert.deepEqual(validateDemonstration(program), { ok: true });
  const runtime = createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('gridValue', 1, 0.5) - Math.exp(-0.1*Math.PI**2)) < 0.005);
  assert.equal(runtime.evaluate('gridValue', 1, 0), 0);
  assert.ok(Math.abs(runtime.evaluate('gridValue', 1, 1)) < 1e-12);
  assert.equal(validateDemonstration({...program, dynamics: {...program.dynamics, spatial: {...program.dynamics.spatial, nodes: 1000}}}).ok, false);
});

test('scaled coupled solve supports mass matrices and refuses singular systems', () => {
  assert.ok(Math.abs(calc('solve2(1,2,1,1,3,5,7)') - 1.6) < 1e-12);
  assert.ok(Math.abs(calc('solve2(2,2,1,1,3,5,7)') - 1.8) < 1e-12);
  assert.ok(Number.isNaN(calc('solve2(1,1,1,2,2,3,6)')));
  assert.equal(calc('dot3(1,2,3,4,5,6)'), 32);
});

test('field annotations are validated without registering a new renderer', () => {
  const p = { version: 1, views: [{ kind: 'field', x: [-1, 1], y: [-1, 1],
    palette: 'heat', expression: 'x^2+y^2', colorRange: [0, 2], unit: 'K',
    contours: [0.5, 1], vector: ['-2*x', '-2*y'], vectorScale: 2 }] };
  assert.deepEqual(validateDemonstration(p), { ok: true });
  assert.equal(validateDemonstration({...p, views: [{...p.views[0], contours: Array(7).fill(0)}]}).ok, false);
  assert.equal(validateDemonstration({...p, views: [{...p.views[0], vectorScale: -1}]}).ok, false);
});

test('nonsingular mass-matrix dynamics solve implicit coupled equations', () => {
  const program = {
    version: 1,
    dynamics: { method: 'rk45', duration: 1, step: 0.1,
      initial: { q: 0, v: 0 }, derivatives: { q: 5, v: 7 },
      massMatrix: [[2, 1], [1, 3]] },
    views: [{ kind: 'metrics', values: [{ expression: 'q' }] }],
  };
  const runtime = createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.stateAt(1).q - 1.6) < 1e-10);
  assert.ok(Math.abs(runtime.stateAt(1).v - 1.8) < 1e-10);
  assert.ok(createDemonstrationRuntime({...program, dynamics: {...program.dynamics, massMatrix: [[1, 1], [1, 1]]}}).warnings.length > 0);
  assert.ok(Math.abs(calc('solve3(3,1,0,0,0,2,0,0,0,3,1,4,9)') - 3) < 1e-12);
});
test('spatial wave equation approximates a fixed-end standing mode', () => {
  const runtime = createDemonstrationRuntime({
    version: 1,
    dynamics: { method: 'rk45', duration: 0.5, step: 0.01,
      spatial: { equation: 'wave', nodes: 15, domain: [0, 1], speed: 1,
        initial: 'sin(pi*x)', initialVelocity: 0, left: 0, right: 0 } },
    views: [{ kind: 'plot', x: [0, 1], y: [-1, 1], curves: [{ expression: 'gridValue' }] }],
  });
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('gridValue', 0.5, 0.5)) < 0.01);
});

test('scientific model examples preserve energy and constraint residuals', () => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  for (const program of Object.values(scientific)) {
    assert.deepEqual(validateDemonstration(program), { ok: true });
    assert.deepEqual(createDemonstrationRuntime(program).warnings, []);
  }
  const rlc = createDemonstrationRuntime(scientific.rlc);
  assert.ok(Math.abs(rlc.evaluate('balance', 5)) < 1e-5);
  const pendulum = createDemonstrationRuntime(scientific.constrainedPendulum);
  for (let i = 0; i <= 100; i++)
    assert.ok(Math.abs(pendulum.evaluate('constraint', i * 0.05)) < 1e-5);
});

function finishGenerator(iterator) {
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
test('calibrated fields use actual values and computed isolines', () => {
  const view = {kind: 'field', x: [-1,1], y: [-1,1], expression: 'x',
    height: 64, palette: 'heat', colorRange: [-1,1], contours: [0],
    vector: ['x', 0], vectorScale: 2};
  const runtime = createDemonstrationRuntime({version: 1, views: [view]});
  const sample = finishGenerator(sampleField(view, runtime, 0, false));
  assert.deepEqual(sample.colorRange, [-1,1]);
  const pixels = new Uint8ClampedArray(sample.pixels);
  assert.deepEqual([...pixels.slice(0,4)], [0,0,0,255]);
  assert.deepEqual([...pixels.slice(319*4,320*4)], [255,255,255,255]);
  assert.equal(sample.contours.length, 1);
  assert.ok(sample.contours[0].lines.length > 0);
  for (let i=0; i<sample.contours[0].lines.length; i+=2)
    assert.ok(Math.abs(sample.contours[0].lines[i] - 159.5) < 0.1);
  assert.ok(sample.arrows.length > 0);
  for (let i=0; i<sample.arrows.length; i+=4)
    assert.ok(Math.hypot(sample.arrows[i+2], sample.arrows[i+3]) <= 2.5);
});
test('history plots sample state at each plotted time and carry event guides', () => {
  const view = {kind:'plot', history:true, x:[0,2], y:[0,2], curves:[{expression:'q'}]};
  const runtime = createDemonstrationRuntime({version:1,dynamics:{
    method:'rk45', duration:2, step:0.05, initial:{q:0}, derivatives:{q:1},
    events:[{expression:'q-1', direction:1, terminal:true}]},views:[view]});
  const sample = finishGenerator(samplePlot(view, runtime, runtime.duration, false, new Map()));
  assert.ok(sample.paths[0].includes('L'));
  assert.ok(Math.abs(sample.playhead-1)<1e-8);
  assert.ok(Math.abs(sample.eventTimes[0]-1)<1e-8);
});

test('L-stable SDIRK2 tracks a stiff forced decay', () => {
  const program = {
    version: 1, dynamics: { method: 'sdirk2', duration: 1, step: 0.1,
      rtol: 1e-5, atol: 1e-8, initial: { q: 1 },
      derivatives: { q: '-10000*(q-cos(t))-sin(t)' } },
    views: [{ kind: 'metrics', values: [{ expression: 'q' }] }],
  };
  const runtime = createDemonstrationRuntime(program);
  assert.equal(runtime.duration, 1);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.stateAt(1).q - Math.cos(1)) < 1e-4);
});
test('simultaneous events apply disjoint resets to the same prior state', () => {
  const runtime = createDemonstrationRuntime({
    version: 1, dynamics: { method: 'rk45', duration: 2, step: 0.1,
      initial: { q: 0, v: 0 }, derivatives: { q: 1, v: 1 },
      events: [{ expression: 't-1', direction: 1, reset: { q: 'q+2' } },
        { expression: 't-1', direction: 1, reset: { v: 'v+3' } }] },
    views: [{ kind: 'metrics', values: [{ expression: 'q' }] }],
  });
  assert.deepEqual(runtime.warnings, []);
  assert.equal(runtime.eventTimes.length, 1);
  assert.ok(Math.abs(runtime.stateAt(2).q - 4) < 1e-7);
  assert.ok(Math.abs(runtime.stateAt(2).v - 5) < 1e-7);
});

test('two-dimensional diffusion matches a separable heat mode and fixed boundaries', () => {
  const runtime = createDemonstrationRuntime({
    version: 1, dynamics: { method: 'rk45', duration: 0.2, step: 0.01,
      spatial: { dimension: 2, nx: 7, ny: 7, xDomain: [0,1], yDomain: [0,1],
        diffusivity: 0.1, initial: 'sin(pi*x)*sin(pi*y)', boundary: 0 }},
    views: [{ kind: 'field', x: [0,1], y: [0,1], expression: 'gridValue' }],
  });
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('gridValue', 0.2, 0.5, 0.5) - Math.exp(-0.04*Math.PI**2)) < 0.01);
  for (const [x,y] of [[0,0.5],[1,0.5],[0.5,0],[0.5,1]])
    assert.ok(Math.abs(runtime.evaluate('gridValue',0.2,x,y)) < 1e-12);
});
test('logarithmic plots sample physical frequencies and reject invalid bounds', () => {
  const view = {kind:'plot', x:[1,1000], y:[0,3], xScale:'log', curves:[{expression:'log10(x)'}]};
  const program = {version:1, views:[view]};
  const runtime = createDemonstrationRuntime(program);
  const sample = finishGenerator(samplePlot(view,runtime,0,false,new Map()));
  assert.equal(sample.xScale,'log');
  assert.ok(sample.paths[0].startsWith('M48.00,194.00'));
  assert.ok(sample.paths[0].endsWith('L508.00,14.00'));
  assert.equal(validateDemonstration({...program,views:[{...view,x:[0,1000]}]}).ok,false);
});

test('linear circuit compiler solves RC node voltages and Kirchhoff currents', () => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const program = scientific.netlistRC;
  const runtime = createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('voltage_out', 2) - 5*(1-Math.exp(-2))) < 1e-5);
  assert.ok(Math.abs(runtime.evaluate('current_resistor-current_cap', 2)) < 1e-10);
  const bad = JSON.parse(JSON.stringify(program));
  bad.dynamics.circuit.elements[2].value = '1+t';
  assert.equal(validateDemonstration(bad).ok,false);
});
test('spatial slice evaluates the requested y-coordinate', () => {
  const view = {kind:'plot', x:[0,1], y:[0,2], sliceY:0.5, curves:[{expression:'x+y'}]};
  const runtime = createDemonstrationRuntime({version:1,views:[view]});
  const sample = finishGenerator(samplePlot(view,runtime,0,false,new Map()));
  assert.ok(sample.paths[0].startsWith('M48.00,149.00'));
  assert.ok(sample.paths[0].endsWith('L508.00,59.00'));
});

test('stiff integration damps a fast mode while retaining a slow mode', () => {
  const runtime = createDemonstrationRuntime({
    version: 1, dynamics: { method: 'sdirk2', duration: 1, step: 0.1,
      rtol: 1e-5, atol: 1e-8, initial: { fast: 1, slow: 1 },
      derivatives: { fast: '-10000*fast', slow: '-slow' } },
    views: [{ kind: 'metrics', values: [{ expression: 'slow' }] }],
  });
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.stateAt(1).slow - Math.exp(-1)) < 1e-4);
  assert.ok(Math.abs(runtime.stateAt(1).fast) < 1e-7);
});
test('linear MNA supports series RLC with capacitor and inductor states', () => {
  const runtime = createDemonstrationRuntime({
    version: 1, dynamics: { method: 'rk45', duration: 2, step: 0.02,
      circuit: { nodes: ['a','b','c'], elements: [
        { kind: 'V', id: 'v', p: 'a', n: '0', value: 1 },
        { kind: 'R', id: 'r', p: 'a', n: 'b', value: 2 },
        { kind: 'L', id: 'l', p: 'b', n: 'c', value: 1 },
        { kind: 'C', id: 'c', p: 'c', n: '0', value: 1 },
      ] } },
    views: [{ kind: 'metrics', values: [{ expression: 'voltage_c' }] }],
  });
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('voltage_c', 2) - (1-3*Math.exp(-2))) < 1e-5);
  assert.ok(Math.abs(runtime.evaluate('current_l-current_c',2)) < 1e-10);
});

test('structured state space matrices match a critically damped step response', () => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const runtime = createDemonstrationRuntime(scientific.stateSpace);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.evaluate('response',2)-(1-3*Math.exp(-2)))<1e-7);
  const bad=JSON.parse(JSON.stringify(scientific.stateSpace));
  bad.dynamics.stateSpace.A=[[1]];
  assert.equal(validateDemonstration(bad).ok,false);
});
test('semi-explicit index-one constraints reconstruct consistent nonlinear algebraic states', () => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const runtime = createDemonstrationRuntime(scientific.indexOneDAE);
  assert.deepEqual(runtime.warnings, []);
  assert.ok(Math.abs(runtime.stateAt(1).q-.25)<1e-6);
  assert.ok(Math.abs(runtime.stateAt(1).aux-.5)<1e-6);
  assert.ok(Math.abs(runtime.evaluate('aux^2-q',.333))<1e-10);
  const bad=JSON.parse(JSON.stringify(scientific.indexOneDAE));
  bad.dynamics.algebraic.guess.aux='q';
  assert.equal(validateDemonstration(bad).ok,false);
});
test('surface sampling provides real bounded mesh values without raster allocation', () => {
  const view={kind:'field',presentation:'surface',x:[-1,1],y:[-1,1],zRange:[0,2],expression:'x^2+y^2'};
  const runtime=createDemonstrationRuntime({version:1,views:[view]});
  const sample=finishGenerator(sampleField(view,runtime,0,false));
  assert.equal(sample.pixels.byteLength,0);
  assert.equal(sample.surface.size,33);
  assert.equal(sample.surface.values[16*33+16],0);
  assert.equal(sample.surface.values[0],2);
  assert.equal(validateDemonstration({version:1,views:[{...view,zRange:[2,0]}]}).ok,false);
});

test('matrix-free implicit grid resolves a 65 by 65 heat mode within bounded history', () => {
  const program = {version:1,dynamics:{method:'grid-implicit',duration:.2,step:.001,
    spatial:{dimension:2,nx:65,ny:65,xDomain:[0,1],yDomain:[0,1],diffusivity:.1,
      initial:'sin(pi*x)*sin(pi*y)',boundary:0}},
    views:[{kind:'field',x:[0,1],y:[0,1],expression:'gridValue'}]};
  const runtime=createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings,[]);
  assert.ok(Math.abs(runtime.evaluate('gridValue',.2,.5,.5)-Math.exp(-.04*Math.PI**2))<.001);
  assert.equal(runtime.evaluate('gridValue',.2,0,.5),0);
  assert.ok(runtime.evaluate('gridMean',.2)<runtime.evaluate('gridMean',0));
  assert.equal(validateDemonstration({...program,dynamics:{...program.dynamics,step:.00001}}).ok,false);
});
test('implicit diffusion uses stationary nonzero boundaries and sources', () => {
  const program={version:1,dynamics:{method:'grid-implicit',duration:1,step:.01,
    spatial:{nodes:129,domain:[0,1],diffusivity:.1,initial:'20+10*x',left:20,right:30}},
    views:[{kind:'plot',x:[0,1],y:[20,30],curves:[{expression:'gridValue'}]}]};
  const runtime=createDemonstrationRuntime(program);
  assert.deepEqual(runtime.warnings,[]);
  assert.ok(Math.abs(runtime.evaluate('gridValue',1,.37)-23.7)<1e-8);
  assert.equal(validateDemonstration({...program,dynamics:{...program.dynamics,spatial:{...program.dynamics.spatial,diffusivity:'1+t'}}}).ok,false);
});

test('structured linear algebra supports shape-checked matrix-vector products', () => {
  const program={version:1,linearAlgebra:[
    {id:'force',op:'vector',values:[3,4]},
    {id:'rot',op:'matrix',values:[[0,-1],[1,0]]},
    {id:'result',op:'matmul',a:'rot',b:'force'},
    {id:'mag',op:'norm',a:'result'},
    {id:'orthogonal',op:'dot',a:'force',b:'result'}],
    views:[{kind:'metrics',values:[{expression:'result_1'},{expression:'mag'}]}]};
  const runtime=createDemonstrationRuntime(program);
  assert.equal(runtime.evaluate('result_1'),-4);
  assert.equal(runtime.evaluate('result_2'),3);
  assert.equal(runtime.evaluate('mag'),5);
  assert.equal(runtime.evaluate('orthogonal'),0);
  const invalid={...program,linearAlgebra:program.linearAlgebra.map((e,i)=>i===0?{...e,values:[1,2,3]}:e)};
  assert.equal(validateDemonstration(invalid).ok,false);
});

test('event rearming prevents a second crossing caused solely by numerical root offset', () => {
  const runtime=createDemonstrationRuntime({version:1,dynamics:{method:'rk45',duration:2,step:.17,
    initial:{q:1,v:-1},derivatives:{q:'v',v:0},
    events:[{expression:'q',direction:0,rearmTolerance:1e-6,reset:{v:'-v'}}]},
    views:[{kind:'metrics',values:[{expression:'q'}]}]});
  assert.deepEqual(runtime.warnings,[]);
  assert.equal(runtime.eventTimes.length,1);
  assert.ok(Math.abs(runtime.stateAt(2).q-1)<1e-7);
  assert.equal(runtime.stateAt(2).v,1);
});

test('CSR PCG solves a sparse symmetric chain and rejects detected indefinite curvature', () => {
  const n=128,entries=[],rhs=[];
  for(let i=0;i<n;i++){
    entries.push([i,i,4]);if(i<n-1)entries.push([i,i+1,-1]);rhs.push(i===0||i===n-1?3:2);
  }
  const program={version:1,diagnostics:true,sparseSystem:{size:n,entries,rhs,tolerance:1e-10},
    views:[{kind:'plot',x:[0,n-1],y:[0,2],curves:[{expression:'sparseValue'}]}]};
  const runtime=createDemonstrationRuntime(program);
  for(let i=0;i<n;i++)assert.ok(Math.abs(runtime.evaluate('sparseValue',0,i)-1)<1e-8);
  assert.ok(Math.abs(runtime.evaluate('sparseAt(64)')-1)<1e-8);
  assert.ok(runtime.evaluate('sparseResidual')<1e-10);
  assert.equal(runtime.diagnostics.method,'PCG');
  assert.ok(runtime.diagnostics.iterations>0);
  assert.throws(()=>createDemonstrationRuntime({...program,sparseSystem:{size:2,entries:[[0,0,1],[0,1,2],[1,1,1]],rhs:[1,-1]}}),/positive definite/);
  assert.equal(validateDemonstration({...program,sparseSystem:{size:2,entries:[[0,0,1],[0,0,2],[1,1,1]],rhs:[1,1]}}).ok,false);
});
test('3D vector scope does not cache across the third spatial coordinate', () => {
  const view={kind:'field',presentation:'vectors3d',x:[-1,1],y:[-1,1],zRange:[-1,1],vector3d:['-y','x','spaceZ'],vectorScale:2,expression:0};
  const runtime=createDemonstrationRuntime({version:1,definitions:{radial:'x^2+y^2+spaceZ^2'},views:[view]});
  assert.equal(runtime.evaluate('radial',0,1,1,1),3);
  assert.equal(runtime.evaluate('radial',0,1,1,0),2);
  assert.equal(runtime.dependencies('radial')&8,8);
  const sample=finishGenerator(sampleField(view,runtime,0,false));
  assert.ok(sample.surface.arrows3d.length>300);
  assert.equal(sample.pixels.byteLength,0);
});
test('3D curve sampling follows the actual parameter and dynamics history', () => {
  const view={kind:'field',presentation:'curve3d',x:[-1,1],y:[-1,1],zRange:[0,2],parameterRange:[0,2*Math.PI],curve3d:['cos(x)','sin(x)','x/pi'],expression:0};
  const runtime=createDemonstrationRuntime({version:1,views:[view]});
  const sample=finishGenerator(sampleField(view,runtime,0,false));
  assert.ok(sample.surface.curve.length>400);
  assert.ok(Math.abs(sample.surface.curve[0][0]-1)<1e-10);
  assert.ok(Math.abs(sample.surface.curve.at(-1)[2]-1)<1e-10);
  const history={...view,parameterRange:undefined,curveHistory:true,curve3d:['q','0','t']};
  const dynamic=createDemonstrationRuntime({version:1,dynamics:{method:'rk45',duration:1,step:.1,initial:{q:0},derivatives:{q:1}},views:[history]});
  const trail=finishGenerator(sampleField(history,dynamic,.5,false));
  assert.ok(Math.abs(trail.surface.curve.at(-1)[0]-.5)<1e-10);
});
test('adaptive diagnostics count rejected and accepted steps, not global errors',()=>{
  const runtime=createDemonstrationRuntime({version:1,diagnostics:true,dynamics:{method:'rk45',duration:1,step:.2,initial:{q:1},derivatives:{q:'-10*q'}},views:[{kind:'metrics',values:[{expression:'q'}]}]});
  assert.ok(runtime.diagnostics.acceptedSteps>0);
  assert.ok(runtime.diagnostics.rejectedSteps>0);
  assert.ok(runtime.diagnostics.maxLocalError<=1);
  assert.equal(runtime.diagnostics.derivativeEvaluations,7*(runtime.diagnostics.acceptedSteps+runtime.diagnostics.rejectedSteps));
});
