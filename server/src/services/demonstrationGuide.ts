export { DEMONSTRATION_GUIDANCE } from './demonstrationSections.js';

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
  description: 'Bounded scientific simulation DSL. Use get_ui_contract with kind demonstration and a focused section for advanced capabilities.',
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
    analysis:{anyOf:[{type:'object',required:['kind','expression','timeRange'],properties:{kind:{type:'string',enum:['fft']},expression:EXPRESSION,timeRange:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},samples:{type:'integer',minimum:32,maximum:2048},window:{type:'string',enum:['rectangular','hann']},removeMean:{type:'boolean'},lowpass:EXPRESSION}},{type:'object',required:['kind','matrix'],properties:{kind:{type:'string',enum:['eigen']},matrix:{type:'array',minItems:1,maxItems:8,items:{type:'array',minItems:1,maxItems:8,items:EXPRESSION}}}},{type:'object',required:['kind','parameter','range','expression'],properties:{kind:{type:'string',enum:['sweep']},parameter:{type:'string'},range:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},samples:{type:'integer',minimum:3,maximum:17},expression:EXPRESSION,time:{type:'number',minimum:0,maximum:300}}}]},
    finiteElement:{type:'object',required:['nodes','diffusion','source','left','right'],properties:{nodes:{type:'array',minItems:3,maxItems:257,items:{type:'number'}},diffusion:EXPRESSION,reaction:EXPRESSION,source:EXPRESSION,left:EXPRESSION,right:EXPRESSION}},
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
        method: { type: 'string', enum: ['rk4', 'rk45', 'sdirk2', 'grid-implicit', 'ssa', 'grid-heun','verlet'] },
        mechanics:{type:'object',required:['coordinates'],properties:{coordinates:{type:'array',minItems:1,maxItems:8,items:{type:'object',required:['position','velocity','initialPosition','initialVelocity','acceleration'],properties:{position:{type:'string'},velocity:{type:'string'},initialPosition:EXPRESSION,initialVelocity:EXPRESSION,acceleration:EXPRESSION}}}}},
        coupledFields:{type:'object',required:['dimension','nx','xDomain','boundary','fields'],properties:{dimension:{type:'integer',enum:[1,2]},nx:{type:'integer',minimum:3,maximum:257},ny:{type:'integer',minimum:3,maximum:33},xDomain:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},yDomain:{type:'array',minItems:2,maxItems:2,items:{type:'number'}},boundary:{type:'string',enum:['periodic','noFlux']},fields:{type:'array',minItems:1,maxItems:4,items:{type:'object',required:['id','initial','diffusivity'],properties:{id:{type:'string'},initial:EXPRESSION,diffusivity:EXPRESSION,reaction:EXPRESSION,advection:{type:'array',minItems:1,maxItems:2,items:EXPRESSION}}}}}},
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
                interpolation: {type:'string',enum:['linear','step','points','stem']},
                samples:{type:'integer',minimum:2,maximum:2049},
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
          presentation: { type: 'string', enum: ['map', 'surface', 'curve3d', 'vectors3d','parametricSurface','isosurface'] },
          isoLevel:EXPRESSION,
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

/** Provider-only projection of specialized contracts. Keep common view and
 * ODE fields detailed; specialized shapes remain named, with full constraints
 * enforced by the original schema and the semantic validator on the server. */
function compactShape(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ['type', 'enum']) if (schema[key] !== undefined) result[key] = schema[key];
  if (Array.isArray(schema.anyOf))
    result.anyOf = schema.anyOf.map((part) => compactShape(part as Record<string, unknown>));
  if (schema.items && typeof schema.items === 'object')
    result.items = compactShape(schema.items as Record<string, unknown>);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
    result.additionalProperties = compactShape(schema.additionalProperties as Record<string, unknown>);
  if (schema.properties && typeof schema.properties === 'object') {
    result.properties = Object.fromEntries(Object.entries(schema.properties).map(
      ([name, value]) => [name, compactShape(value as Record<string, unknown>)],
    ));
    if (Array.isArray(schema.required)) result.required = schema.required;
  }
  return result;
}
const FULL = DEMONSTRATION_PROGRAM_SCHEMA.properties;
const DYNAMICS = FULL.dynamics.properties;
const VIEW = FULL.views.items.properties;
export const COMPACT_DEMONSTRATION_PROGRAM_SCHEMA = {
  ...DEMONSTRATION_PROGRAM_SCHEMA,
  properties: {
    ...FULL,
    ...Object.fromEntries(['analysis','finiteElement','optimization','nonlinearSystem','sparseSystem','linearAlgebra'].map(
      (key) => [key, compactShape(FULL[key as keyof typeof FULL])],
    )),
    dynamics: {
      ...FULL.dynamics,
      properties: {
        ...DYNAMICS,
        ...Object.fromEntries(['mechanics','coupledFields','spatial','reactionNetwork','stateSpace','circuit','algebraic','massMatrix'].map(
          (key) => [key, compactShape(DYNAMICS[key as keyof typeof DYNAMICS])],
        )),
      },
    },
    views: {
      ...FULL.views,
      items: {
        ...FULL.views.items,
        properties: {
          ...VIEW,
          ...Object.fromEntries(['surface3d','slicePlane','curve3d','vector3d','parameterRange','uRange','vRange','zRange'].map(
            (key) => [key, compactShape(VIEW[key as keyof typeof VIEW])],
          )),
        },
      },
    },
  },
};
