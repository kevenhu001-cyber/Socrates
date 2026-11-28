import { record, finite, range, located, at } from '../foundation.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';

// Analysis outputs share the ordinary scalar-view contract. FFT uses the
// already prepared trajectory; parameter sweeps compile an independent
// bounded model once and reuse it for each parameter value.
function scientificAnalysisSpec(program, validateSource) {
  const a = program.analysis;
  if (a === undefined) return null;
  const fail = (m) => {
    throw located('analysis', Error(m));
  };
  if (!record(a) || !['fft', 'eigen', 'sweep'].includes(a.kind))
    fail('Use fft, eigen or sweep analysis');
  const params = Array.isArray(program.parameters) ? program.parameters : [],
    d = program.dynamics;
  if (
    program.optimization !== undefined ||
    program.nonlinearSystem !== undefined ||
    program.sparseSystem !== undefined ||
    program.finiteElement !== undefined
  )
    fail('Analysis cannot be combined with a stationary solver');
  const names = new Set([
    ...params.map((p) => p?.id),
    ...Object.keys(program.definitions ?? {}),
    ...Object.keys(d?.initial ?? {}),
    ...Object.keys(d?.algebraic?.guess ?? {}),
  ]);
  let outputs, subprogram;
  const checkExpr = (expr, scope) => {
    try {
      expressionNames(parseDemonstrationExpression(expr), scope);
    } catch (e) {
      fail(String(e));
    }
  };
  if (a.kind === 'eigen') {
    if (d !== undefined || program.duration !== undefined) fail('Eigen analysis is stationary');
    const m = a.matrix,
      n = Array.isArray(m) ? m.length : 0;
    if (n < 1 || n > 8 || m.some((row) => !Array.isArray(row) || row.length !== n))
      fail('Use a real symmetric square matrix of size 1–8');
    for (const row of m) for (const v of row) checkExpr(v, new Set(params.map((p) => p?.id)));
    outputs = { eigenValue: '0*x', eigenResidual: 0, eigenOrthogonality: 0, eigenCount: 0 };
    for (let i = 1; i <= n; i++) outputs['eigenVector' + i] = '0*x';
  } else {
    // Validate source and underlying model without generated analysis outputs.
    // This also prevents hidden feedback into dynamics/definitions.
    subprogram = {
      ...program,
      analysis: undefined,
      linearAlgebra: undefined,
      views: [{ kind: 'metrics', values: [{ expression: a.expression }] }],
    };
    const result = validateSource(subprogram);
    if (!result.ok) fail('Invalid analysis source: ' + result.error);
    if (a.kind === 'fft') {
      const n = a.samples ?? 256,
        domain = a.timeRange;
      if (
        !Number.isInteger(n) ||
        n < 32 ||
        n > 2048 ||
        (n & (n - 1)) !== 0 ||
        !Array.isArray(domain) ||
        domain.length !== 2 ||
        !domain.every(finite) ||
        domain[0] < 0 ||
        domain[1] <= domain[0] ||
        domain[1] > 300 ||
        (d && domain[1] > d.duration)
      )
        fail(
          'FFT needs 32–2048 power-of-two samples and finite increasing timeRange inside the trajectory',
        );
      if (
        ![undefined, 'rectangular', 'hann'].includes(a.window) ||
        (a.removeMean !== undefined && typeof a.removeMean !== 'boolean')
      )
        fail('Use rectangular/hann window and boolean removeMean');
      if (a.lowpass !== undefined) checkExpr(a.lowpass, new Set(params.map((p) => p?.id)));
      outputs = {
        fftAmplitude: '0*x',
        fftPhase: '0*x',
        fftFrequencyStep: 0,
        fftPeakFrequency: 0,
        fftPeakAmplitude: 0,
        fftNyquist: 0,
        fftOriginal: '0*x',
        fftFiltered: '0*x',
      };
    } else {
      const p = params.find((p) => p.id === a.parameter),
        n = a.samples ?? 9,
        domain = a.range,
        time = a.time ?? d?.duration ?? 0;
      if (
        !p ||
        !Number.isInteger(n) ||
        n < 3 ||
        n > 17 ||
        !Array.isArray(domain) ||
        domain.length !== 2 ||
        !domain.every(finite) ||
        domain[0] >= domain[1] ||
        domain[0] < p.min ||
        domain[1] > p.max ||
        !finite(time) ||
        time < 0 ||
        time > (d?.duration ?? program.duration ?? 0)
      )
        fail(
          'Sweep needs a parameter, 3–17 samples, increasing in-range bounds and valid evaluation time',
        );
      if (
        d &&
        (n > 9 ||
          !record(d.initial) ||
          !record(d.derivatives) ||
          Object.keys(d.initial).length > 8 ||
          ![undefined, 'rk4', 'rk45'].includes(d.method) ||
          Math.ceil(d.duration / d.step) > 500 ||
          [
            'events',
            'massMatrix',
            'algebraic',
            'spatial',
            'coupledFields',
            'circuit',
            'stateSpace',
            'reactionNetwork',
          ].some((k) => d[k] !== undefined))
      )
        fail(
          'ODE sweep allows at most 9 runs, 8 explicit states, 500 nominal steps and no hybrid/specialized dynamics',
        );
      outputs = {
        sweepValue: '0*x',
        sweepSensitivity: '0*x',
        sweepMin: 0,
        sweepMax: 0,
        sweepMinAt: 0,
        sweepMaxAt: 0,
        sweepCount: 0,
      };
    }
  }
  if (Object.keys(outputs).some((id) => names.has(id))) fail('Analysis result identifiers collide');
  return { ...a, outputs, subprogram };
}
function lowerScientificAnalysis(
  program,
  validateSource,
  s = scientificAnalysisSpec(program, validateSource),
) {
  if (!s) return program;
  return { ...program, definitions: { ...program.definitions, ...s.outputs } };
}

export { scientificAnalysisSpec, lowerScientificAnalysis };
