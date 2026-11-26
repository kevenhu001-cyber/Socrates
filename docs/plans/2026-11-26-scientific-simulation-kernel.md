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

## Stage seven: general equation solvers and coupled spatial fields

- Central lowering pipeline shared by validation and compilation; specialized
  dynamics forms are mutually exclusive, and solver metadata is prepared
  once from the same lowered model. No new runtime dependencies.
- Standalone square nonlinear residual systems (1–8 unknowns) via damped
  Newton, finite-difference Jacobian, scaled pivoting and bounded line
  search. Parameter-dependent guesses, absolute residual and iterations.
  Local root only; no global optimization or all-root guarantee.
- Nonsymmetric sparse CSR systems via Jacobi-preconditioned BiCGSTAB,
  full zero-based triplets, nonzero diagonal required. Existing PCG remains
  the default for upper-triangle SPD systems. Actual residual checked;
  explicit breakdown/nonconvergence. Neither convergence nor matrix
  definiteness is certified in advance.
- Multi-field reaction/diffusion on a cell-centred Cartesian grid: 1–4
  scalar fields, 3–257 cells in 1D or 3–33 cells per axis in 2D. Periodic
  or zero normal flux boundaries, conservative nearest-neighbor Laplacian,
  coupled local expressions and explicit Heun (order 2 in time for smooth
  solutions). Diffusion CFL <= 0.5, up to 2000 steps and 2 million stored
  scalar values. No general positivity, stiff-reaction stability,
  advection, arbitrary meshes or 3D PDE solver. Use convergence checks.
- Scalar analytic 3D volume slice maps at an x/y/z plane, with coordinate
  remapping, shared time/parameter controls, calibrated colors and contours.
  Not a volumetric simulation or full volume renderer.
- Instantaneous 2D streamlines by normalized midpoint stepping in display
  coordinates, up to 25 seeds and 80 steps per direction, bounded sampling,
  closed-loop/invalid/boundary termination. Not physical particle paths
  or speed inference. Existing arrows retained.
- Root residual and diffusion CFL added to opt-in numerical diagnostics.
- Six new general examples and targeted unit/E2E cases.

Direct verification: two-variable root (2,1) absolute residual 1.066e-14
in 5 iterations; 64-unknown nonsymmetric system relative residual
7.049e-11 in 17 iterations; 1D mean exchange amplitude error 2.273e-6
with conservation residual 2.221e-16; 25x25 2D two-field conservation
residual 1.666e-16. Extracted slice mapper verified physical x-plane
coordinate mapping and third-coordinate dependency; extracted streamline
sampler produced 25 horizontal lines, zero vertical deviation (2015
points). All 33 scientific and 15 historical programs validate and run
without warnings. Latest full CI/browser/device verification remains
pending; previous Agent, Security, Server and Image checks passed,
other lanes were cancelled when superseded. Earlier unrelated streaming
math failure is not claimed fixed.

## Stage eight: calculus, optimization and parametric geometry

- Bounded forward-mode scalar automatic differentiation for smooth explicit
  ASTs; diff(local, point, expression), with inline local-variable
  dependence. Unsupported/non-differentiable calls fail for user-facing
  diff. Standalone Newton uses AD Jacobian columns where supported and
  finite differences otherwise. This is not symbolic algebra, reverse AD
  or differentiation through arbitrary solver trajectories/definitions.
- integral(local, lower, upper, expression) uses 128-subinterval composite
  Simpson quadrature, including reversed bounds; finite smooth integrands
  only. No adaptive singular-integral guarantee.
- Standalone box-constrained smooth optimization, 1–8 unknowns, min/max,
  normalized variables, projected BFGS with backtracking and bounded
  iterations. AD gradient or finite-difference fallback; report actual
  objective, projected gradient, iteration/evaluation counts. Explicit
  failure on nonconvergence. Local stationary result only; not arbitrary
  constrained or global optimization.
- Parametric 3D surfaces with independent u/v bounds and physical x/y/z
  bounds, 17x17 or 33x33 sampled coordinate triples, wireframe/shaded
  camera renderer. Fixed painter order, invalid samples become gaps.
  Scalar field markers expose computed coordinates, useful for optimum
  or equilibrium points. No adaptive mesh, volume raycasting or GPU
  renderer.
- CSP-safe bounded arithmetic instruction tape for straight-line ASTs,
  reusable Float64 stack, no dynamic code generation, same per-node
  operation budget, reentrant fallback. Lazy branches and unsupported
  functions remain interpreted; bounded loop bodies can use the tape.
- Fixed incomplete streamed math copy source: preserve closed formula copy
  text, omit unstable raw copy source while the delimiter is open. This
  addresses the prior unrelated CI test failure without altering its assertion.

Direct checks: derivative matches analytic result exactly in tested case;
Simpson integral of sin over [0,pi] error 4.032e-9; Newton root residual
zero with 10 AD columns. Rosenbrock local optimum objective 1.050e-20
in 32 iterations; projected normalized gradient 5.262e-9, 66 AD columns;
boundary optimum reached. Parametric torus 1089 vertices, implicit
surface residual 5.274e-16. Arithmetic tape/interpreter identical on
1000 inputs; one isolated 50,000-evaluation microbenchmark 392 ms vs
199 ms (same operation count), not an application or device speed claim.
All 36 scientific plus 15 historical cases validated and executed without
warnings. Added unit and E2E regressions. Latest full CI/browser/device
verification pending.

## Stage nine: frequency, modal and parameter analysis

- A shared top-level analysis contract provides bounded scientific
  postprocessing with the same expression/view protocol. Analysis output
  names are validated against collisions; source models are separately
  validated without analysis outputs, preventing feedback into dynamics.
- Radix-2 FFT (32–2048 power-of-two samples), half-open uniform time
  windows, rectangular or periodic Hann windows, optional mean removal,
  coherent-gain-corrected one-sided amplitude and nearest-bin phase,
  bin spacing, Nyquist and peak readouts. Supports analytic signals and
  actual previously integrated state expressions. Optional ideal low-pass
  uses conjugate-symmetric DFT-bin truncation and inverse FFT on original
  samples: periodic, noncausal, offline, not a streaming filter or PSD.
- Real symmetric eigenanalysis (1–8 square matrix) by Jacobi rotations,
  sorted eigenvalues, normalized eigenvector components, scaled residual
  and orthogonality checks. Not a general complex/non-symmetric
  eigensolver; repeated eigenvalues have nonunique bases.
- One-parameter sweeps over the existing parameter range with independent
  model revisions; up to 17 analytic samples or 9 runs of an explicit
  RK4/RK45 ODE (8 states, 500 nominal steps, no events/DAEs/specialized
  dynamics). Reuses the compiled submodel; reports sampled extrema,
  response and finite-difference sensitivity. Not global optimization,
  arbitrary-dimensional sweeps or adjoint sensitivity.
- Explicit plot sample counts (2–2049 inclusive points), discrete points
  and baseline-clipped stem plots, preserving exact linear FFT bins.
- Corrected prior TypeScript variable shadowing in 3D surface renderer
  (the actual failing check on the eighth-stage head) and bounded clock
  rounding correction for tiny artificial terminal integration steps.
  No runtime dependency or native Android change.

Direct verification: two-tone FFT detects 5 Hz amplitude 2 and 19 Hz
amplitude 0.5, Hann peak normalization within floating-point roundoff;
ideal low-pass retains 5 Hz and removes 19 Hz. Integrated 3 Hz oscillator
has peak amplitude 0.9999998522 and exactly 400 accepted steps. Three
symmetric eigenvalues 0.5857864376, 2, 3.4142135624; scaled residual
4.441e-16 and orthogonality error 2.221e-16. Nine ODE sweep runs maximum
absolute error 4.046e-9 versus analytic decay; finite-difference
sensitivity at k=2 is -0.1367494359. Extracted stem path verified 129
stems / 258 arcs. All 40 scientific plus 15 historical examples validate
and execute without warnings. Added targeted unit and browser regression
cases; newest full CI and browser/device verification pending.

## Stage ten: geometric mechanics, finite elements, transport and implicit geometry

- Velocity Verlet for autonomous separable position/velocity systems,
  1–8 coordinate pairs, duration up to 300 and at most 10000 steps.
  Position-dependent accelerations only; symplectic for compatible
  conservative Hamiltonians, not arbitrary acceleration, damping,
  constraints or impacts. Fixed steps; linear display interpolation.
  A preallocated Float64 history stores at most 160016 scalar values.
  Corrected normalization that formerly clipped duration to 30.
- Stationary P1 Galerkin FEM for -(a u')' + c u = f in one dimension:
  3–257 strictly increasing, possibly nonuniform mesh nodes, positive
  diffusion and nonnegative reaction sampled by two-point Gauss
  quadrature, Dirichlet endpoints, tridiagonal elimination. Piecewise
  linear values and piecewise constant gradients, scaled assembled
  equation residual. Not general 2D/3D FEM or a PDE error certificate.
- Optional constant per-field advection in existing periodic coupled
  grids (one or two spatial axes), conservative first-order upwind
  fluxes and Heun time stepping. Combined transport/diffusion CFL
  <= 1; report both CFL diagnostics. No advection through no-flux
  boundaries, variable velocity, high-order limiter or stiff reaction
  stability guarantee. Upwind numerical diffusion remains.
- Scalar isosurface geometry by marching tetrahedra (11^3 preview,
  17^3 full sampled grids, at most 6000 triangles); consistent cube
  face diagonals, reject nonfinite cells and degenerate triangles,
  shared camera, wireframe or height-colored depth-sorted SVG.
  Not GPU volume rendering, adaptive mesh or a 3D PDE solver.
- Four new scientific examples, targeted numerical and browser
  regression tests. Fixed prior failing nonsymmetric-eigen negative
  test: use a 3x3 nonsymmetric input so existing 3-component plot
  validation does not fail before the intended matrix symmetry check.

Direct verification: 100 time units/5000 Verlet steps, maximum
oscillator energy error 5.0e-5 with energy 0.5, 5001 derivative
evaluations and 80016 bytes of raw typed history. 65-node FEM
Poisson test nodal error 2.387e-15, scaled residual 5.551e-17.
Positive/negative periodic transport preserve mean 1 within 2.221e-16
at CFL 0.16 (peak attenuated from 1.5 to 1.46236, numerical diffusion).
Sphere isosurface full sampling 4992 triangles, squared-radius residual
<=0.01674 at triangle vertices; preview 1992 triangles and residual
<=0.04319. All 44 scientific and 15 historical examples validate and
execute without warnings. Previous Agent, Server, Security, Image and
Android workflows passed; frontend CI failed the negative test fixture
described above, now corrected and directly checked. Latest complete
CI/browser/device verification pending. No new runtime dependencies.

## Stage eleven: modular core and shared compilation

The stable package subpath @socrates/core/demonstration and its existing
named exports, public types, DSL and Worker wire protocol are unchanged.
The original 3675-line implementation is now a seven-line compatibility
facade. Implementation is in packages/core/src/simulation/:

- foundation.js: shared limits, validation primitives and errors.
- expression/: functions, parser/normalization, evaluator/AD/tape.
- compiler/: normalization, shape checks and semantic compilation.
- models/: spatial method-of-lines, reaction networks, electrical and
  state-space lowering, structured algebra.
- numerics/: dense/sparse solvers, nonlinear and optimization, implicit
  and coupled grids, FFT/eigen/sweep analysis, adaptive/Verlet ODE and FEM.
- runtime/prepare.js: model-independent preparation, evaluation, trajectory
  lookup and result dispatch (remaining solver-specific dispatch to refactor).

22 internal modules; no circular imports in the extracted module graph.
Analysis receives validation and compilation callbacks rather than
importing its caller, preventing a compiler/analysis cycle. No new runtime
dependencies and no native Android modifications. No claim of lower
bundled size: imports remain static at this stage.

Compilation now shares inspectProgram's normalized, lowered, validated
program and reuses validated ASTs with type-preserving cache keys.
One top-level lowering pipeline per compile, not validate-then-lower again.
Solver spec validation and some specialized analysis source validations
remain and should be consolidated separately; do not remove safety checks.
Compiled factories keep parameter-specific runtime results isolated.

Direct migration check compared pre-split and extracted implementations
on all 59 fixtures, 738 expression observations plus states, diagnostics,
duration and warnings. After shared compilation, 118 runtime preparations
(two value revisions per fixture), 1476 expression observations, and
invalid AST key rejection match the previous engine. This is isolated
JS numerical verification, not complete browser/build verification.
Added unit regressions for acyclic module imports, public facade and
compiled-factory revision isolation. Full latest CI pending.

Next: separate semantic validation from execution and pure numerics from
model-specific adapters; consolidate spec construction and dispatch;
split 2D sampling and 3D geometry; measure actual bundle/device baselines
before introducing dynamic imports; modularize model-facing contracts.
Do not add new solvers during the equivalence migration.

## Stage twelve: separate validation, model adapters and execution

- Split the validator, lowering registry and runtime compiler. An ordered
  registry builds and passes one specialized spec per lowering stage.
  Nested source programs (FFT/sweep) still undergo their independent safety
  validation. Existing public API and DSL stay unchanged.
- Eight specialized adapters now reside in models/ (analysis, finite
  element, Verlet, optimization, nonlinear, sparse, coupled and implicit
  grids). Their numerical implementations remain in numerics/. Gillespie
  SSA execution is separate from reaction network lowering. Removed all
  interim adapter re-exports from numerical modules.
- intelligentUiValidation directly imports the validator; its dependency
  graph is intended to exclude runtime and execution algorithms other than
  small dense algebra used by expression functions. The full public
  facade still uses static imports; dynamic loading/bundle measurement
  remain future work.
- Runtime preparation shrank from 318 to 118 lines. Common result store
  registers named output readers and optional indexed sparse reader;
  stationary/spatial solvers and post-analysis adapters register their
  outputs and diagnostics without solver-specific names in prepare.js.
  Duplicate provider names are rejected. Runtime instances own all readers
  and caches. Spatial and ODE trajectories expose duration, stateAt,
  eventTimes and diagnostics.
- Extract index-one algebraic consistency and dynamics orchestration.
  RK4 is an independent generator; time integrator registry dispatches
  RK4, RK45, SDIRK2, Verlet and SSA, preserving method-specific semantics.
- Extend architecture tests to check import/re-export DAG, validation-only
  dependency reachability and numerical-to-model boundary. No new
  runtime dependencies, public protocol changes or Android changes.

Numerical parity: isolated JS comparisons of the extracted model and
runtime bodies against the stage-ten baseline ran all 59 programs at
default and a second parameter setting (118 runtime preparations,
1476 expression observations). Duration, warnings, event times,
diagnostics and sampled states matched exactly. This is a direct
equivalence check, not a full module/bundler or browser CI run.
Full latest CI and actual bundle/device performance remain unverified.

Next: split scalar/vector sampling, 3D mesh geometry, renderer and
interaction modules; then measure actual bundles and evaluate on-demand
loading. Keep the generator-based Worker scheduler and wire format.

## Stage thirteen: scientific visualization boundaries

- Extract shared field dimensions, dependency expressions and settings.
- Split planar scalar sampling, vector/streamline sampling, contours and
  physical slice mapping. Keep sampleField as a 60-line coordinator
  (previously 542 lines).
- Separate 3D sampled surface/curve/vector geometry, scalar volume
  evaluation and marching tetrahedra extraction. The extraction accepts
  independent bounded cubic sample buffers and finite levels, preserves
  the 6000-triangle cap and cooperative yields.
- Extract pure 3D projection, mesh face sorting, curve/arrow/wireframe
  paths and 2D plot projection/path generation. No React or numerical
  runtime dependencies in the geometry projection modules.
- Move planar canvas painting, camera controls/state and playback/preview
  state into their own modules. Preserve the current SVG/Canvas appearance,
  Worker messages, geometry format, pixel buffers and accessibility labels.
  No WebGL or dynamic imports introduced during this equivalence migration.
- 14 new visualization modules. Existing component-facing interfaces
  remain compatible. No new runtime packages or native Android changes.

Direct equivalence checks against pre-split implementation:
14 planar/3D sample cases including preview/full quality (identical
pixel bytes, geometry, streamlines, contours, markers and yield counts);
24 camera projection configurations (identical face order, coordinates,
wireframe/curve/arrow paths); 10 linear/log plot path configurations;
35 Canvas draw operations with an instrumented mock context (identical).
The checks execute extracted TypeScript numerical/drawing bodies with
type annotations stripped and a mock runtime/context where needed;
they are not an end-to-end TypeScript build or browser visual comparison.
Added standalone mesh bounds, projection immutability and plot geometry
regression tests. Previous Server/Security/Agent/Image/Android workflows
passed; previous full CI cancelled by superseding commits. Latest full
CI and actual device/rendering benchmarks remain pending.

Next: capture bundle size and representative preview/full sample/render
timings, then introduce feature-specific asynchronous loading while
preserving synchronous core APIs and cooperative cancellation. Split
AI-facing contracts by capability after establishing request-size
baselines. Do not infer bundle savings from source-file line counts.

## Stage fourteen: feature-driven loading and performance instrumentation

- Preserve the synchronous public demonstration API. Extract a lightweight
  validation/expression/domain entry and an asynchronous compilation entry.
  Both use the same validated compilation plan, AST/dependency caches and
  generator runtime. Inject numerical functions into result providers and
  integrator dispatch; the common runtime statically imports no advanced
  numerical execution modules.
- Async compilation selects from eleven literal dynamic imports based on
  validated model metadata. Analytic-only programs need none; RK4, adaptive
  RK45/SDIRK2, Verlet, SSA, sparse, nonlinear, optimization, grids, FEM
  and analysis are individually selectable groups. FFT/eigen/sweep share
  the analysis chunk; sweep source is independently compiled before
  generator execution. ES module imports cache their loaded implementations.
- Worker waits for compilation and the required planar/spatial sampling
  modules outside its cooperative generator queue. A per-card pending
  promise deduplicates loads. Job/card identity checks suppress stale
  completion or failure after cancellation, replacement or close; an
  already-started module import itself is not abortable. Successful
  compilation is reused for subsequent parameter revisions. Keep wire
  protocol, generator fairness, pixel transfers and preview scheduling.
- Planar and spatial sampling have separate dynamic entry points; 3D
  React rendering uses lazy/Suspense and the existing loading skeleton.
  Common error and domain helpers no longer pull sampling or sync
  execution modules into the UI or Worker. The synchronous field sampler
  remains available for existing callers and tests.
- Vite Worker output uses ESM to support code splitting. A Worker bundle
  plugin walks the actual static chunk closure and rejects advanced
  execution/field sampling modules in it, logging eager/lazy gzip bytes.
  It does not claim a byte reduction until a real build runs.
- Fresh Node process benchmark: from frontend, run
  npm run benchmark:simulation -- 5
  to report median import, compilation, first and warm preparation,
  first-ready time, heap use and yields for analytic, adaptive/FFT,
  sparse, FEM and Verlet cases. No new runtime dependencies or native
  Android code changes.

Direct comparison of extracted synchronous/asynchronous orchestration
against stage-ten numerical bodies: 59 fixtures, 118 parameter
configurations, 2952 expression observations across the two paths;
states, event times, durations, warnings and diagnostics match. Loader
selection instrumented with mock import resolution: 20 of 59 require
no numerical execution algorithm; remaining cases request only their
selected groups (including nested sweep preparation). This was not an
actual browser network or bundle test. Added real-module async parity
and selection tests for CI. Previous head Security, Server, Agent,
Image and Native Android passed; previous full CI cancelled by new
commits. Latest actual build, gzip sizes, benchmark output and device
performance remain unverified.

Next: modularize model-facing tool contracts, reduce schema/prompt
payloads with capability-specific retrieval, then complete actual CI,
bundle and browser/device performance acceptance before merge.

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
