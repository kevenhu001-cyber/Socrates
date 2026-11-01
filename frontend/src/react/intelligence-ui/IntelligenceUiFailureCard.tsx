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

export function IntelligenceUiFailureCard({ call, readOnly }: { call: IntelligenceUiFailureCall; readOnly?: boolean }) {
  const visual = openUiSourcesOf(argumentsOf(call)).flatMap((source) => extractVisualizationCalls(source))[0];
  const reason = reasonFromToolFailure(call.detail, call.errorCode);
  const technical = technicalDetail(call);
  const data = visual?.payload && visual.template
    ? { version: 1, template: visual.template, title: visual.title || '', payload: visual.payload }
    : undefined;
  const target = visual?.template ? ` for the "${visual.template}" visual "${visual.title || ''}"` : '';
  const fixPrompt = `The previous render_intelligent_ui call was rejected (${technical || reason}). Call render_intelligent_ui again with a corrected program${target}: pass Visualization arguments in order (template, title, payload, accessibilitySummary), write values as JSON numbers with null for missing values, keep series as an array of {name,data}, and send fewer points if it was cut off.`;
  return (
    <VisualizationFailure
      title={visual?.title || null}
      reason={reason}
      data={data}
      details={technical}
      fixPrompt={fixPrompt}
      readOnly={readOnly}
    />
  );
}
