/**
 * Public facade for the pure tool-run view model.
 *
 * Domain logic lives in focused modules so layout, state, output normalization,
 * row details, aggregation, and legacy HTML compatibility can evolve separately.
 */
export type * from './toolRunModel.types.ts';
export {
  attachmentOutputsOf,
  toolOutputsOf,
  visualizationSpecOf,
} from './toolOutputs.ts';
export {runStartedAt, toolRunStateOf} from './toolRunState.ts';
export {
  buildTurnLayout,
  findThinkRanges,
  groupOutputCalls,
  groupShowsHeader,
  isRowMountableAt,
  isSentenceCompleteAt,
  sortableToolCalls,
  visualizationSpecKey,
} from './toolRunLayout.ts';
export {
  approvalViewOf,
  clippedText,
  detailText,
  extractCodePreview,
  groupSources,
  normalizeSources,
  rawDetailText,
  toolRunView,
  truncateLines,
} from './toolRunDetails.ts';
export {groupViewOf, toolRunGroupView} from './toolRunGroupModel.ts';
export {hasTurnStructure, stripLegacyToolHtml} from './toolRunLegacyHtml.ts';
