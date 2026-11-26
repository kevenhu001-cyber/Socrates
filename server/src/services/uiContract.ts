/**
 * Focused, paginated Intelligent UI contract discovery.
 * All text comes from the same validated template/runtime metadata used
 * by the full renderer, not a second manually maintained prompt.
 */
import { INTELLIGENT_UI_CONTROL_GUIDANCE } from '@socrates/core/intelligentUiControls';
import { LEARNING_UI_GUIDANCE } from '@socrates/core/learningUi';
import { PHYSICS_MODELS } from '@socrates/core/physicsModelRegistry';
import { DEMONSTRATION_GUIDANCE } from './demonstrationGuide.js';
import { DEMONSTRATION_SECTIONS, demonstrationSectionContent, demonstrationSectionIndex, type DemonstrationSection } from './demonstrationSections.js';
import { OPENUI_TOOL_GUIDANCE } from './openUiPrompt.generated.js';
import { VISUALIZATION_TEMPLATES, VISUALIZATION_TEMPLATE_CONTRACTS } from './visualization.js';

const PAGE_SIZE = 5000;
const KINDS = [
  'visualization',
  'learning',
  'physics',
  'demonstration',
  'openui',
  'controls',
] as const;

export const GET_UI_CONTRACT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_ui_contract',
    description:
      'Get the exact advanced Intelligent UI contract only when render_intelligent_ui compact schema is insufficient. Use kind; for a visualization also provide its template for a validated example. For demonstration, use section (index lists available sections; basics, expressions, ode, electrical, pde, chemistry, algebra, analysis, plots, geometry3d, scenes, examples). Long contracts are paginated: request page 2, 3, etc as needed. Common bar/line/pie/function charts do not need this lookup.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: [...KINDS] },
        template: { type: 'string', enum: VISUALIZATION_TEMPLATES },
        section: { type: 'string', enum: ['index', ...Object.keys(DEMONSTRATION_SECTIONS)] },
        page: { type: 'integer', minimum: 1 },
      },
    },
  },
};

export function uiContractContent(
  args: Record<string, unknown>,
): { ok: true; output: string; page: number; pages: number } | { ok: false; error: string } {
  const kind = args.kind;
  if (typeof kind !== 'string' || !KINDS.some((candidate) => candidate === kind))
    return { ok: false, error: 'Choose a kind from the get_ui_contract schema.' };
  if (args.section !== undefined && kind !== 'demonstration')
    return { ok: false, error: 'section is only supported for demonstration contracts.' };
  let content: string;
  if (kind === 'visualization') {
    const template = args.template;
    if (template === undefined)
      content =
        'Available templates: ' +
        VISUALIZATION_TEMPLATES.join(', ') +
        '. Provide template to retrieve its exact payload structure and executable example.';
    else if (
      typeof template !== 'string' ||
      !Object.hasOwn(VISUALIZATION_TEMPLATE_CONTRACTS, template)
    )
      return { ok: false, error: 'Unknown visualization template.' };
    else {
      const contract =
        VISUALIZATION_TEMPLATE_CONTRACTS[template as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS];
      content = [
        'Native tool: render_intelligent_ui. Arguments are one JSON object with nodes array; version and id are optional.',
        'Template: ' + template,
        contract.guidance,
        'Verified example arguments: ' +
          JSON.stringify({
            nodes: [
              {
                type: 'visualization',
                template,
                title: 'Example',
                accessibilitySummary: 'Example of ' + template,
                payload: contract.payload,
              },
            ],
          }),
      ].join('\n');
    }
  } else if (kind === 'learning') {
    content = LEARNING_UI_GUIDANCE;
  } else if (kind === 'physics') {
    content =
      'Physics node: {"type":"physics","scene":"<scene>","parameters":{...}}\n' +
      JSON.stringify(
        PHYSICS_MODELS.map((model) => ({
          scene: model.id,
          assumptions: model.assumption,
          parameters: model.parameters,
        })),
      );
  } else if (kind === 'demonstration') {
    const section = args.section;
    if (section === undefined) content = DEMONSTRATION_GUIDANCE; // Legacy full contract pagination.
    else if (section === 'index') content = demonstrationSectionIndex();
    else if (typeof section === 'string' && Object.hasOwn(DEMONSTRATION_SECTIONS, section))
      content = demonstrationSectionContent(section as DemonstrationSection);
    else return { ok: false, error: 'Unknown demonstration section; request section index.' };
  } else if (kind === 'openui') {
    content = OPENUI_TOOL_GUIDANCE;
  } else {
    content = INTELLIGENT_UI_CONTROL_GUIDANCE;
  }
  const pages = Math.max(1, Math.ceil(content.length / PAGE_SIZE));
  const page = args.page === undefined ? 1 : args.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > pages)
    return { ok: false, error: `page must be an integer between 1 and ${pages}` };
  return {
    ok: true,
    page,
    pages,
    output:
      `Contract ${kind}${args.template ? ':' + args.template : ''}${args.section ? ':' + args.section : ''}, page ${page}/${pages}:\n` +
      content.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}
