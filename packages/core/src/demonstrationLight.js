/** Validation and expression-only entry. No numerical execution imports. */
export { normalizeDemonstrationProgram } from './simulation/compiler/normalize.js';
export { validateDemonstration } from './simulation/compiler/validate.js';
export { demonstrationDomain } from './simulation/runtime/domain.js';
export { isDemonstrationBudgetError } from './simulation/foundation.js';
export {
  DEMONSTRATION_LOOP_LIMIT,
  normalizeDemonstrationExpression,
  normalizeDemonstrationIdentifier,
  parseDemonstrationExpression,
} from './simulation/expression/parser.js';
export { evaluateDemonstrationExpression } from './simulation/expression/evaluate.js';
