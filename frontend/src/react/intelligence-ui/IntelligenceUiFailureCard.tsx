/**
 * The card a rejected `render_intelligent_ui` call leaves in the transcript.
 *
 * It used to render nothing (`state === 'error'` returned null), so after the
 * retry budget ran out the visual simply vanished. Now the reader keeps the
 * real title, one readable reason, the data as a table when the payload can
 * be recovered from the arguments, and a way to ask the model to repair it.
 */
import { extractVisualizationCalls, openUiSourcesOf } from './openui/visualizationSource';
import { VisualizationFailure, reasonFromToolFailure } from '../visualization/VisualizationStates';

export interface IntelligenceUiFailureCall {
  input?: unknown;
  argumentsText?: string;
  detail?: unknown;
  errorCode?: string | null;
  error?: string | null;
}

function argumentsOf(call: IntelligenceUiFailureCall): unknown {
  const input = call.input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if (record.nodes) return record;
    if (record.__raw !== undefined) return record.__raw;
  }
  return call.argumentsText ?? input;
}

function technicalDetail(call: IntelligenceUiFailureCall): string | null {
  const parts = [call.errorCode, typeof call.error === 'string' && call.error !== call.errorCode ? call.error : null];
  return parts.filter(Boolean).join(' · ').slice(0, 400) || null;
}

function failureStage(call: IntelligenceUiFailureCall): string {
  const detail = call.detail;
  return detail && typeof detail === 'object' && !Array.isArray(detail)
    ? String((detail as Record<string, unknown>).stage || '')
    : '';
}

/** The first demonstration node in the rejected arguments, for the card title. */
function demonstrationTitle(call: IntelligenceUiFailureCall): string | null {
  const input = argumentsOf(call);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  const node = nodes.find((item) => item && typeof item === 'object' && !Array.isArray(item)
    && String((item as { type?: unknown }).type || '').toLowerCase() === 'demonstration');
  const title = node && typeof (node as { title?: unknown }).title === 'string' ? (node as { title: string }).title.trim() : '';
  return title || null;
}

interface RepairContext {
  subject: string;
  target: string;
  node: string;
}

const openUiRepair = ({ subject, target }: RepairContext): string =>
  `The previous render_intelligent_ui call was rejected (${subject}). Call render_intelligent_ui again with a corrected program${target}: pass Visualization arguments in order (template, title, payload, accessibilitySummary), write values as JSON numbers with null for missing values, keep series as an array of {name,data}, and send fewer points if it was cut off.`;

/** A demonstration rejection must not teach the model the OpenUI payload
 * grammar: that turns one failed generation into a wrong retry. */
const STAGE_REPAIRS: Record<string, (context: RepairContext) => string> = {
  control: ({ subject }) => `The native control was rejected (${subject}). Keep the same component type and fix the located fields: slider/choice/toggle need safe bind; choice needs scalar options; button needs label and explicit action; table needs columns and rows; chart needs numeric points; tabs needs unique tab ids. Do not switch to OpenUI.`,
  learning: ({ subject }) => `The learning card was rejected (${subject}). Keep the native {id,type:"learning",kind,...} shape in render_intelligent_ui and fix the named fields. quiz needs q, 2-8 options {letter,text,explanation?}, and correct using existing letters (A or AC), or graded:false with no answer key. practice needs problem; definition needs body; flashcard needs front/back. Never guess an answer or change to OpenUI learning-card functions (Quiz, QuizCard, Question, QuestionCard, KnowledgeCard, MCQ).`,
  demonstration: ({ subject, node }) => `The previous render_intelligent_ui call was rejected (${subject}). Keep the same mathematical demonstration and fix the program structure${node} in one corrected call. A demonstration node is {id,type:"demonstration",title,program:{version:1,views:[...]}}. Required per view: plot needs x, y and 1-6 curves; field needs x, y and expression; trajectory needs x, y, horizontal, vertical and program.dynamics; scene needs x, y and 1-32 objects (body: center/radius; block: center/width/height; rod, spring, vector: from/to); metrics needs 1-6 values. At most one controls, two field views and twelve curves total. Use JSON numbers and arrays. Do not switch to an openui node or drop the demonstration.`,
  physics: ({ subject, node }) => `The previous render_intelligent_ui call was rejected (${subject}). Keep the physics node but use one of the documented scenes with numeric parameters inside their bounds${node}. Do not invent a scene; if the model is not reviewed, use a demonstration node instead.`,
  openui_truncated: ({ subject }) => `The previous render_intelligent_ui call was rejected (${subject}). The program was cut off while being written: send fewer points, shorter labels, or split the visual into smaller calls. Do not resend the same program.`,
  visualization: ({ subject }) => `The visualization was rejected (${subject}). Keep the native {id,type:"visualization",template,payload,...} shape in render_intelligent_ui and fix the data payload. Pass values as JSON numbers (null for missing), keep series as an array of {name,data}, and match category lengths. Do not wrap static visuals in OpenUI source strings.`,
  openui_syntax: openUiRepair,
  openui_program: openUiRepair,
  envelope_misuse: openUiRepair,
};

function repairPrompt(call: IntelligenceUiFailureCall, reason: string, technical: string | null, target: string): string {
  const detail = call.detail && typeof call.detail === 'object' && !Array.isArray(call.detail)
    ? call.detail as Record<string, unknown>
    : {};
  const stage = detail.truncated === true ? 'openui_truncated' : failureStage(call);
  const node = typeof detail.nodeId !== 'string' || !detail.nodeId
    ? ''
    : stage === 'demonstration' ? ` for demonstration node "${detail.nodeId}"`
      : stage === 'physics' ? ` for physics node "${detail.nodeId}"`
        : '';
  const subject = technical || reason;
  const build = STAGE_REPAIRS[stage];
  return build
    ? build({ subject, target, node })
    : `The previous render_intelligent_ui call was rejected (${subject}). Call render_intelligent_ui again with one corrected JSON argument object {version:1,nodes:[...]} with unique ids, valid node types, and a complete program or node. Do not wrap it in Markdown or an input/arguments object.`;
}

export function IntelligenceUiFailureCard({ call, readOnly }: { call: IntelligenceUiFailureCall; readOnly?: boolean }) {
  const visual = openUiSourcesOf(argumentsOf(call)).flatMap((source) => extractVisualizationCalls(source))[0];
  const reason = reasonFromToolFailure(call.detail, call.errorCode);
  const technical = technicalDetail(call);
  const data = visual?.payload && visual.template
    ? { version: 1, template: visual.template, title: visual.title || '', payload: visual.payload }
    : undefined;
  const target = visual?.template ? ` for the "${visual.template}" visual "${visual.title || ''}"` : '';
  const fixPrompt = repairPrompt(call, reason, technical, target);
  return (
    <VisualizationFailure
      title={visual?.title || demonstrationTitle(call) || null}
      reason={reason}
      data={data}
      details={technical}
      fixPrompt={fixPrompt}
      readOnly={readOnly}
    />
  );
}
