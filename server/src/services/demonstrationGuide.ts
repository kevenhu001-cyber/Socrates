/** App-owned mathematical runtime; models author algorithms and composition, not executable JS. */
export const DEMONSTRATION_GUIDANCE = `Build a new algorithmic demonstration without choosing a preset physics model. Arguments are JSON, not markup: program is an object whose version is the number 1, every list is a JSON array, and every numeric field is a JSON number. Never encode a list as {"item": [...]}, never wrap an array in tags, and never send "1" where a number belongs. The tool schema names every property and its type; the notes below define the mathematics.

A demonstration node is {"id":"demo","type":"demonstration","title":"...","program":{"version":1,"parameters":[],"definitions":{},"views":[]}}. All views share parameters, definitions, time t and optional ODE state. To drive an existing demonstration from the conversation, patch its program with changed parameter value fields: edited defaults apply immediately while unrelated manual control values survive. Set or change the optional resetKey string to restore all declared defaults, including a value equal to a previous default. This is the preferred route for novel mathematical/physical demonstrations and custom compositions.

Parameters: up to 12 entries with id, label, value, min, max and optional step, unit, advanced. IDs are ASCII identifiers, never x,y,t,pi,e or function names, and expressions must use exactly the same spelling (names are case-sensitive). min < max and value lies inside [min,max]. Definitions: up to 24 name:expression entries, where an expression is a number or mathematical string. Definitions can use each other in any order (no cycles), parameters, x,y,t and ODE states. They are reevaluated at the current sample coordinates/time, so refer to a definition by its name (f, not f(x)). Operators + - * / % ^ < > <= >= == != && || and condition ? yes : no; write powers as x^2, multiplication as * (2*x; 2x is also read as 2*x), pi for π. Angles are radians; convert degrees with deg*pi/180. Functions sin cos tan asin acos atan atan2 sqrt abs exp log (natural; ln is accepted) log10 pow min max floor ceil round sign hypot sinh cosh tanh clamp(v,min,max), sinc(z)=sin(z)/z with limit 1, sinratio(n,z)=sin(n*z)/(n*sin(z)) with removable singularities filled for integer n, besselJ1(z), airy(u)=[2J1(u)/u]^2 with limit 1. sum(i,first,last,expression) sums at most 1000 integer-indexed terms; iterate(v,initial,count,expression) applies a scalar recurrence at most 1000 times. if(condition,yes,no) is lazy. Use mathematical expressions, not JavaScript syntax; no Math. prefixes, property access, code, callbacks, imports, HTML or shaders. A sample that divides by zero or leaves a function's domain is drawn as a gap rather than failing the view, but keep the plotted range where the model is defined. Express new algorithms through definitions, sums, recurrences and ODEs. Each expression is ≤1600 characters and the entire program ≤40000.
Dynamics, optional: {"initial":{"X":1,"Y":1,"Z":1},"derivatives":{"X":"sigma*(X-Y)","Y":"X*(rho-Z)-Y","Z":"X*Y-beta*Z"},"duration":20,"step":0.01}. Initial values are numbers/parameter expressions; derivatives can use all current states, definitions and parameters. State IDs cannot collide with parameters/definitions/x/y/t. Up to 6 states, duration ≤30 seconds, step 0.002–0.05 and ≤10000 fixed RK4 steps. A program may instead specify duration for algebraic time animation without dynamics. Numeric dynamics may diverge; the app then keeps the history up to that time and stops there, so choose sensible steps/ranges and keep physical assumptions in prose.
Views are ordered freely (1–8). Every view has "kind" (not "type"). Axis bounds are a two-element JSON array [min,max] of finite numbers or expressions evaluated at the current time with x=y=0; use parameter-dependent bounds to keep important features visible, for example "y":[0,"max(1.12,1.12*total)"]. Bounds must remain finite, increasing and within ±1e6:

- controls: places the compact shared parameter sliders here. At most one; without it controls follow the views. Advanced parameters are disclosed separately. No tool or model selector is shown to the learner.
- plot: needs x, y and 1–6 curves of {expression, label?, color?, dashed?}, plus optional markers of {x, y, label?, color?}. It evaluates curves over x at current t with y=0. Up to 6 curves/view and 12 total. Colors: ink, muted, blue, orange, red, green, violet. Use multiple labeled curves, dashed envelopes, calibrated axes and markers when they clarify the phenomenon.
- field: needs x, y and expression, with optional palette (light, signed or heat), tint (three 0–1 channels), gamma, exposure, height (64–320) and vector (two expressions). It computes pixels locally. At most 2 field views. The light palette maps nonnegative physical intensity with separate display gamma/exposure; the signed palette distinguishes positive/negative fields; the optional vector pair overlays direction arrows. The field is 320 units wide; height 64–96 makes a compact intensity strip and 160 suits a 2:1 2D field. Match height to 320 times the y-span/x-span for geometrically faithful 2D fields. Never substitute circles or searched pictures for a calculated field.
- trajectory: needs x, y, horizontal and vertical, with optional color and labels. It draws the ODE history up to current t with a moving endpoint and requires dynamics. Use a plot for another projection or a time-dependent quantity.
- metrics: needs 1–6 values of {label, expression, unit?, digits? from 0 to 5} and displays live numerical readouts.
Optional presets: at most four label and values entries, where values maps a parameter id to a number; keep only meaningful scientific comparison states and omit unnecessary button rows. Keep explanatory prose and equations outside the demonstration. Prefer a focused scene, a shared set of 1–3 visible sliders, and linked views to a wall of controls. Do not print implementation details or require the user to choose tools. Existing native panels/text/metric/table/chart components may surround demonstrations. All algorithms remain bounded mathematical data; unsupported operations must be explained rather than imitated with fake visuals.
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
      properties: {
        initial: { type: 'object', maxProperties: 6, additionalProperties: EXPRESSION },
        derivatives: { type: 'object', maxProperties: 6, additionalProperties: { type: 'string', maxLength: 1600 } },
        duration: { type: 'number', exclusiveMinimum: 0, maximum: 30 },
        step: { type: 'number', minimum: 0.002, maximum: 0.05 },
      },
    },
    views: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object', required: ['kind'],
        properties: {
          kind: { type: 'string', enum: ['controls', 'plot', 'field', 'trajectory', 'metrics'] },
          label: { type: 'string', maxLength: 200 },
          xLabel: { type: 'string', maxLength: 200 },
          yLabel: { type: 'string', maxLength: 200 },
          x: AXIS, y: AXIS,
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
        properties: { label: { type: 'string', maxLength: 200 }, values: { type: 'object', additionalProperties: { type: 'number' } } },
      },
    },
  },
};
