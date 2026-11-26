import { integrateRK4 } from '../numerics/rk4.js';
import { integrateAdaptive } from '../numerics/adaptive.js';
import { integrateVerlet } from '../numerics/verlet.js';
import { integrateReactionSSA } from '../numerics/ssa.js';

const adaptive=c=>integrateAdaptive(c.dynamics,c.names,c.state,c.derivative,c.eventValue,c.eventReset,c.warnings,c.solver.reactionModel);
const integrators=Object.freeze({
  rk4:c=>integrateRK4(c.dynamics,c.names,c.state,c.derivative,c.warnings),
  rk45:adaptive,
  sdirk2:adaptive,
  verlet:c=>integrateVerlet(c.dynamics,c.solver.verletSpec,c.state,c.derivative,c.warnings),
  ssa:c=>integrateReactionSSA(c.solver.reactionSSA,c.dynamics,c.names,c.state,c.readRate,c.warnings),
});
export function selectIntegrator(dynamics,solver){
  const method=solver.verletSpec?'verlet':solver.reactionSSA?'ssa':dynamics.method??'rk4';
  if(!Object.hasOwn(integrators,method))throw Error('Unknown time integrator: '+method);
  return {method,integrate:integrators[method]};
}
