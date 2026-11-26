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
  not interpolate the state through a reset. Events are detected using endpoint and midpoint sign changes. Simultaneous
  disjoint resets use the same prior state; conflicting resets fail explicitly.
  Tangencies and multiple crossings inside a half-step may still be missed.
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

## Follow-up: stiff integration, 2D diffusion, electrical networks and plots

- L-stable SDIRK2 (order 2, step doubling, numerical Jacobian and bounded Newton
  iterations) for up to eight stiff ODE states. No BDF/Radau or singular DAE.
- Rectangular 2D diffusion on 3–7 nodes per axis with common prescribed
  Dirichlet boundary, central differences and bilinear field reconstruction.
  A coarse educational grid, not arbitrary 2D meshing.
- Linear circuit compiler: R/L/C and independent ideal voltage/current sources
  become MNA equations, capacitor-voltage and inductor-current states, nodal
  voltages and branch currents. At most six MNA unknowns; no nonlinear devices,
  arbitrary topologies with singular constraints, or time-varying C/L. The
  existing expression, definition and operation limits also apply.
- Bounded general scalar-component linear solves up to 6x6, cross products,
  physical logarithmic axes (not mislabeled log-frequency coordinates), and
  spatial cross-section plots with declared y coordinate.
- Fixed a pre-existing 22px icon sizing lint blocker by using the existing
  approved 20px size. No relaxation of the CI rule.

Direct numerical checks on the updated core: forced stiff scalar endpoint
absolute error 9.98e-7, mixed 10,000:1 decay slow-mode endpoint error 2.95e-5
and fast-mode magnitude below 1e-60; 7x7 2D heat mode amplitude error 0.00605;
RC netlist error 1.28e-10 V at 2 s, series RLC error 7.56e-13 V at 2 s;
sampled KCL residual 0 in both circuits. Ten current scientific examples
validated and ran without warnings; fifteen historical examples validated
and executed. Added frontend unit and browser tests. Latest full CI and
visual checks still require verification.

## Stage three: scientific surfaces, engineering diagrams and structured equations

- Rotatable scalar height surfaces with 17x17 preview or 33x33 full mesh,
  explicit x/y/z bounds, local camera controls and no raster allocation for
  the surface. Mesh values come from the same Worker as the other views.
  Nonfinite/out-of-range samples are gaps, not invented geometry. The
  normalized axes are labeled with their ranges; this is not a 3D volume solver.
- Mechanical and electrical scene symbols: resistor, capacitor, inductor,
  voltage/current source, pin/roller, ground and dimension annotations.
  All use existing scene endpoints and may reference live simulation quantities.
  Diagram geometry is explicitly authored; circuit topology is not auto-laid out.
- Structured A/B/C/D state-space matrices, lowered to the shared scalar
  expressions. Up to 16 differential states (8 with SDIRK2), four inputs
  and eight outputs; coefficients may depend on time and parameters.
- Small semi-explicit index-one DAEs: 1–4 algebraic unknowns, parameter-only
  guesses, damped finite-difference Newton solve at every derivative/event
  evaluation and reconstructed output time. Requires a regular algebraic
  Jacobian and a consistent branch near the guess. No high-index reduction.
- Deleted an unused web-only window dimensions adapter identified by CI
  without changing the orphan-module guard or native Android code.

Direct core checks: state-space critically damped step error 7.56e-13 at 2 s;
nonlinear index-one test q'=-aux, aux²=q, q(0)=1 yields q(1)=0.250000000019,
aux(1)=0.500000000019; sampled algebraic residual 2.22e-16. All 13 scientific
examples validate and execute without integration warnings. Added numerical,
mesh and browser rotation tests; actual browser and newest CI remain unverified.

## Stage four: implicit grids, structured algebra and quantitative surfaces

- Dedicated matrix-free diffusion solver, selected with method grid-implicit,
  for 3–257 1D nodes or 3–65 nodes per axis in 2D. Constant diffusivity,
  fixed Dirichlet boundaries and stationary source; parameter-dependent
  coefficients and coordinate-dependent data are allowed. Uses prefactored
  tridiagonal backward Euler in 1D and first-order split backward Euler in 2D.
  Per-step work is O(grid cells); no dense spatial matrix or scalar state
  expansion. Typed-array history is capped at 2,000,000 values (16 MB of
  Float64 sample data, excluding metadata and work arrays), 2000 steps;
  fixed step, not adaptive error control. gridValue interpolates spatially and
  temporally, gridMean is the arithmetic nodal mean, not a quadrature integral.
- Ordered, shape-checked vector/matrix operations (literal, add/subtract,
  scale, dot, norm, cross, transpose, matrix multiplication); scalar component
  aliases compile into the same bounded expression evaluator. Dimensions
  up to six, 24 generated and ordinary definitions combined. Not a generic
  tensor runtime or sparse arbitrary-matrix package.
- Optional shaded 3D scalar surface with depth-sorted finite mesh faces and
  height-calibrated color legend; local rotation reuses Worker samples.
  Existing wireframe remains the default.
- Event rearming deadband after reset (default 1e-9 residual units);
  bounded midpoint/endpoint sign detection still cannot detect every tangency
  or crossing. No general unilateral contact solver.
- Fixed two legacy tool-source buttons by using shared surface primitives,
  rather than relaxing the button-primitive CI guard.

Direct execution: 65x65 heat mode absolute amplitude error 1.846e-4 at t=.2
(dt=.001); 257-node 1D mode error 9.104e-4 at t=1 (dt=.005); stationary 129-node
linear temperature profile error 1.14e-13. Matrix rotation preserves norm 5
and gives orthogonal dot product 0 for a quarter turn. Rearming test produced
one event, final position error 1.68e-10. All 15 scientific and 15 historical
programs validated and executed without warnings. Added core and browser
regression tests; latest full CI and real-browser visual/performance
verification remain pending. No claim of measured mobile speedup.

## Stage five: general SPD sparse systems, spatial plots and diagnostics

- Standalone stationary sparse linear systems: zero-based upper-triangle
  triplets, explicit diagonal and parameter-only expressions, CSR storage
  and Jacobi-preconditioned CG. Up to 1024 unknowns, 8192 input entries,
  1024 iterations, 8M estimated sparse-entry operations, subject to the
  existing 40KB program cap. Recomputed relative residual on convergence;
  detected nonpositive curvature and nonconvergence fail explicitly.
  SPD is a model precondition, not certified by the solver. sparseAt(i)
  reads a component, sparseValue interpolates by x, and sparseResidual /
  sparseIterations expose numerical results. No nonsymmetric solver or
  sparse time-varying DAE is implied.
- Parametric 3D curves (481 full points, 121 preview), simulation-history
  trajectories, and spatial vector fields (7^3 full or 4^3 preview samples).
  The third spatial coordinate spaceZ is reserved only for programs with
  a 3D vector view. Cache dependency mask 8 and coordinate invalidation
  keep samples distinct. Reuse the existing camera renderer; out-of-range
  curve samples are gaps, arrows have normalized display length and
  magnitude reference, not physical scale. This is sampled visualization,
  not a 3D PDE/volume solver.
- Opt-in collapsed solver diagnostics carried through Worker frames:
  accepted/rejected steps, derivative evaluations, event counts, normalized
  accepted local error, min/max step; implicit-grid node/history counts;
  CG iterations, nonzeros, relative residual. No inferred global error or
  fabricated benchmark. Fixed roundoff-only terminal integration steps.
- Camera controls use existing Label and NativeControl primitives, resolving
  the preceding shadcn-adoption lint failure without loosening rules.

Direct core verification: 128-unknown SPD chain maximum component error
2.695e-10, relative residual 6.407e-11 in 17 iterations. 1024-diagonal
system solved in one iteration with zero residual. An indefinite example
with negative curvature was rejected. Six-second integrated helix radial
invariant error 1.039e-9, exactly 120 accepted steps at .05 s. Spatial
sampler executed after removing TypeScript annotations: 342 nonzero
vectors on the 343-point grid; 481 helix samples with endpoint error near
machine precision. All 19 scientific examples and 15 historical examples
validated and executed without runtime warnings. Added unit and E2E cases;
full CI, browser visual testing and real device performance remain pending.

## Stage six: chemistry and biology

- Stoichiometric reaction-network compiler: 1–16 species (8 for SDIRK2),
  1–16 reaction channels, integer stoichiometry, mass-action rate constants
  or custom nonnegative flux expressions. Fixed-volume, consistent
  concentration/amount units. Reverse reactions are separate channels.
  Optional elemental composition on every species checks reaction balance
  and generates total_<element> conserved quantities; rate_<id> exposes
  flux. With no composition, open source/sink channels are supported.
  Accepted negative states below -atol are rejected, small negative
  numerical undershoots are clamped; interpolated concentrations are
  nonnegative. This is not an exactly positivity-preserving or
  conservation-projection integrator.
- Gillespie direct SSA for stationary mass-action molecule-count models,
  seeded reproducibility, nonnegative integer counts, propensity
  k*product(binomial(count,stoichiometry)), up to 10,000 reactions and
  1e8 counts per species. Discrete state history is piecewise constant;
  optional sampled staircase plot is not an exact event raster. A single
  stochastic realization is not an ensemble mean.
- Chemical/biological scene primitives: atom symbols, single/double/triple
  bonds, reaction and reversible arrows, inhibition and schematic
  eukaryotic cell icons. Explicitly authored coordinates, not automatic
  molecular structure, force fields, chemical identity or cell morphology.
- Eight additional cases: reversible reaction, explicit enzyme binding and
  catalysis, stochastic birth/death expression, logistic population growth,
  predator/prey phase plane, compartment exchange, water/carbon dioxide
  diagrams and ideal Henderson–Hasselbalch buffer curve.
- Corrected the prior surface test to match existing numeric-range
  normalization (reversed bounds are sorted, malformed length rejected).
  Previous CI passed Security, Server, Image, Android and Agent lanes.
  Frontend unit lane failed the range assertion and an unrelated
  streamingMath test unchanged on main. No CI guard relaxed.

Direct checks: reversible concentration error 2.686e-10 at t=2;
declared carbon-equivalent conservation exactly 1 in that check; unbalanced
reaction rejected. Enzyme and substrate pool maximum sampled residual
1.999e-15 over 101 times. Seeded SSA test gave reproducible integer counts
and 149 events over 20 s; 27 scientific and 15 historical examples validate
and execute without warnings. Added unit and browser regressions. Browser
rendering and newest full CI remain unverified. No added runtime dependencies.

## Deliberate limits / next steps

This is a bounded educational engine, not an industrial multiphysics solver.
No BDF/Radau solver, general high-index DAE reduction, contact/friction
solver, arbitrary PDE or unstructured 2D/3D mesh, nonlinear SPICE-compatible netlist,
automatic dimensional analysis, or general vector/matrix expression values are claimed. Add these only
with explicit bounded protocols and analytic/conservation regression tests.
Prioritize nonsymmetric sparse systems, adaptive spatial/time error control,
volume slices, high-index constraint projection, nonlinear circuit devices,
and real-device benchmarks. Do not merge before CI/browser verification. Benchmark on mobile with the same
error tolerance before introducing any WASM dependency.
