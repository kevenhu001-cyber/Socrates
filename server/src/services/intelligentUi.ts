import { LEARNING_KINDS, openUiLearningMisuse } from '@socrates/core/learningUi';
import {
  DEMONSTRATION_PROGRAM_SCHEMA,
  COMPACT_DEMONSTRATION_PROGRAM_SCHEMA,
} from './demonstrationGuide.js';
import { PHYSICS_MODELS } from '@socrates/core/physicsModelRegistry';
import { VISUALIZATION_TEMPLATES, validateVisualizationSpec } from './visualization.js';
import { validateIntelligentUi as validateEnvelope } from '@socrates/core/intelligentUiValidation';
import { normalizeIntelligentUiArgs } from './intelligentUiNormalize.js';
import { inspectOpenUiProgram } from './openUiProgram.js';
import type { IntelligentUiFailure } from './intelligentUiFeedback.js';
const TYPES = [
  'panel',
  'stack',
  'grid',
  'text',
  'metric',
  'progress',
  'divider',
  'callout',
  'slider',
  'choice',
  'toggle',
  'button',
  'table',
  'chart',
  'tabs',
  'entity',
  'image',
  'image-gallery',
  'accordion',
  'steps',
  'badge',
  'physics',
  'demonstration',
  'learning',
  'visualization',
  'openui',
];
export const INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_intelligent_ui',
    description:
      'Render charts, diagrams, learning cards, physics simulations and interactive UI. Smallest valid call: {"nodes":[{"type":"visualization","template":"bar","payload":{"categories":["A"],"series":[{"data":[1]}]}}]}. The server supplies version=1 and stable node IDs when omitted. Use explicit IDs for parent references or state bindings. For uncommon visualizations and advanced physics or OpenUI, query get_ui_contract. For simulations query kind demonstration with a focused section; do not retrieve the whole guide. Keep the mathematical and physical data precise; only omit redundant envelope metadata. Accepts native visualization, learning, physics, demonstration, openui, layout, controls and media nodes. Strict JSON only, no XML, JS or HTML; keep essential conclusions in prose.',

    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['nodes'],
      properties: {
        version: { type: 'integer', enum: [1] },
        nodes: {
          type: 'array',
          minItems: 1,
          maxItems: 80,
          description:
            'Keep the whole serialized nodes array under 60000 characters; a single openui source counts toward that cap.',
          items: {
            type: 'object',
            required: ['type'],
            description:
              'id optional unless referenced by parent/state; version and IDs are supplied by the server. Visualization uses template+payload; title and accessibilitySummary default. Learning uses kind; physics uses scene; demonstration uses program; openui uses source. Advanced syntax: get_ui_contract.',
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              type: { type: 'string', enum: TYPES },
              parent: { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              template: {
                type: 'string',
                enum: VISUALIZATION_TEMPLATES,
                description:
                  'For visualization. bar/line/area/stacked_bar: payload {categories:[...],series:[{name,data:[1,2]}]}; pie/donut/funnel: same shape with one non-negative series; combo: each series adds kind "bar", "line" or "area" and shares a y axis; function: {functions:[{expression:"sin(x)"}]}; flowchart: {nodes:[{id,label}],edges:[{from,to}]}. Other exact payloads: get_ui_contract({kind:"visualization",template:"..."}).',
              },
              payload: {
                type: 'object',
                description:
                  'Required for visualization nodes; a chart node accepts the same payload. Template data payload (e.g. {categories, series} for bar/line/pie/radar, {functions} for function, {values, xCategories, yCategories} for heatmap).',
              },
              accessibilitySummary: {
                type: 'string',
                maxLength: 2000,
                description: 'Short accessible text summary of the visualization.',
              },
              kind: {
                type: 'string',
                enum: ['bar', 'line', ...LEARNING_KINDS],
                description:
                  'Chart uses bar/line; learning uses the listed kinds. Advanced learning fields: get_ui_contract({kind:"learning"}).',
              },
              q: {
                type: 'string',
                maxLength: 8000,
                description: 'Learning quiz question, without revealing its answer.',
              },
              correct: {
                type: 'string',
                maxLength: 8000,
                description:
                  'Quiz: existing letters only (A or AC), omitted for graded:false. Practice: optional answer key.',
              },
              graded: {
                type: 'boolean',
                description:
                  'Quiz only. Defaults to graded; false explicitly records a choice with no answer key.',
              },
              multi: {
                type: 'boolean',
                description:
                  'Quiz multiple selection; inferred when correct contains several letters.',
              },
              explanation: {
                type: 'string',
                maxLength: 8000,
                description: 'Quiz explanation, hidden until submission.',
              },
              problem: { type: 'string', maxLength: 8000 },
              solution: { type: 'string', maxLength: 8000 },
              hint: { type: 'string', maxLength: 8000 },
              hints: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 4000 } },
              term: { type: 'string', maxLength: 400 },
              body: { type: 'string', maxLength: 8000 },
              front: { type: 'string', maxLength: 8000 },
              back: { type: 'string', maxLength: 8000 },
              statement: { type: 'string', maxLength: 8000 },
              n: { type: 'integer', minimum: 1, maximum: 100 },
              program: {
                ...DEMONSTRATION_PROGRAM_SCHEMA,
                description:
                  'Demonstration DSL: version is the number 1, views is a JSON array (never {"item":[...]}). For algorithms, derivatives, sum(i,first,last,expression) and dynamics query get_ui_contract({kind:"demonstration",section:"index"}); fetch only needed sections, e.g. expressions, ode, electrical, pde, chemistry, algebra, analysis, plots, geometry3d.',
              },
              scene: {
                type: 'string',
                enum: PHYSICS_MODELS.map((model) => model.id),
                description:
                  'Required for physics nodes. Select the matching reviewed physical model.',
              },
              parameters: {
                type: 'object',
                additionalProperties: { type: 'number' },
                description:
                  'Physics numeric parameters; omitted parameters take reviewed defaults. For exact units and bounds, call get_ui_contract({kind:"physics"}).',
              },
              separation: {
                type: 'number',
                minimum: 0.2,
                maximum: 3,
                description:
                  'Initial angular separation in reference Airy radii (550 nm / 100 mm). Default 2.4.',
              },
              wavelength: {
                type: 'number',
                minimum: 380,
                maximum: 750,
                description: 'Wavelength in nm, default 550.',
              },
              aperture: {
                type: 'number',
                minimum: 10,
                maximum: 300,
                description: 'Circular aperture diameter in mm, default 100.',
              },
              source: {
                type: 'string',
                maxLength: 50000,
                description:
                  'Declarative OpenUI source with root = Col([...]). Use StepPlayer for local staged playback, ViewSwitcher for alternate views, Table with sortable=true for local sorting, and NumberField or Slider for bound inputs. For exact signatures and examples call get_ui_contract({kind:"openui",page:1}) when supplied, then read further pages as needed.',
              },
              title: { description: 'Plain text or local value expression.' },
              description: { description: 'Plain text or local value expression.' },
              text: { description: 'Text node or callout content, plain text or expression.' },
              label: { description: 'Accessible control, metric or progress label.' },
              value: {
                description:
                  'Literal scalar or {state:key}, {tool:callId,path:field}, {op,args} expression.',
              },
              prefix: { type: 'string' },
              suffix: { type: 'string' },
              displayValue: { description: 'Optional formatted control or progress value.' },
              state: {
                type: 'object',
                description: 'Initial local state on a root node. Use safe keys.',
              },
              bind: {
                type: 'string',
                description: 'State key changed by slider/choice/toggle/tabs controls.',
              },
              min: { type: 'number' },
              max: { type: 'number' },
              step: { type: 'number' },
              checked: {
                type: 'boolean',
                description: 'Toggle value when root state declares no default.',
              },
              tone: {
                type: 'string',
                enum: ['neutral', 'info', 'success', 'warning', 'danger'],
                description: 'Callout or progress emphasis.',
              },
              delta: { description: 'Metric change, literal or expression.' },
              trend: {
                type: 'string',
                enum: ['up', 'down', 'flat'],
                description: 'Metric direction; inferred from delta when omitted.',
              },
              caption: { type: 'string', description: 'Table caption for assistive technology.' },
              when: { description: 'Boolean or value expression controlling visibility.' },
              columns: { description: 'Grid: number of columns. Table: [{key,label}].' },
              rows: {
                type: 'array',
                maxItems: 24,
                description: 'Table rows, keyed by column keys.',
              },
              points: {
                type: 'array',
                maxItems: 50,
                description:
                  'Legacy chart shorthand: [{label,value}] becomes one bar or line series. Prefer template+payload whenever the chart needs a function, axis labels, a legend or more than 50 points.',
              },
              options: {
                type: 'array',
                maxItems: 8,
                description:
                  'Choice nodes: [{label,value}]. Learning quiz nodes: 2-8 {letter,text,explanation?} options.',
                items: {
                  type: 'object',
                  properties: {
                    letter: { type: 'string', pattern: '^[A-H]$' },
                    text: { type: 'string', maxLength: 2000 },
                    explanation: { type: 'string', maxLength: 4000 },
                    label: { type: 'string' },
                    value: {},
                  },
                },
              },
              tabs: { type: 'array', maxItems: 8, description: 'Tabs: [{id,label}].' },
              tab: { type: 'string', description: 'Child of tabs: the tab id that owns it.' },
              fields: {
                type: 'array',
                maxItems: 20,
                description: 'Entity fields: [{label,value}].',
              },
              image: { type: 'string', description: 'Absolute credential-free HTTP(S) image URL.' },
              images: {
                type: 'array',
                maxItems: 8,
                description: 'Gallery images: [{src,alt,caption}]. HTTP(S) only.',
              },
              actionLabel: { type: 'string' },
              primary: { type: 'boolean' },
              action: {
                type: 'object',
                description:
                  'Button/entity action: {type:set,key,value}, {type:increment,key,amount}, {type:prompt,prompt}, {type:open_url,url}.',
              },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

/** Compact request schema only; never use this for argument repair. */
export const INTELLIGENT_UI_PROVIDER_TOOL = {
  ...INTELLIGENT_UI_TOOL,
  function: {
    ...INTELLIGENT_UI_TOOL.function,
    parameters: {
      ...INTELLIGENT_UI_TOOL.function.parameters,
      properties: {
        ...INTELLIGENT_UI_TOOL.function.parameters.properties,
        nodes: {
          ...INTELLIGENT_UI_TOOL.function.parameters.properties.nodes,
          items: {
            ...INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items,
            properties: {
              ...INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties,
              program: {
                ...COMPACT_DEMONSTRATION_PROGRAM_SCHEMA,
                description:
                  INTELLIGENT_UI_TOOL.function.parameters.properties.nodes.items.properties.program
                    .description,
              },
            },
          },
        },
      },
    },
  },
};

export type IntelligentUiValidation =
  | { ok: true; visualizations: Array<Record<string, unknown>>; warnings: string[] }
  | { ok: false; error: string; failure: IntelligentUiFailure };

/**
 * Validate the envelope, actions and every OpenUI program. Accepted
 * visualizations are returned NORMALIZED (the exact spec the client renders)
 * and tagged with the node they came from, so the client can prefer them
 * over re-deriving the spec from raw program props.
 */
export function validateIntelligentUi(value: unknown): IntelligentUiValidation {
  const document = normalizeIntelligentUiArgs(value);
  const envelope = validateEnvelope(document);
  const fail = (
    error: string,
    stage: IntelligentUiFailure['stage'],
    nodeId: string | null = null,
    extra: Partial<IntelligentUiFailure> = {},
  ): IntelligentUiValidation => ({
    ok: false,
    error,
    failure: { stage, nodeId, failures: [], sourceChars: 0, ...extra },
  });
  if (!envelope.ok) {
    /* A demonstration/physics rejection is a node-level problem, not a
       malformed envelope: name it so the correction and the reader-facing
       message can say what actually failed. */
    const stage: IntelligentUiFailure['stage'] =
      envelope.kind === 'demonstration'
        ? 'demonstration'
        : envelope.kind === 'physics'
          ? 'physics'
          : envelope.kind === 'control'
            ? 'control'
            : envelope.kind === 'learning'
              ? 'learning'
              : 'envelope';
    const nodes = (document as { nodes?: unknown } | null)?.nodes;
    const rejectedNode =
      envelope.nodeId && Array.isArray(nodes)
        ? (nodes as Array<Record<string, unknown> | null>).find(
            (node) => node?.id === envelope.nodeId,
          )
        : undefined;
    return fail(envelope.error, stage, envelope.nodeId ?? null, {
      componentType: typeof rejectedNode?.type === 'string' ? rejectedNode.type : undefined,
      componentKind: typeof rejectedNode?.kind === 'string' ? rejectedNode.kind : undefined,
      ...(Array.isArray(envelope.issues) && envelope.issues.length
        ? { issues: envelope.issues }
        : {}),
    });
  }
  const visualizations: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  for (const node of (
    document as {
      nodes: Array<{
        id: string;
        type: string;
        source?: string;
        action?: { type?: string; key?: string; prompt?: unknown; url?: unknown };
      }>;
    }
  ).nodes) {
    if (node.type === 'button' || node.action) {
      const action = node.action;
      if (!action || !['set', 'increment', 'prompt', 'open_url'].includes(action.type || ''))
        return fail(`UI ${node.id}: supply a supported explicit button action`, 'action', node.id);
      if (
        ['set', 'increment'].includes(action.type!) &&
        (typeof action.key !== 'string' ||
          !/^[A-Za-z0-9._:-]{1,80}$/.test(action.key) ||
          ['__proto__', 'constructor', 'prototype'].includes(action.key))
      )
        return fail(`UI ${node.id}: local actions need a safe state key`, 'action', node.id);
      if (action.type === 'set' && !('value' in action))
        return fail(`UI ${node.id}: set action needs a value`, 'action', node.id);
      if (action.type === 'prompt' && !action.prompt)
        return fail(`UI ${node.id}: prompt action needs prompt content`, 'action', node.id);
      if (action.type === 'open_url' && !action.url)
        return fail(`UI ${node.id}: open_url action needs a URL`, 'action', node.id);
    }
    if (node.type === 'visualization') {
      const vizNode = node as {
        id: string;
        template?: string;
        payload?: unknown;
        title?: unknown;
        caption?: unknown;
        accessibilitySummary?: unknown;
      };
      const spec = {
        version: 1,
        template: vizNode.template,
        title: typeof vizNode.title === 'string' ? vizNode.title : undefined,
        caption: typeof vizNode.caption === 'string' ? vizNode.caption : undefined,
        accessibilitySummary:
          typeof vizNode.accessibilitySummary === 'string'
            ? vizNode.accessibilitySummary
            : undefined,
        payload: vizNode.payload,
      };
      const validation = validateVisualizationSpec(spec);
      if (!validation.ok) {
        const issues = validation.issues.map((issue) => ({
          path: `nodes.${node.id}.${issue.path}`,
          message: issue.message,
        }));
        const errorText = issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
        return fail(`Visualization ${node.id}: ${errorText}`, 'visualization', node.id, {
          componentType: 'visualization',
          componentKind: vizNode.template,
          failures: [
            {
              stage: validation.stage,
              template: validation.template ?? null,
              title: typeof vizNode.title === 'string' ? vizNode.title : null,
              issues: validation.issues,
            },
          ],
          issues,
        });
      }
      if (visualizations.length < 8) {
        visualizations.push({ ...validation.spec, nodeId: node.id, index: 0 });
      }
      if (Array.isArray(validation.warnings)) {
        warnings.push(...validation.warnings);
      }
      continue;
    }
    if (node.type === 'table') {
      const record = node as Record<string, unknown>;
      const docState = (document as { state?: Record<string, unknown> }).state;
      const hasInteractive = Boolean(
        record.bind ||
        record.value ||
        record.parent ||
        (docState && Object.keys(docState).length > 0),
      );
      if (!hasInteractive) {
        warnings.push(
          `Node "${node.id}": static table rendered via intelligent_ui; prefer standard Markdown tables in prose for static comparisons`,
        );
      }
    }
    if (node.type !== 'openui') continue;
    const inspected = inspectOpenUiProgram(node.source!);
    if (inspected.issues.length) {
      /* A hallucinated learning component is a learning-card mistake, not a
         chart mistake: it must be repaired with the learning contract, or the
         model pivots into payload advice and repeats the same mistake. The
         component name comes from the issue itself, so `QuestionCard` and
         `QuizCard` are caught too. */
      const misuseComponents = openUiLearningMisuse(inspected.issues);
      const learningMisuse = misuseComponents.length > 0;
      const stage: IntelligentUiFailure['stage'] = inspected.incomplete
        ? 'openui_truncated'
        : learningMisuse
          ? 'learning'
          : inspected.failures.length
            ? 'visualization'
            : inspected.unparseable
              ? 'openui_syntax'
              : 'openui_program';
      return fail(`OpenUI ${node.id}: ${inspected.issues.join('; ')}`, stage, node.id, {
        failures: inspected.failures,
        sourceChars: node.source!.length,
        ...(learningMisuse
          ? {
              issues: [
                ...inspected.issues.map((message) => ({
                  path: `nodes.${node.id}.source`,
                  message,
                })),
                {
                  path: `nodes.${node.id}.source`,
                  message: `${misuseComponents.join(', ')} is not an OpenUI component. Use a native learning node instead: {id,type:"learning",kind:"quiz",q:"Question",options:[{letter:"A",text:"First",explanation:"Why"},{letter:"B",text:"Second",explanation:"Why"}],correct:"A"}.`,
                },
              ],
            }
          : {}),
      });
    }
    let index = 0;
    for (const spec of inspected.visualizations) {
      if (visualizations.length >= 8) break;
      visualizations.push({ ...spec, nodeId: node.id, index: index++ });
    }
    warnings.push(...inspected.warnings);
  }
  return { ok: true, visualizations, warnings: [...new Set(warnings)].slice(0, 8) };
}
