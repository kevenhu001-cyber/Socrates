import { PHYSICS_EXAMPLES, PHYSICS_EXAMPLE_ASSUMPTIONS } from '@socrates/core/physicsExamples';

/** App-owned mathematical runtime; models author algorithms and composition, not executable JS. */
export const DEMONSTRATION_GUIDANCE = `Build a new algorithmic demonstration without choosing a preset physics model. Arguments are JSON, not markup: every list is a JSON array, every numeric field is a JSON number, and program.version is the number 1. Never encode a list as {"item": [...]}, never wrap an array in tags, and never send "1" where a number belongs.

A demonstration node is {"id":"demo","type":"demonstration","title":"...","program":{"version":1,"parameters":[],"definitions":{},"views":[]}}. views has 1-8 entries. Required per view: plot -> x, y and 1-6 curves; field -> x, y and expression; trajectory -> x, y, horizontal, vertical and program.dynamics; scene -> x, y and 1-32 objects; metrics -> 1-6 values; controls -> nothing. At most one controls, two field views and twelve curves total. The schema marks per-kind fields optional because JSON Schema cannot express the condition; validation still requires them. Fix every field named in an error in one corrected call.

All views share parameters, definitions, time t and optional ODE state. To drive an existing demonstration from the conversation, patch its program with changed parameter value fields: edited defaults apply immediately while unrelated manual control values survive. Set or change the optional resetKey string to restore all declared defaults, including a value equal to a previous default. This is the preferred route for novel mathematical/physical demonstrations and custom compositions.

Parameters: up to 12 entries with id, label, value, min, max and optional step, unit, advanced. IDs are ASCII identifiers, never x,y,t,pi,e or function names, and expressions must use exactly the same spelling (names are case-sensitive). min < max and value lies inside [min,max]. Definitions: up to 24 name:expression entries, where an expression is a number or mathematical string. Definitions can use each other in any order (no cycles), parameters, x,y,t and ODE states. They are reevaluated at the current sample coordinates/time, so refer to a definition by its name (f, not f(x)). Operators + - * / % ^ < > <= >= == != && || and condition ? yes : no; write powers as x^2, multiplication as * (2*x; 2x is also read as 2*x), pi for π. Angles are radians; convert degrees with deg*pi/180. Functions sin cos tan asin acos atan atan2 sqrt abs exp log (natural; ln is accepted) log10 pow min max floor ceil round sign hypot sinh cosh tanh expm1 log1p heaviside (1 for nonnegative arguments), dot2(a,b,c,d)=a*c+b*d, dot3(a,b,c,d,e,f)=a*d+b*e+c*f, solve2(i,a,b,c,d,r,s) returns component i (1 or 2) of the linear system with rows [a,b], [c,d] and RHS [r,s] (singular systems return nonfinite), solve3(i,a11,a12,a13,a21,a22,a23,a31,a32,a33,b1,b2,b3) returns the requested component of a 3x3 solve; solveN(i,n,...n*n row-major coefficients,...n RHS) for 1–6 variables; cross3(i,a,b,c,d,e,f) returns cross-product component i; clamp(v,min,max), sinc(z)=sin(z)/z with limit 1, sinratio(n,z)=sin(n*z)/(n*sin(z)) with removable singularities filled for integer n, besselJ1(z), airy(u)=[2J1(u)/u]^2 with limit 1. sum(i,first,last,expression) sums at most 1000 integer-indexed terms; iterate(v,initial,count,expression) applies a scalar recurrence at most 1000 times. if(condition,yes,no) is lazy. Use mathematical expressions, not JavaScript syntax; no Math. prefixes, property access, code, callbacks, imports, HTML or shaders. A sample that divides by zero or leaves a function's domain is drawn as a gap rather than failing the view, but keep the plotted range where the model is defined. Express new algorithms through definitions, sums, recurrences and ODEs. Each expression is ≤1600 characters and the entire program ≤40000.
Dynamics, optional: {"initial":{"X":1,"Y":1,"Z":1},"derivatives":{"X":"sigma*(X-Y)","Y":"X*(rho-Z)-Y","Z":"X*Y-beta*Z"},"duration":20,"step":0.01}. Initial values are numbers/parameter expressions; derivatives can use all current states, definitions and parameters. State IDs cannot collide with parameters/definitions/x/y/t. Prefer method "rk45" for new dynamics: up to 32 scalar states, duration ≤300 seconds, step is maximum step (1e-6 to 1 s; duration/step ≤10000), rtol/atol optional (1e-10 to 0.01; defaults 1e-6 and 1e-9). Existing programs without method keep fixed RK4 (6 states, 30 s, 0.002–0.05 s). Adaptive integration is limited to 10000 attempts and a finite operation budget. RK45 is for nonstiff systems. For small stiff ODEs choose method "sdirk2": L-stable two-stage implicit order-2 solver, step-doubling error estimate, up to 8 states; bounded numerical Newton iterations may fail for difficult nonlinear problems. Not BDF/Radau or a general DAE solver. Optional events (up to 8) detect sign crossings of expression, direction -1 falling, 0 either, 1 rising. Each has terminal:true or a reset map of state expressions evaluated simultaneously at the event; use explicit reset coordinates and avoid immediate retriggering. After a reset, an event rearms only when its residual leaves rearmTolerance (default 1e-9 in residual units); scale this deadband to the physical event. At most 128 events, endpoint and midpoint sign detection can still miss crossings; simultaneous events use disjoint reset maps evaluated from the same pre-event state; choose a smaller maximum step for switching. For scheduled transitions use an explicit clock surface, not boolean conditions. No implicit contact solver. For one-dimensional diffusion/reaction u_t=diffusivity*u_xx+source, use dynamics.method='rk45' and spatial:{nodes:11,domain:[0,1],diffusivity:0.1,initial:'sin(pi*x)',left:0,right:0}; omit initial/derivatives maps. 3–24 equally spaced nodes, fixed numeric domain, prescribed Dirichlet boundaries (parameters/time), initial profile in x, diffusivity/source in x,t,u and parameters; positive diffusivity, explicit multiplication. Read gridValue in a spatial plot or field, and grid1..gridNminus2 for nodal metrics. The grid names are reserved for this model. Explicit RK45 is not a stiff PDE solver; pick adequate time and spatial resolution and compare a refinement when needed. For rectangular 2D diffusion use spatial:{dimension:2,nx:7,ny:7,xDomain:[0,1],yDomain:[0,1],diffusivity:0.1,initial:'sin(pi*x)*sin(pi*y)',boundary:0}; nx,ny 3–7; common prescribed boundary expression in x,y,t, initial in x,y, diffusivity/source in x,y,t,u; gridValue is bilinearly interpolated. Use a field with calibrated colorRange and contours. For higher resolution linear diffusion choose dynamics.method:'grid-implicit' with the same spatial structure: 3–257 nodes in 1D or 3–65 per axis in 2D. Constant diffusivity (parameter-only), time-independent initial/source/boundary expressions in coordinates and parameters; no u or t, events, other dynamics or adaptive tolerances. Fixed time step with split backward Euler and tridiagonal solves, at most 2000 steps and 2,000,000 total stored values including initial frame. gridValue interpolates the field, gridMean is the arithmetic mean of mesh nodes (not an area-weighted integral). Use time/grid refinement for accuracy. This is rectangular linear diffusion, not FEM/CFD. For wave motion u_tt=c^2*u_xx-damping*u_t+source, use spatial.equation='wave', speed, initialVelocity, optional damping>=0 instead of diffusivity; 3–18 nodes, fixed Dirichlet boundaries. For implicit but nonsingular mass-matrix ODEs use dynamics.massMatrix (1–8 square rows of expressions) with derivatives as RHS, ordered by the initial map's state keys. For constrained mechanics derive reduced ODEs or use solve2/solve3 for the augmented acceleration/multiplier linear equations and monitor the constraint residual; For small semi-explicit index-one DAEs, dynamics.algebraic:{guess:{aux:1},residuals:{aux:'aux^2-q'},tolerance:1e-8} solves g(t,state,aux)=0 by damped Newton, then evaluates state derivatives and plots using the consistent algebraic solution. 1–4 variables; guesses are parameter-only, residuals are evaluated at x=y=0, scale residuals to meaningful dimensionless magnitudes. Locally nonsingular algebraic Jacobian and a consistent root near the guess are required; do not claim automatic index reduction, arbitrary singular mass matrices or constraint projection. For linear control systems use dynamics.stateSpace:{states:['q','v'],initial:[0,0],A:[[0,1],[-4,-2]],B:[[0],[4]],inputs:[1],C:[[1,0]],D:[[0]],outputs:['response']}, method rk45 or sdirk2; coefficients and inputs may depend on parameters and time only. Up to 16 states (8 stiff), four inputs and eight outputs. State and output names work in all views. Do not mix with explicit initial/derivatives, circuit, massMatrix or spatial models. For linear electrical networks, dynamics.circuit:{nodes:['in','out'],elements:[{kind:'V',id:'src',p:'in',n:'0',value:5},{kind:'R',id:'r',p:'in',n:'out',value:2},{kind:'C',id:'c',p:'out',n:'0',value:0.5,initial:0}]} lowers R/L/C and ideal independent V/I sources by modified nodal analysis; omit initial/derivatives/spatial/massMatrix. Ground is '0'. 1–5 non-ground nodes, 1–10 elements, at most six MNA unknowns (nodes plus V and C branches), at least one C/L. Voltages voltage_<node>, branch currents current_<element> positive p-to-n, capacitor voltage and inductor current mnaState_<element>. SI units, C/L constant for a run, sources may be time functions, positive passive values. Initial capacitor voltage and inductor current must be consistent with ideal constraints. Floating nodes, singular ideal-source loops and nonlinear semiconductor devices are not supported. For other electrical/energy models compose averaged converters, swing equations, thermal diffusion and energy balances with state equations; validate units and power/energy conservation. A program may instead specify duration for algebraic time animation without dynamics. Numeric dynamics may diverge; the app then keeps the history up to that time and stops there, so choose sensible steps/ranges and keep physical assumptions in prose.
Display labels and units use inline LaTeX for formulas and symbols. In JSON use dollar delimiters and escape each backslash, for example {"xLabel":"$t\\\\,(\\\\mathrm{s})$","yLabel":"$I/I_0$","unit":"$\\\\theta_R$"}. Keep expressions in the executable mathematical syntax above.
Views are ordered freely (1–8). Every view has "kind" (not "type"). Axis bounds are a two-element JSON array [min,max] of finite numbers or expressions evaluated at the current time with x=y=0; use parameter-dependent bounds to keep important features visible, for example "y":[0,"max(1.12,1.12*total)"]. Bounds must remain finite, increasing and within ±1e6:

- controls: places the compact shared parameter sliders here. At most one; without it controls follow the views. Advanced parameters are disclosed separately. No tool or model selector is shown to the learner.
- plot: sliceY sets the fixed spatial y coordinate when plotting a 2D field cross section; absent means y=0. It is incompatible with history. xScale/yScale may be 'linear' (default) or 'log' with strictly positive bounds and actual physical axis values; use xScale:'log' for Bode plots, with expressions evaluated at frequency x, not log(x). set history:true for multiple time histories, with x bounds in seconds and curves evaluated at each sample time up to current playback time (not at a frozen state); requires dynamics. Otherwise it samples the spatial x axis. Needs x, y and 1–6 curves of {expression, label?, color?, dashed?}, plus optional markers of {x, y, label?, color?}. It evaluates curves over x at current t with y=0. Up to 6 curves/view and 12 total. Colors: ink, muted, blue, orange, red, green, violet. Use multiple labeled curves, dashed envelopes, calibrated axes and markers when they clarify the phenomenon.
- field: needs x, y and expression, with optional palette (light, signed or heat), tint (three 0–1 channels), gamma, exposure, height (64–320) and vector (two expressions). It computes pixels locally. At most 2 field views. The light palette maps nonnegative physical intensity with separate display gamma/exposure; the signed palette distinguishes positive/negative fields; the optional vector pair overlays direction arrows. Optional colorRange:[min,max] with palette heat calibrates the colorbar in physical units (unit text), overriding exposure. Optional contours:[levels] (1–6) overlays numerical isolines; vectorScale sets the magnitude represented by a full arrow (otherwise direction only). The field is 320 units wide; height 64–96 makes a compact intensity strip and 160 suits a 2:1 2D field. Match height to 320 times the y-span/x-span for geometrically faithful 2D fields. Never substitute circles or searched pictures for a calculated field.
- trajectory: needs x, y, horizontal and vertical, with optional color and labels. It draws the ODE history up to current t with a moving endpoint and requires dynamics. Use a plot for another projection or a time-dependent quantity.
- scene: needs x, y and 1-32 objects. Compose physical bodies and apparatus with the SAME parameters, definitions, ODE state and time as plots/fields/metrics. Coordinates and sizes are in axis units, y points upward, angles are radians, and aspect ratio is preserved. Object shapes: {kind:"body",center:[expression,expression],radius:expression}; {kind:"block",center:[expression,expression],width:expression,height:expression,angle?:expression}; {kind:"rod"|"spring"|"vector",from:[expression,expression],to:[expression,expression]}. Engineering symbols use the same from/to endpoint format: resistor, capacitor, inductor, voltageSource, currentSource, dimension (double-ended arrow), pin, roller, ground (from is the connection, to sets orientation/extent). Draw wires with path/rod and labels with symbol label. These symbols are visual only; use dynamics.circuit for the actual electrical model. A path is {kind:"path",points:[[expression,expression],...],closed?:boolean,dashed?:boolean}, with 2-64 points, for slopes, wires, ropes and ray paths. Each object may have label and color (ink, muted, blue, orange, red, green, violet). Sizes must remain positive and all geometry finite within ±1e6. Objects draw in array order. A vector's endpoints express the displayed vector; derive and label the force/velocity scale explicitly. Springs are schematic connectors, not automatic force laws: author the equations in dynamics/definitions. Use scenes for pendulum mechanisms, mass-spring assemblies, coupled oscillators, orbits, force diagrams and ray paths; pair them with actual calculated fields when needed. Scene objects only display the authored model; they do not add collision, contact or circuit solvers.
- metrics: needs 1–6 values of {label, expression, unit?, digits? from 0 to 5} and displays live numerical readouts.
Optional presets: at most four label and values entries, where values maps a parameter id to a number or expression evaluated against the current parameters/definitions at t=0 before resetting playback. The whole preset applies atomically; every result must be finite and inside its declared parameter range. For example {label:"Current optical limit",values:{separation:"clamp(radius,0.2,3)"}} follows current optics; keep only meaningful scientific comparison states and omit unnecessary button rows. Keep explanatory prose and equations outside the demonstration. Prefer a focused scene, a shared set of 1–3 visible sliders, and linked views to a wall of controls. Do not print implementation details or require the user to choose tools. Existing native panels/text/metric/table/chart components may surround demonstrations. All algorithms remain bounded mathematical data; unsupported operations must be explained rather than imitated with fake visuals.
A field can instead be a rotatable 3D wireframe of z=expression(x,y,t): presentation:'surface', x/y bounds and required zRange:[min,max]. Use physical z units; out-of-range or nonfinite vertices leave gaps. Use a separate field map for contours/vectors/color calibration. The browser rotates the already sampled mesh without re-solving. Optional surfaceStyle:'shaded' fills finite mesh faces in height-calibrated colors, with a numeric z legend; default is wireframe. This is a scalar height surface, not a volumetric or arbitrary 3D mesh.
Optional linearAlgebra is an ordered list of named structured arrays, with vector/matrix literals (values), add/sub/matmul/dot/cross (a,b earlier array IDs), scale (a,factor), norm/transpose (a). Example [{id:'force',op:'vector',values:[3,4]},{id:'rot',op:'matrix',values:[[0,-1],[1,0]]},{id:'result',op:'matmul',a:'rot',b:'force'},{id:'magnitude',op:'norm',a:'result'}]. Refer to vector components result_1/result_2, matrix entries rot_1_2 and scalar magnitude in ordinary expressions. Shapes up to 6; all generated components share the 24-definition limit. Array IDs are not scalar values. Operations are compiled to bounded scalar expressions, not arbitrary JS or a general tensor runtime.
For 3D curves use field presentation:'curve3d', x/y/zRange are physical bounds, curve3d:[X,Y,Z], parameterRange:[min,max] where x is the curve parameter; or curveHistory:true with dynamics and no parameterRange, evaluating coordinates at each simulation time. For 3D vector fields use presentation:'vectors3d', vector3d:[Fx,Fy,Fz], x/y/zRange, required positive vectorScale; components can use x,y,spaceZ,t and shared state. spaceZ is reserved in programs containing this view. Use expression:0 for these two presentations. 3D arrows are sampled on a bounded Cartesian grid and scaled by reference magnitude. For standalone stationary symmetric positive-definite systems use sparseSystem:{size:2,entries:[[0,0,2],[0,1,-1],[1,1,2]],rhs:[1,1]}; coordinates are zero-based, unique upper triangle, all diagonals explicit. Entries and RHS use constants/parameters only. CSR + Jacobi-preconditioned CG, up to 1024 unknowns and 8192 entries subject to 40KB program and 8M iteration-work budget; nonconvergence or breakdown errors explicitly. Plot sparseValue against index x=0..size-1 (interpolated); sparseAt(i) reads an exact zero-based integer component; sparseResidual and sparseIterations are scalar metrics. Default method pcg requires SPD (not certified); method:'bicgstab' accepts all zero-based matrix triplets including lower triangle, explicit nonzero diagonal for Jacobi, and handles nonsymmetric systems. Neither guarantees convergence. Do not combine sparseSystem with dynamics.
Set diagnostics:true for a collapsed solver statistics disclosure when numerical reliability matters. Reports measured step counts, accepted local error ratios (not global error), derivative evaluations, event counts, grid storage or CG residual/iterations. Do not infer accuracy from step counts or local error alone.
For chemistry and biology use dynamics.reactionNetwork with method rk45/sdirk2, species:[{id:'A',initial:1,composition:{C:1}},{id:'B',initial:0,composition:{C:1}}], reactions:[{id:'convert',reactants:{A:1},products:{B:1},rateConstant:2}]. Every reaction has exactly one nonnegative rateConstant (mass action, parameter-only) or custom nonnegative rate (state/parameter expression, must respect reactant availability). Reverse reactions are separate channels. Empty reactants/products allow open sources/sinks when no elemental composition is supplied. If composition is supplied for any species it must be supplied for all, and each reaction must balance each declared element. rate_<id> exposes flux, total_<element> exposes atom-equivalent amount. For discrete stationary mass-action count models choose method:'ssa', nonnegative integer initial molecule counts and rateConstant only, optional integer seed in reactionNetwork (default 12345). Gillespie direct method uses propensities k*product(binomial(count,stoichiometry)); these stochastic constants are not interchangeable with concentration-law constants. Exact jump states, max 10,000 simulated reaction events, count cap 1e8; step is a required compatibility bound, not an SSA integration step. Set interpolation:'step' on count curves to display a sampled staircase; the history chart is sampled, not an exact event raster. Same seed reproduces a trajectory; one trajectory is not an ensemble statistic. Use consistent concentration or amount units in a fixed-volume system; no automatic thermodynamic, molecular or biochemical inference. 16 species (8 stiff), 16 channels, 24 combined definitions. Large negative accepted steps are rejected; tiny numerical undershoot is clamped to zero. For enzyme kinetics, gene expression, population growth and compartment exchange, author physically meaningful rates or explicit ODEs; label all assumptions and illustrative parameters. Scene symbols atom:{center,radius,element}, cell:{center,radius}, and bond/doubleBond/tripleBond/reactionArrow/reversibleArrow/inhibition:{from,to} are authored schematic geometry only; no SMILES parser, automatic molecular structure or force-field calculation. Use conventional element symbols, label unusual atoms and do not imply quantitative cell morphology.
For general stationary nonlinear residual systems use nonlinearSystem:{guess:{q:1,v:1},residuals:{q:'q^2+v^2-5',v:'q-v-1'}}. Square 1–8 unknowns, parameter-only guesses, residuals use parameters and unknowns only; damped finite-difference Newton with absolute residual tolerance and bounded iterations. The named unknowns, rootResidual and rootIterations are available in views. Only a local root is sought, not all roots or optimization. Do not combine with dynamics or sparseSystem. For coupled reaction-diffusion use dynamics:{method:'grid-heun',duration:1,step:0.005,coupledFields:{dimension:1,nx:32,xDomain:[0,1],boundary:'periodic',fields:[{id:'U',initial:'1+0.2*cos(2*pi*x)',diffusivity:0.01,reaction:'-U+V'},{id:'V',initial:0,diffusivity:0.01,reaction:'U-V'}]}}. 1–4 fields, 1D 3–257 cells, 2D 3–33 per axis with yDomain and ny; periodic or noFlux boundaries. Initial uses coordinates/parameters; diffusivity nonnegative parameter-only; reaction uses local field IDs, coordinates, t and parameters. Explicit Heun, cell-centred conservative Laplacian; diffusion CFL max(D)*dt*(1/dx^2+1/dy^2)<=0.5 (omit y term in 1D), not a stability guarantee for stiff reaction terms. Use smaller steps and convergence checks. At most 2000 steps, 2 million stored scalar values; field IDs sample the interpolated solution, mean_<id> is a cell mean. No advection, general mesh or arbitrary PDE. For analytic three-dimensional scalar fields use a map field with slicePlane:{axis:'z',at:'height'}, expression:'exp(-(x^2+y^2+spaceZ^2))'. The map x/y bounds are the two displayed coordinates in order: z slice x,y; y slice x,z; x slice y,z. spaceZ is enabled for these programs; axis position can follow a parameter or time. Scalar maps/contours only, not a computed 3D PDE. Set streamlines:true on a regular 2D vector map (requires vector:[Fx,Fy]) to show bounded normalized midpoint-integrated field lines at the current time. These are instantaneous streamlines, not particle paths or trajectories; no streamline density or speed inference. Diagnostics may report absolute root residual and diffusion CFL.
Calculus: diff(s,point,expression) differentiates a smooth explicit expression in the local variable s using forward-mode AD; use an unused safe local name other than x/y/t/pi/e and write the dependence on s inline. Unsupported/nondifferentiable operations fail instead of guessing. integral(s,lower,upper,expression) uses 128-subinterval composite Simpson quadrature, smooth finite integrands only; same local scoping, not adaptive or symbolic integration. Standalone Newton prefers AD Jacobian columns with finite-difference fallback for unsupported expressions. For bounded smooth optimization use optimization:{variables:[{id:'q',initial:0,min:-5,max:5}],objective:'(q-2)^2',goal:'min'}; 1–8 variables, box constraints only, normalized coordinates, projected BFGS with backtracking, local stationary point not certified global optimum; min or max. Objective uses variables and parameters (not definitions), initial expressions use parameters only. optObjective, optGradient (projected gradient in normalized coordinates), optIterations and variable names expose results. Do not combine with dynamics or other stationary solver. Diagnostics report AD/fallback column counts, objective evaluations. For a true parametric 3D surface use field presentation:'parametricSurface', surface3d:[X,Y,Z], uRange/vRange for the two parameters (expressions use x as u, y as v), x/y/zRange for physical coordinate bounds, surfaceStyle:'shaded' or 'wireframe'; optional expression:0. Bounded 17x17/33x33 surface samples with gaps, no automatic mesh refinement. Scalar map markers use existing markers:[{x:expr,y:expr,label:'...'}] in displayed coordinates (including slice coordinates); suitable for visualizing a computed optimum. One format for new physics content: {version:1,nodes:[{id,type:"demonstration",title,program:{version:1,parameters,definitions,dynamics?,views,presets?}}]}. Do not emit a separate physics renderer, hand-written SVG/HTML/JS, or a fixed scene ID for a new model. Historical physics IDs and OpenUI Rayleigh are compatibility adapters into this same program renderer. Ordinary explanations stay in prose. Reuse a definition across force arrows, geometry, trajectories and readouts instead of generating disconnected visuals.
Build a new model by declaring units/assumptions, choosing independent state variables, deriving force laws and initial conditions, then composing only the views that help. Change equations, boundary parameters, initial conditions, expressions, object count/order and view composition freely within the documented limits. The examples are editable starting points, not a list of permitted models. Derive new equations rather than selecting the nearest named scene; verify dimensions, conservation or a known limiting case. State approximations such as point masses, lumped temperature or prescribed motion. Never imply generic collision/PDE/contact/circuit solving.
Available composed examples and assumptions:
${Object.entries(PHYSICS_EXAMPLE_ASSUMPTIONS)
  .map(([id, assumptions]) => `${id}: ${assumptions}`)
  .join('\n')}
Editable coupled dynamics example (compose additional fields, objects or controls as needed):
${JSON.stringify(PHYSICS_EXAMPLES.coupledOscillators)}
Editable electromagnetic example (change the mathematical model and composition, not just labels):
${JSON.stringify(PHYSICS_EXAMPLES.chargedParticle)}
Example of a previously unregistered diffraction-grating demonstration:
{"version":1,"parameters":[{"id":"N","label":"Slits N","value":6,"min":2,"max":12,"step":1},{"id":"ratio","label":"d / a","value":4,"min":1,"max":8,"step":0.1},{"id":"gamma","label":"Display gamma","value":0.4,"min":0.2,"max":1,"step":0.05,"advanced":true}],"definitions":{"envelope":"sinc(pi*x/ratio)^2","intensity":"envelope*sinratio(N,pi*x)^2"},"views":[{"kind":"controls"},{"kind":"plot","x":[-3.3,3.3],"y":[0,1.08],"xLabel":"$d\\\\sin\\\\theta / \\\\lambda$","yLabel":"$I/I_0$","curves":[{"expression":"intensity","label":"Total intensity","color":"blue"},{"expression":"envelope","label":"Single-slit envelope","color":"muted","dashed":true}]},{"kind":"field","x":[-3.3,3.3],"y":[-1,1],"expression":"intensity","gamma":"gamma","tint":[0.55,1,0.08],"height":96}]}`;

/* The tool schema is the machine-readable half of the same contract. Named
   properties give a provider's encoder anchors, so repeated siblings stay
   JSON arrays instead of collapsing into {item: [...]}. Bounds here mirror
   validateDemonstration in packages/core; the validator stays authoritative
   and still rejects anything the schema cannot express. */
const EXPRESSION = { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 1600 }] };
const AXIS = {
  type: 'array',
  minItems: 2,
  maxItems: 2,
  items: EXPRESSION,
  description: 'Increasing [min,max] within ±1e6.',
};
export const DEMONSTRATION_PROGRAM_SCHEMA = {
  type: 'object',
  description: DEMONSTRATION_GUIDANCE,
  required: ['version', 'views'],
  properties: {
    diagnostics: {type:'boolean',description:'Optional collapsed numerical solver diagnostics; never fake numerical statistics.'},
    version: { type: 'integer', enum: [1], description: 'The number 1, not the string "1".' },
    resetKey: {
      type: 'string',
      maxLength: 80,
      description: 'Change it to restore every declared default.',
    },
    parameters: {
      type: 'array',
      maxItems: 12,
      description: 'Optional; at most 12. Use only for demonstration nodes, inside program.',
      items: {
        type: 'object',
        required: ['id', 'label', 'value', 'min', 'max'],
        properties: {
          id: {
            type: 'string',
            pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$',
            description: 'ASCII identifier; never x,y,t,pi,e or a function name.',
          },
          label: { type: 'string', maxLength: 200 },
          value: { type: 'number', description: 'Default inside [min,max].' },
          min: { type: 'number' },
          max: { type: 'number' },
          step: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 200 },
          advanced: {
            type: 'boolean',
            description: 'Disclose this slider under an advanced section.',
          },
        },
      },
    },
    optimization:{type:'object',required:['variables','objective'],properties:{variables:{type:'array',minItems:1,maxItems:8,items:{type:'object',required:['id','initial','min','max'],properties:{id:{type:'string'},initial:EXPRESSION,min:{type:'number'},max:{type:'number'}}}},objective:EXPRESSION,goal:{type:'string',enum:['min','max']},tolerance:{type:'number',minimum:1e-10,maximum:0.01},maxIterations:{type:'integer',minimum:1,maximum:300}}},
    nonlinearSystem:{type:'object',required:['guess','residuals'],properties:{guess:{type:'object',maxProperties:8,additionalProperties:EXPRESSION},residuals:{type:'object',maxProperties:8,additionalProperties:EXPRESSION},tolerance:{type:'number',minimum:1e-12,maximum:1e-3},maxIterations:{type:'integer',minimum:1,maximum:80}}},
    sparseSystem: {
      type:'object',required:['size','entries','rhs'],properties:{
        method:{type:'string',enum:['pcg','bicgstab']},
        size:{type:'integer',minimum:1,maximum:1024},
        entries:{type:'array',minItems:1,maxItems:8192,items:{type:'array',minItems:3,maxItems:3,items:EXPRESSION}},
        rhs:{type:'array',minItems:1,maxItems:1024,items:EXPRESSION},
        tolerance:{type:'number',minimum:1e-12,maximum:1e-3},
        maxIterations:{type:'integer',minimum:1,maximum:1024},
      },
    },
    linearAlgebra: {
      type: 'array', minItems:1,maxItems:12,
      description: 'Ordered named vector/matrix expressions. Components are exposed as scalar definitions.',
      items:{type:'object',required:['id','op'],properties:{
        id:{type:'string'},op:{type:'string',enum:['vector','matrix','add','sub','scale','dot','norm','cross','transpose','matmul']},
        a:{type:'string'},b:{type:'string'},factor:EXPRESSION,
        values:{anyOf:[{type:'array',minItems:1,maxItems:6,items:EXPRESSION},{type:'array',minItems:1,maxItems:6,items:{type:'array',minItems:1,maxItems:6,items:EXPRESSION}}]},
      }},
    },
    definitions: {
      type: 'object',
      maxProperties: 24,
      additionalProperties: { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 1600 }] },
      description:
        'Name to expression; may use other definitions in any order (no cycles), parameters, x, y, t and ODE states. Plain ASCII math: x^2, 2*x, pi.',
    },
    dynamics: {
      type: 'object',
      required: ['duration', 'step'],
      description: 'Optional for algebraic time animation; required for trajectory views.',
      properties: {
        initial: { type: 'object', maxProperties: 32, additionalProperties: EXPRESSION },
        derivatives: {
          type: 'object',
          maxProperties: 32,
          additionalProperties: EXPRESSION,
        },
        duration: { type: 'number', exclusiveMinimum: 0, maximum: 300 },
        step: { type: 'number', minimum: 0.000001, maximum: 1 },
        method: { type: 'string', enum: ['rk4', 'rk45', 'sdirk2', 'grid-implicit', 'ssa', 'grid-heun'] },
        coupledFields:{type:'object',required:['dimension','nx','xDomain','boundary','fields'],properties:{dimension:{type:'integer',enum:[1,2]},nx:{type:'integer',minimum:3,maximum:257},ny:{type:'integer',minimum:3,maximum:33},xDomain:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},yDomain:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},boundary:{type:'string',enum:['periodic','noFlux']},fields:{type:'array',minItems:1,maxItems:4,items:{type:'object',required:['id','initial','diffusivity'],properties:{id:{type:'string'},initial:EXPRESSION,diffusivity:EXPRESSION,reaction:EXPRESSION}}}}},
        spatial: {
          type: 'object',
          description: '1D diffusion/reaction or wave equation, or rectangular 2D diffusion. RK45 for small models; grid-implicit for larger standalone linear diffusion. See semantic limits.',
          required: ['initial'],
          properties: {
            dimension: { type: 'integer', enum: [1, 2] },
            nx: { type: 'integer', minimum: 3, maximum: 65 },
            ny: { type: 'integer', minimum: 3, maximum: 65 },
            xDomain: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
            yDomain: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
            boundary: EXPRESSION,
            nodes: { type: 'integer', minimum: 3, maximum: 257 },
            domain: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
            equation: { type: 'string', enum: ['diffusion', 'wave'] },
            diffusivity: EXPRESSION,
            speed: EXPRESSION,
            initialVelocity: EXPRESSION,
            damping: EXPRESSION,
            initial: EXPRESSION,
            left: EXPRESSION,
            right: EXPRESSION,
            source: EXPRESSION,
          },
        },
        reactionNetwork: {
          type:'object',required:['species','reactions'],properties:{
            seed:{type:'integer',minimum:0,maximum:4294967295},
            species:{type:'array',minItems:1,maxItems:16,items:{type:'object',required:['id','initial'],properties:{id:{type:'string'},initial:EXPRESSION,composition:{type:'object',maxProperties:12,additionalProperties:{type:'integer',minimum:0,maximum:200}}}}},
            reactions:{type:'array',minItems:1,maxItems:16,items:{type:'object',required:['id','reactants','products'],properties:{id:{type:'string'},reactants:{type:'object',additionalProperties:{type:'integer',minimum:1,maximum:8}},products:{type:'object',additionalProperties:{type:'integer',minimum:1,maximum:8}},rateConstant:EXPRESSION,rate:EXPRESSION}}},
          },
        },
        stateSpace: {
          type: 'object',
          description: 'Linear state-space matrices xdot=A*x+B*u, y=C*x+D*u. Alternative to other dynamics descriptions.',
          required: ['states','initial','A','B','inputs','C','D','outputs'],
          properties: {
            states: {type:'array', minItems:1,maxItems:16,items:{type:'string'}},
            initial: {type:'array', minItems:1,maxItems:16,items:EXPRESSION},
            inputs: {type:'array', minItems:1,maxItems:4,items:EXPRESSION},
            outputs: {type:'array', minItems:1,maxItems:8,items:{type:'string'}},
            A: {type:'array', minItems:1,maxItems:16,items:{type:'array',minItems:1,maxItems:16,items:EXPRESSION}},
            B: {type:'array', minItems:1,maxItems:16,items:{type:'array',minItems:1,maxItems:4,items:EXPRESSION}},
            C: {type:'array', minItems:1,maxItems:8,items:{type:'array',minItems:1,maxItems:16,items:EXPRESSION}},
            D: {type:'array', minItems:1,maxItems:8,items:{type:'array',minItems:1,maxItems:4,items:EXPRESSION}},
          },
        },
        circuit: {
          type: 'object',
          description: 'Bounded linear RLC network, alternative to explicit dynamics and spatial models.',
          required: ['nodes', 'elements'],
          properties: {
            nodes: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
            elements: {
              type: 'array', minItems: 1, maxItems: 10,
              items: {
                type: 'object', required: ['kind', 'id', 'p', 'n', 'value'],
                properties: {
                  kind: { type: 'string', enum: ['R', 'L', 'C', 'V', 'I'] },
                  id: { type: 'string' },
                  p: { type: 'string' },
                  n: { type: 'string' },
                  value: EXPRESSION,
                  initial: EXPRESSION,
                },
              },
            },
          },
        },
        algebraic: {
          type: 'object', description: 'Small semi-explicit index-one algebraic residuals, solved locally by damped Newton.',
          required: ['guess','residuals'],
          properties: {
            guess: {type:'object',maxProperties:4,additionalProperties:EXPRESSION},
            residuals: {type:'object',maxProperties:4,additionalProperties:EXPRESSION},
            tolerance: {type:'number',minimum:1e-12,maximum:1e-3},
          },
        },
        massMatrix: {
          type: 'array', minItems: 1, maxItems: 8,
          items: { type: 'array', minItems: 1, maxItems: 8, items: EXPRESSION },
          description: 'Nonsingular square M in M*stateDerivative=derivatives, ordered by the initial state keys; adaptive solver only.',
        },
        rtol: { type: 'number', minimum: 1e-10, maximum: 0.01 },
        atol: { type: 'number', minimum: 1e-10, maximum: 0.01 },
        events: {
          type: 'array',
          maxItems: 8,
          items: {
            type: 'object',
            required: ['expression'],
            properties: {
              expression: EXPRESSION,
              direction: { type: 'integer', enum: [-1, 0, 1] },
              rearmTolerance: {type:'number',minimum:0,maximum:1000000},
              terminal: { type: 'boolean' },
              reset: { type: 'object', maxProperties: 32, additionalProperties: EXPRESSION },
            },
          },
        },
      },
    },
    views: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      description:
        '1-8 views. Required per kind: plot x, y and 1-6 curves; field x, y and expression; trajectory x, y, horizontal, vertical and dynamics; scene x, y and 1-32 objects; metrics 1-6 values; controls nothing. At most one controls, two field views and twelve curves total.',
      items: {
        type: 'object',
        required: ['kind'],
        description:
          'The schema cannot express per-kind required fields; the validator enforces the list on views.',
        properties: {
          kind: {
            type: 'string',
            enum: ['controls', 'plot', 'field', 'trajectory', 'scene', 'metrics'],
          },
          label: { type: 'string', maxLength: 200 },
          xLabel: { type: 'string', maxLength: 200 },
          yLabel: { type: 'string', maxLength: 200 },
          x: AXIS,
          y: AXIS,
          history: { type: 'boolean', description: 'Plot only: multiple time histories up to the current playback time.' },
          sliceY: EXPRESSION,
          xScale: { type: 'string', enum: ['linear', 'log'] },
          yScale: { type: 'string', enum: ['linear', 'log'] },
          objects: {
            type: 'array',
            minItems: 1,
            maxItems: 32,
            description:
              'Scene only. body requires center/radius; block center/width/height, optional angle; rod/spring/vector from/to; path 2-64 points, optional closed/dashed. Coordinates and positive sizes in physical axis units, angle in radians.',
            items: {
              type: 'object',
              required: ['kind'],
              properties: {
                kind: {
                  type: 'string',
                  enum: ['body', 'block', 'rod', 'spring', 'vector', 'path', 'resistor', 'capacitor', 'inductor', 'voltageSource', 'currentSource', 'dimension', 'pin', 'roller', 'ground', 'atom', 'cell', 'bond', 'doubleBond', 'tripleBond', 'reactionArrow', 'reversibleArrow', 'inhibition'],
                },
                label: { type: 'string', maxLength: 200 },
                color: {
                  type: 'string',
                  enum: ['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'],
                },
                center: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                from: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                to: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                points: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 64,
                  items: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                },
                closed: { type: 'boolean' },
                dashed: { type: 'boolean' },
                radius: EXPRESSION,
                element: {type:'string',maxLength:2},
                width: EXPRESSION,
                height: EXPRESSION,
                angle: EXPRESSION,
              },
            },
          },
          curves: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: {
              type: 'object',
              required: ['expression'],
              properties: {
                expression: EXPRESSION,
                label: { type: 'string', maxLength: 200 },
                color: {
                  type: 'string',
                  enum: ['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'],
                },
                dashed: { type: 'boolean' },
                interpolation: {type:'string',enum:['linear','step']},
              },
            },
          },
          markers: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              required: ['x', 'y'],
              properties: {
                x: EXPRESSION,
                y: EXPRESSION,
                label: { type: 'string', maxLength: 200 },
                color: { type: 'string' },
              },
            },
          },
          expression: EXPRESSION,
          presentation: { type: 'string', enum: ['map', 'surface', 'curve3d', 'vectors3d','parametricSurface'] },
          surface3d:{type:'array',minItems:3,maxItems:3,items:EXPRESSION},
          uRange:AXIS,
          vRange:AXIS,
          slicePlane:{type:'object',required:['axis','at'],properties:{axis:{type:'string',enum:['x','y','z']},at:EXPRESSION}},
          streamlines:{type:'boolean'},
          curve3d: {type:'array',minItems:3,maxItems:3,items:EXPRESSION},
          vector3d: {type:'array',minItems:3,maxItems:3,items:EXPRESSION},
          parameterRange: AXIS,
          curveHistory: {type:'boolean'},
          surfaceStyle: { type: 'string', enum: ['wireframe', 'shaded'] },
          zRange: AXIS,
          palette: { type: 'string', enum: ['light', 'signed', 'heat'] },
          colorRange: AXIS,
          unit: { type: 'string', maxLength: 200 },
          contours: { type: 'array', minItems: 1, maxItems: 6, items: EXPRESSION },
          vectorScale: EXPRESSION,
          tint: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'number', minimum: 0, maximum: 1 },
          },
          gamma: EXPRESSION,
          exposure: EXPRESSION,
          height: { type: 'number', minimum: 64, maximum: 320 },
          vector: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
          horizontal: EXPRESSION,
          vertical: EXPRESSION,
          values: {
            type: 'array',
            minItems: 1,
            maxItems: 6,
            items: {
              type: 'object',
              required: ['label', 'expression'],
              properties: {
                label: { type: 'string', maxLength: 200 },
                expression: EXPRESSION,
                unit: { type: 'string', maxLength: 200 },
                digits: { type: 'integer', minimum: 0, maximum: 5 },
              },
            },
          },
        },
      },
    },
    duration: { type: 'number', exclusiveMinimum: 0, maximum: 30 },
    presets: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        required: ['label', 'values'],
        properties: {
          label: { type: 'string', maxLength: 200 },
          values: { type: 'object', additionalProperties: EXPRESSION },
        },
      },
    },
  },
};
