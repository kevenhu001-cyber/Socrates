/* Function parsing and sampling are shared with the server validator so a
 * model cannot receive success for syntax this renderer will later reject. */
export {
  parseFunctionExpression,
  sampleFunction,
  robustExtent,
} from '@socrates/core/visualizationMath';
