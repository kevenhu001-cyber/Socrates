import { PHYSICS_EXAMPLES, PHYSICS_EXAMPLE_ASSUMPTIONS } from '../../../packages/core/src/physicsExamples.js';

/** App-owned mathematical runtime; models author algorithms and composition, not executable JS. */
export const DEMONSTRATION_GUIDANCE = `Build a new algorithmic demonstration without choosing a preset physics model. Arguments are JSON, not markup: every list is a JSON array, every numeric field is a JSON number, and program.version is the number 1. Never encode a list as {"item": [...]}, never wrap an array in tags, and never send "1" where a number belongs.

A demonstration node is {"id":"demo","type":"demonstration","title":"...","program":{"version":1,"parameters":[],"definitions":{},"views":[]}}. views has 1-8 entries. Required per view: plot -> x, y and 1-6 curves; field -> x, y and expression; trajectory -> x, y, horizontal, vertical and program.dynamics; scene -> x, y and 1-32 objects; metrics -> 1-6 values; controls -> nothing. At most one controls, two field views and twelve curves total. The schema marks per-kind fields optional because JSON Schema cannot express the condition; validation still requires them. Fix every field named in an error in one corrected call.

All views share parameters, definitions, time t and optional ODE state. To drive an existing demonstration from the conversation, patch its program with changed parameter value fields: edited defaults apply immediately while unrelated manual control values survive. Set or change the optional resetKey string to restore all declared defaults, including a value equal to a previous default. This is the preferred route for novel mathematical/physical demonstrations and custom compositions.

Parameters: up to 12 entries with id, label, value, min, max and optional step, unit, advanced. IDs are ASCII identifiers, never x,y,t,pi,e or function names, and expressions must use exactly the same spelling (names are case-sensitive). min < max and value lies inside [min,max]. Definitions: up to 24 name:expression entries, where an expression is a number or mathematical string. Definitions can use each other in any order (no cycles), parameters, x,y,t and ODE states. They are reevaluated at the current sample coordinates/time, so refer to a definition by its name (f, not f(x)). Operators + - * / % ^ < > <= >= == != && || and condition ? yes : no; write powers as x^2, multiplication as * (2*x; 2x is also read as 2*x), pi for π. Angles are radians; convert degrees with deg*pi/180. Functions sin cos tan asin acos atan atan2 sqrt abs exp log (natural; ln is accepted) log10 pow min max floor ceil round sign hypot sinh cosh tanh clamp(v,min,max), sinc(z)=sin(z)/z with limit 1, sinratio(n,z)=sin(n*z)/(n*sin(z)) with removable singularities filled for integer n, besselJ1(z), airy(u)=[2J1(u)/u]^2 with limit 1. sum(i,first,last,expression) sums at most 1000 integer-indexed terms; iterate(v,initial,count,expression) applies a scalar recurrence at most 1000 times. if(condition,yes,no) is lazy. Use mathematical expressions, not JavaScript syntax; no Math. prefixes, property access, code, callbacks, imports, HTML or shaders. A sample that divides by zero or leaves a function's domain is drawn as a gap rather than failing the view, but keep the plotted range where the model is defined. Express new algorithms through definitions, sums, recurrences and ODEs. Each expression is ≤1600 characters and the entire program ≤40000.
Dynamics, optional: {"initial":{"X":1,"Y":1,"Z":1},"derivatives":{"X":"sigma*(X-Y)","Y":"X*(rho-Z)-Y","Z":"X*Y-beta*Z"},"duration":20,"step":0.01}. Initial values are numbers/parameter expressions; derivatives can use all current states, definitions and parameters. State IDs cannot collide with parameters/definitions/x/y/t. Up to 6 states, duration ≤30 seconds, step 0.002–0.05 and ≤10000 fixed RK4 steps. A program may instead specify duration for algebraic time animation without dynamics. Numeric dynamics may diverge; the app then keeps the history up to that time and stops there, so choose sensible steps/ranges and keep physical assumptions in prose.
Views are ordered freely (1–8). Every view has "kind" (not "type"). Axis bounds are a two-element JSON array [min,max] of finite numbers or expressions evaluated at the current time with x=y=0; use parameter-dependent bounds to keep important features visible, for example "y":[0,"max(1.12,1.12*total)"]. Bounds must remain finite, increasing and within ±1e6:

- controls: places the compact shared parameter sliders here. At most one; without it controls follow the views. Advanced parameters are disclosed separately. No tool or model selector is shown to the learner.
- plot: needs x, y and 1–6 curves of {expression, label?, color?, dashed?}, plus optional markers of {x, y, label?, color?}. It evaluates curves over x at current t with y=0. Up to 6 curves/view and 12 total. Colors: ink, muted, blue, orange, red, green, violet. Use multiple labeled curves, dashed envelopes, calibrated axes and markers when they clarify the phenomenon.
- field: needs x, y and expression, with optional palette (light, signed or heat), tint (three 0–1 channels), gamma, exposure, height (64–320) and vector (two expressions). It computes pixels locally. At most 2 field views. The light palette maps nonnegative physical intensity with separate display gamma/exposure; the signed palette distinguishes positive/negative fields; the optional vector pair overlays direction arrows. The field is 320 units wide; height 64–96 makes a compact intensity strip and 160 suits a 2:1 2D field. Match height to 320 times the y-span/x-span for geometrically faithful 2D fields. Never substitute circles or searched pictures for a calculated field.
- trajectory: needs x, y, horizontal and vertical, with optional color and labels. It draws the ODE history up to current t with a moving endpoint and requires dynamics. Use a plot for another projection or a time-dependent quantity.
- scene: needs x, y and 1-32 objects. Compose physical bodies and apparatus with the SAME parameters, definitions, ODE state and time as plots/fields/metrics. Coordinates and sizes are in axis units, y points upward, angles are radians, and aspect ratio is preserved. Object shapes: {kind:"body",center:[expression,expression],radius:expression}; {kind:"block",center:[expression,expression],width:expression,height:expression,angle?:expression}; {kind:"rod"|"spring"|"vector",from:[expression,expression],to:[expression,expression]}. A path is {kind:"path",points:[[expression,expression],...],closed?:boolean,dashed?:boolean}, with 2-64 points, for slopes, wires, ropes and ray paths. Each object may have label and color (ink, muted, blue, orange, red, green, violet). Sizes must remain positive and all geometry finite within ±1e6. Objects draw in array order. A vector's endpoints express the displayed vector; derive and label the force/velocity scale explicitly. Springs are schematic connectors, not automatic force laws: author the equations in dynamics/definitions. Use scenes for pendulum mechanisms, mass-spring assemblies, coupled oscillators, orbits, force diagrams and ray paths; pair them with actual calculated fields when needed. Scene objects only display the authored model; they do not add collision, contact or circuit solvers.
- metrics: needs 1–6 values of {label, expression, unit?, digits? from 0 to 5} and displays live numerical readouts.
Optional presets: at most four label and values entries, where values maps a parameter id to a number or expression evaluated against the current parameters/definitions at t=0 before resetting playback. The whole preset applies atomically; every result must be finite and inside its declared parameter range. For example {label:"Current optical limit",values:{separation:"clamp(radius,0.2,3)"}} follows current optics; keep only meaningful scientific comparison states and omit unnecessary button rows. Keep explanatory prose and equations outside the demonstration. Prefer a focused scene, a shared set of 1–3 visible sliders, and linked views to a wall of controls. Do not print implementation details or require the user to choose tools. Existing native panels/text/metric/table/chart components may surround demonstrations. All algorithms remain bounded mathematical data; unsupported operations must be explained rather than imitated with fake visuals.
One format for new physics content: {version:1,nodes:[{id,type:"demonstration",title,program:{version:1,parameters,definitions,dynamics?,views,presets?}}]}. Do not emit a separate physics renderer, hand-written SVG/HTML/JS, or a fixed scene ID for a new model. Historical physics IDs and OpenUI Rayleigh are compatibility adapters into this same program renderer. Ordinary explanations stay in prose. Reuse a definition across force arrows, geometry, trajectories and readouts instead of generating disconnected visuals.
Build a new model by declaring units/assumptions, choosing independent state variables, deriving force laws and initial conditions, then composing only the views that help. Change equations, boundary parameters, initial conditions, expressions, object count/order and view composition freely within the documented limits. The examples are editable starting points, not a list of permitted models. Derive new equations rather than selecting the nearest named scene; verify dimensions, conservation or a known limiting case. State approximations such as point masses, lumped temperature or prescribed motion. Never imply generic collision/PDE/contact/circuit solving.
Available composed examples and assumptions:
${Object.entries(PHYSICS_EXAMPLE_ASSUMPTIONS).map(([id,assumptions])=>`${id}: ${assumptions}`).join('\n')}
Editable coupled dynamics example (compose additional fields, objects or controls as needed):
${JSON.stringify(PHYSICS_EXAMPLES.coupledOscillators)}
Editable electromagnetic example (change the mathematical model and composition, not just labels):
${JSON.stringify(PHYSICS_EXAMPLES.chargedParticle)}
Example of a previously unregistered diffraction-grating demonstration:
{"version":1,"parameters":[{"id":"N","label":"Slits N","value":6,"min":2,"max":12,"step":1},{"id":"ratio","label":"d / a","value":4,"min":1,"max":8,"step":0.1},{"id":"gamma","label":"Display gamma","value":0.4,"min":0.2,"max":1,"step":0.05,"advanced":true}],"definitions":{"envelope":"sinc(pi*x/ratio)^2","intensity":"envelope*sinratio(N,pi*x)^2"},"views":[{"kind":"controls"},{"kind":"plot","x":[-3.3,3.3],"y":[0,1.08],"xLabel":"d sinθ / λ","yLabel":"I / I₀","curves":[{"expression":"intensity","label":"Total intensity","color":"blue"},{"expression":"envelope","label":"Single-slit envelope","color":"muted","dashed":true}]},{"kind":"field","x":[-3.3,3.3],"y":[-1,1],"expression":"intensity","gamma":"gamma","tint":[0.55,1,0.08],"height":96}]}`;

/* The tool schema is the machine-readable half of the same contract. Named
   properties give a provider's encoder anchors, so repeated siblings stay
   JSON arrays instead of collapsing into {item: [...]}. Bounds here mirror
   validateDemonstration in packages/core; the validator stays authoritative
   and still rejects anything the schema cannot express. */
const EXPRESSION = { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 1600 }] };
const AXIS = { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION, description: 'Increasing [min,max] within ±1e6.' };
export const DEMONSTRATION_PROGRAM_SCHEMA = {
  type: 'object',
  description: DEMONSTRATION_GUIDANCE,
  required: ['version', 'views'],
  properties: {
    version: { type: 'integer', enum: [1], description: 'The number 1, not the string "1".' },
    resetKey: { type: 'string', maxLength: 80, description: 'Change it to restore every declared default.' },
    parameters: {
      type: 'array', maxItems: 12,
      description: 'Optional; at most 12. Use only for demonstration nodes, inside program.',
      items: {
        type: 'object', required: ['id', 'label', 'value', 'min', 'max'],
        properties: {
          id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$', description: 'ASCII identifier; never x,y,t,pi,e or a function name.' },
          label: { type: 'string', maxLength: 200 },
          value: { type: 'number', description: 'Default inside [min,max].' },
          min: { type: 'number' }, max: { type: 'number' },
          step: { type: 'number', exclusiveMinimum: 0 },
          unit: { type: 'string', maxLength: 200 },
          advanced: { type: 'boolean', description: 'Disclose this slider under an advanced section.' },
        },
      },
    },
    definitions: {
      type: 'object', maxProperties: 24,
      additionalProperties: { anyOf: [{ type: 'number' }, { type: 'string', maxLength: 1600 }] },
      description: 'Name to expression; may use other definitions in any order (no cycles), parameters, x, y, t and ODE states. Plain ASCII math: x^2, 2*x, pi.',
    },
    dynamics: {
      type: 'object', required: ['initial', 'derivatives', 'duration', 'step'],
      description: 'Optional for algebraic time animation; required for trajectory views.',
      properties: {
        initial: { type: 'object', maxProperties: 6, additionalProperties: EXPRESSION },
        derivatives: { type: 'object', maxProperties: 6, additionalProperties: { type: 'string', maxLength: 1600 } },
        duration: { type: 'number', exclusiveMinimum: 0, maximum: 30 },
        step: { type: 'number', minimum: 0.002, maximum: 0.05 },
      },
    },
    views: {
      type: 'array', minItems: 1, maxItems: 8,
      description: '1-8 views. Required per kind: plot x, y and 1-6 curves; field x, y and expression; trajectory x, y, horizontal, vertical and dynamics; scene x, y and 1-32 objects; metrics 1-6 values; controls nothing. At most one controls, two field views and twelve curves total.',
      items: {
        type: 'object', required: ['kind'],
        description: 'The schema cannot express per-kind required fields; the validator enforces the list on views.',
        properties: {
          kind: { type: 'string', enum: ['controls', 'plot', 'field', 'trajectory', 'scene', 'metrics'] },
          label: { type: 'string', maxLength: 200 },
          xLabel: { type: 'string', maxLength: 200 },
          yLabel: { type: 'string', maxLength: 200 },
          x: AXIS, y: AXIS,
          objects: {
            type: 'array', minItems: 1, maxItems: 32,
            description: 'Scene only. body requires center/radius; block center/width/height, optional angle; rod/spring/vector from/to; path 2-64 points, optional closed/dashed. Coordinates and positive sizes in physical axis units, angle in radians.',
            items: {
              type: 'object', required: ['kind'],
              properties: {
                kind: { type: 'string', enum: ['body', 'block', 'rod', 'spring', 'vector', 'path'] },
                label: { type: 'string', maxLength: 200 },
                color: { type: 'string', enum: ['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'] },
                center: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                from: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                to: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
                points: { type: 'array', minItems: 2, maxItems: 64, items: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION } },
                closed: { type: 'boolean' }, dashed: { type: 'boolean' },
                radius: EXPRESSION, width: EXPRESSION, height: EXPRESSION, angle: EXPRESSION,
              },
            },
          },
          curves: {
            type: 'array', minItems: 1, maxItems: 6,
            items: {
              type: 'object', required: ['expression'],
              properties: {
                expression: EXPRESSION, label: { type: 'string', maxLength: 200 },
                color: { type: 'string', enum: ['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'] },
                dashed: { type: 'boolean' },
              },
            },
          },
          markers: {
            type: 'array', maxItems: 8,
            items: {
              type: 'object', required: ['x', 'y'],
              properties: { x: EXPRESSION, y: EXPRESSION, label: { type: 'string', maxLength: 200 }, color: { type: 'string' } },
            },
          },
          expression: EXPRESSION,
          palette: { type: 'string', enum: ['light', 'signed', 'heat'] },
          tint: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: 0, maximum: 1 } },
          gamma: EXPRESSION, exposure: EXPRESSION,
          height: { type: 'number', minimum: 64, maximum: 320 },
          vector: { type: 'array', minItems: 2, maxItems: 2, items: EXPRESSION },
          horizontal: EXPRESSION, vertical: EXPRESSION,
          values: {
            type: 'array', minItems: 1, maxItems: 6,
            items: {
              type: 'object', required: ['label', 'expression'],
              properties: {
                label: { type: 'string', maxLength: 200 }, expression: EXPRESSION,
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
      type: 'array', maxItems: 4,
      items: {
        type: 'object', required: ['label', 'values'],
        properties: { label: { type: 'string', maxLength: 200 }, values: { type: 'object', additionalProperties: EXPRESSION } },
      },
    },
  },
};
