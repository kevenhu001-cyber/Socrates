# Scientific simulation kernel upgrade

## Architecture

Keep one declaration-driven mathematics interpreter, one native renderer and one
cancellable shared Web Worker. Historical programs retain their original fixed-step
RK4 behavior. New nonstiff dynamics should select adaptive Dormand–Prince RK45;
the existing expression and operation budgets remain authoritative. No runtime
dependencies, generated executable code, server simulation process or new native
Android renderer are introduced.

## Implemented contracts

- RK45 with separate absolute/relative tolerances, accepted/rejected step control,
  cubic Hermite interpolation, 1–32 scalar states, up to 300 simulated seconds,
  maximum step up to one second, bounded attempts and event budget.
- Up to eight directed zero-crossing events, terminal events and simultaneous
  reset expressions. The renderer reads the post-event value at an event and does
  not interpolate the state through a reset. Events are detected by endpoint sign
  changes; tangencies and multiple crossings inside one step may be missed.
- Small linear algebra (dot products and two-/three-variable linear solves),
  nonsingular mass-matrix ODEs (up to eight state variables, rows/columns in
  initial state order), and regular coupled acceleration/multiplier equations.
- Method of lines: uniform 1D central differences for diffusion/reaction and
  damped wave equations with prescribed Dirichlet conditions. Boundary values
  should be compatible with initial data. Use 3–24 diffusion nodes or 3–18 wave
  nodes; spatial and temporal convergence are distinct. The grid is lowered to
  the same validated scalar dynamics, not a second runtime.
- History plots, event and playhead guides, calibrated heat colorbars, marching
  squares isolines, explicit vector magnitude scale, transparent invalid field
  samples. All scientific values come from the same mathematical state.

## Reference cases and checks

[Editable scientific programs](../examples/scientific-simulation.json) are ordinary
data, not registered scene IDs: RLC energy balance, lumped storage-cell thermal/SOC
balance, constrained pendulum with Baumgarte stabilization and residual display,
1D heat and wave modes, and a calibrated scalar field. The storage-cell case
uses a simplified OCV relation, constant resistance and thermal parameters;
it is not a validated electrochemical model.

Core JavaScript was executed directly from the development branch in an isolated
environment. The RC decay maximum sampled absolute error was 2.99e-6; a falling
impact reversed velocity; an 11-node heat mode differed from its analytical
amplitude by 0.00303; a 15-node wave mode at a theoretical zero differed by 0.00329.
The RLC final energy balance residual was 2.67e-7 J; the constrained pendulum's
maximum sampled squared-length residual was 1.93e-7 m². All six new examples
validated and integrated without runtime warnings; all fifteen existing example
programs validated. The repository includes numerical and UI regression tests,
including colorbar geometry, contour sampling and time-history event positions.

The full repository build, browser suite, provider generation and bundle/CPU
benchmarks are not verified locally (the environment could not resolve the
GitHub clone host). CI and actual visual inspection are required before merge.

## Deliberate limits / next steps

This is a bounded educational engine, not an industrial multiphysics solver.
No stiff BDF/Radau solver, singular DAE index reduction, general contact/friction
solver, arbitrary PDE or 2D/3D mesh, automatic SPICE netlist, automatic dimensional
analysis, or general vector/matrix expression values are claimed. Add these only
with explicit bounded protocols and analytic/conservation regression tests.
Prioritize a stiff solver, robust event rearming and simultaneous-event semantics,
matrix/vector state lowering, implicit finite-difference diffusion, engineering
diagram primitives and richer scientific plots. Benchmark on mobile with the same
error tolerance before introducing any WASM dependency.
