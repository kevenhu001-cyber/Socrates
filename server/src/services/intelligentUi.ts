import { DEMONSTRATION_GUIDANCE, DEMONSTRATION_PROGRAM_SCHEMA } from './demonstrationGuide.js';
import { PHYSICS_MODELS } from '../../../packages/core/src/physicsModelRegistry.js';
import { visualizationTemplateGuide } from './visualization.js';
import { validateIntelligentUi as validateEnvelope } from '../../../packages/core/src/intelligentUiValidation.js';
import { normalizeIntelligentUiArgs } from './intelligentUiNormalize.js';
import { inspectOpenUiProgram } from './openUiProgram.js';
import { OPENUI_TOOL_GUIDANCE } from './openUiPrompt.generated.js';
import type { IntelligentUiFailure } from './intelligentUiFeedback.js';
const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'toggle', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery', 'physics', 'demonstration', 'openui'];
export const INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_intelligent_ui',
    description: 'Render reader-facing visuals and interactive UI alongside prose. Use this single tool for static or interactive charts, function graphs, diagrams, timelines, comparisons, simulations and illustrations. Choose one of three shapes: a chart node for a quick bar or line series of at most 50 labelled points; a demonstration node when the visual needs its own mathematical model, parameters or live fields; otherwise one openui node whose source calls Visualization(template, title, payload, accessibilitySummary). Arguments are JSON, not markup: arrays are JSON arrays, numeric fields are JSON numbers, and version is the number 1. Never wrap a list in {"item": [...]}, never use XML-style tags for arguments, and never send "1" where a number belongs. For new algorithmic demonstrations and freely composed physical/mathematical models, prefer a demonstration node with program as documented in the program property. It can define new mathematical expressions, sums, recurrences and ODEs and link fields, plots, trajectories, markers and controls; it is not limited to named scenes. For an existing reviewed physical simulation, a convenient starting point is a direct native node {id, type:"physics", scene, title, parameters:{...}}. Supported models are rayleigh, wave-interference, electric-field, harmonic-oscillator, pendulum and projectile. The app computes physical fields/trajectories locally with Canvas, vector overlays, time plots and numerical readouts; no plugin, remote simulation or OpenUI source is needed. Choose the model that matches the actual concept; do not misuse Rayleigh for unrelated physics. The parameters property supplies the exact model-specific contracts. Compose multiple physics nodes with native text/chart/table nodes when comparison helps. This is a bounded library, not an arbitrary physics solver; explain unsupported models rather than inventing a scene. Choose useful controls proactively; do not ask users to choose tools or rendering technology. Nodes have unique id/type and optional parent. Root state and bind support local controls: slider, choice, toggle and tabs. Values support {state:key}, {tool:callId,path:field}, or {op:add|sub|mul|div|round|min|max|eq|if|concat,args:[]}. Actions: set, increment, prompt, open_url. Tables use columns and rows. Callouts and progress bars accept tone:neutral|info|success|warning|danger; metrics accept delta and trend:up|down|flat. No HTML, CSS, JS or executable handlers. Emit parents before children and write each complete node before starting the next. Keep essential conclusions in prose. After success, the surface ID is this tool call ID and revision is 0. Use patch_intelligent_ui to modify it in this turn while preserving local controls.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['version', 'nodes'],
      properties: {
        version: { type: 'integer', enum: [1] },
        nodes: {
          type: 'array', minItems: 1, maxItems: 80,
          items: {
            type: 'object', required: ['id', 'type'],
            description: 'A demonstration node requires program; a physics node requires scene; an openui node requires source.',
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              type: { type: 'string', enum: TYPES },
              parent: { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              program: { ...DEMONSTRATION_PROGRAM_SCHEMA, description: 'Required for demonstration nodes, omitted for other node types. ' + DEMONSTRATION_GUIDANCE },
              scene: { type: 'string', enum: PHYSICS_MODELS.map(model => model.id), description: 'Required for physics nodes. Select the matching reviewed physical model.' },
              parameters: { type: 'object', additionalProperties: { type: 'number' }, description: 'Physics nodes only. Native physics model parameters; omitted fields use defaults. For demonstration nodes put parameters inside program.parameters. Exact units and bounds by scene: ' + JSON.stringify(PHYSICS_MODELS.map(model => ({ scene: model.id, assumptions: model.assumption, parameters: model.parameters }))) },
              separation: { type: 'number', minimum: .2, maximum: 3, description: 'Initial angular separation in reference Airy radii (550 nm / 100 mm). Default 2.4.' },
              wavelength: { type: 'number', minimum: 380, maximum: 750, description: 'Wavelength in nm, default 550.' },
              aperture: { type: 'number', minimum: 10, maximum: 300, description: 'Circular aperture diameter in mm, default 100.' },
              source: { type: 'string', maxLength: 50000, description: 'Required for openui nodes. ' + OPENUI_TOOL_GUIDANCE + '\nSupported Visualization templates and exact payload contracts:\n' + visualizationTemplateGuide() },
              title: { description: 'Plain text or local value expression.' },
              description: { description: 'Plain text or local value expression.' },
              text: { description: 'Text node or callout content, plain text or expression.' },
              label: { description: 'Accessible control, metric or progress label.' },
              value: { description: 'Literal scalar or {state:key}, {tool:callId,path:field}, {op,args} expression.' },
              prefix: { type: 'string' }, suffix: { type: 'string' },
              displayValue: { description: 'Optional formatted control or progress value.' },
              state: { type: 'object', description: 'Initial local state on a root node. Use safe keys.' },
              bind: { type: 'string', description: 'State key changed by slider/choice/toggle/tabs controls.' },
              min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
              checked: { type: 'boolean', description: 'Toggle value when root state declares no default.' },
              tone: { type: 'string', enum: ['neutral', 'info', 'success', 'warning', 'danger'], description: 'Callout or progress emphasis.' },
              delta: { description: 'Metric change, literal or expression.' },
              trend: { type: 'string', enum: ['up', 'down', 'flat'], description: 'Metric direction; inferred from delta when omitted.' },
              caption: { type: 'string', description: 'Table caption for assistive technology.' },
              when: { description: 'Boolean or value expression controlling visibility.' },
              columns: { description: 'Grid: number of columns. Table: [{key,label}].' },
              rows: { type: 'array', maxItems: 50, description: 'Table rows, keyed by column keys.' },
              kind: { type: 'string', enum: ['bar', 'line'], description: 'Chart style.' },
              points: { type: 'array', maxItems: 50, description: 'Chart values: [{label,value}].' },
              options: { type: 'array', maxItems: 8, description: 'Choice options: [{label,value}].' },
              tabs: { type: 'array', maxItems: 8, description: 'Tabs: [{id,label}].' },
              tab: { type: 'string', description: 'Child of tabs: the tab id that owns it.' },
              fields: { type: 'array', maxItems: 20, description: 'Entity fields: [{label,value}].' },
              image: { type: 'string', description: 'Absolute credential-free HTTP(S) image URL.' },
              images: { type: 'array', maxItems: 8, description: 'Gallery images: [{src,alt,caption}]. HTTP(S) only.' },
              actionLabel: { type: 'string' }, primary: { type: 'boolean' },
              action: { type: 'object', description: 'Button/entity action: {type:set,key,value}, {type:increment,key,amount}, {type:prompt,prompt}, {type:open_url,url}.' },
            },
            additionalProperties: true,
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
  const fail = (error: string, stage: IntelligentUiFailure['stage'], nodeId: string | null = null, extra: Partial<IntelligentUiFailure> = {}): IntelligentUiValidation => ({
    ok: false, error, failure: { stage, nodeId, failures: [], sourceChars: 0, ...extra },
  });
  if (!envelope.ok) {
    /* A demonstration/physics rejection is a node-level problem, not a
       malformed envelope: name it so the correction and the reader-facing
       message can say what actually failed. */
    const stage: IntelligentUiFailure['stage'] = envelope.kind === 'demonstration' ? 'demonstration'
      : envelope.kind === 'physics' ? 'physics'
        : 'envelope';
    return fail(envelope.error, stage, envelope.nodeId ?? null, {
      ...(Array.isArray(envelope.issues) && envelope.issues.length ? { issues: envelope.issues } : {}),
    });
  }
  const visualizations: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  for (const node of (document as { nodes: Array<{ id: string; type: string; source?: string; action?: { type?: string; key?: string; prompt?: unknown; url?: unknown } }> }).nodes) {
    if (node.type === 'button' || node.action) {
      const action = node.action;
      if (!action || !['set', 'increment', 'prompt', 'open_url'].includes(action.type || '')) return fail(`UI ${node.id}: supply a supported explicit button action`, 'action', node.id);
      if (['set', 'increment'].includes(action.type!) && (typeof action.key !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(action.key) || ['__proto__', 'constructor', 'prototype'].includes(action.key))) return fail(`UI ${node.id}: local actions need a safe state key`, 'action', node.id);
      if (action.type === 'set' && !('value' in action)) return fail(`UI ${node.id}: set action needs a value`, 'action', node.id);
      if (action.type === 'prompt' && !action.prompt) return fail(`UI ${node.id}: prompt action needs prompt content`, 'action', node.id);
      if (action.type === 'open_url' && !action.url) return fail(`UI ${node.id}: open_url action needs a URL`, 'action', node.id);
    }
    if (node.type !== 'openui') continue;
    const inspected = inspectOpenUiProgram(node.source!);
    if (inspected.issues.length) {
      const stage: IntelligentUiFailure['stage'] = inspected.incomplete ? 'openui_truncated'
        : inspected.failures.length ? 'visualization'
          : inspected.unparseable ? 'openui_syntax' : 'openui_program';
      return fail(`OpenUI ${node.id}: ${inspected.issues.join('; ')}`, stage, node.id, {
        failures: inspected.failures,
        sourceChars: node.source!.length,
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
