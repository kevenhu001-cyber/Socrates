const adaptive = (c) =>
  c.algorithms.integrateAdaptive(
    c.dynamics,
    c.names,
    c.state,
    c.derivative,
    c.eventValue,
    c.eventReset,
    c.warnings,
    c.solver.reactionModel,
  );
const integrators = Object.freeze({
  rk4: (c) => c.algorithms.integrateRK4(c.dynamics, c.names, c.state, c.derivative, c.warnings),
  rk45: adaptive,
  sdirk2: adaptive,
  verlet: (c) =>
    c.algorithms.integrateVerlet(
      c.dynamics,
      c.solver.verletSpec,
      c.state,
      c.derivative,
      c.warnings,
    ),
  ssa: (c) =>
    c.algorithms.integrateReactionSSA(
      c.solver.reactionSSA,
      c.dynamics,
      c.names,
      c.state,
      c.readRate,
      c.warnings,
    ),
});
export function selectIntegrator(dynamics, solver, algorithms) {
  const method = solver.verletSpec
    ? 'verlet'
    : solver.reactionSSA
      ? 'ssa'
      : (dynamics.method ?? 'rk4');
  if (!Object.hasOwn(integrators, method)) throw Error('Unknown time integrator: ' + method);
  return { method, integrate: (context) => integrators[method]({ ...context, algorithms }) };
}
