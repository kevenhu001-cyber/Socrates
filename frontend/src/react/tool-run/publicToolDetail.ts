import { toolOutputsOf } from './toolOutputs.ts';
import type { ToolCallRecord, ToolRunView } from './toolRunModel.types.ts';

function imageOutputsOf(call: ToolCallRecord | undefined) {
  return toolOutputsOf(call).flatMap((output) =>
    output.kind === 'artifact' && /^image\//i.test(output.mimeType || '')
      ? [
          {
            id: output.id,
            uri: `/api/files/${encodeURIComponent(output.fileId)}/raw`,
            name: output.name || '',
          },
        ]
      : [],
  );
}

/** One public projection drives both the disclosure affordance and the body.
 * Internal execution data and a separately rendered approval never create
 * an empty disclosure. The original execution record remains untouched. */
export function publicToolDetailOf(view: ToolRunView, call?: ToolCallRecord) {
  const sections = view.sections.filter(
    (section) =>
      (section.kind === 'sources' && section.items.length > 0) ||
      (section.kind === 'files' && section.paths.length > 0),
  );
  const images = imageOutputsOf(call);
  return {
    sections,
    images,
    entryKey: call?.id || view.id,
    expandable: Boolean(sections.length || images.length || view.agentRun),
  };
}

export type PublicToolDetail = ReturnType<typeof publicToolDetailOf>;
