/** Stable public demonstration API; implementation lives in simulation/. */
export { DEMONSTRATION_LOOP_LIMIT, normalizeDemonstrationExpression, normalizeDemonstrationIdentifier, parseDemonstrationExpression } from './simulation/expression/parser.js';
export { evaluateDemonstrationExpression } from './simulation/expression/evaluate.js';
export { isDemonstrationBudgetError } from './simulation/foundation.js';
export { normalizeDemonstrationProgram } from './simulation/compiler/normalize.js';
export { validateDemonstration } from './simulation/compiler/validate.js';
export { createDemonstrationRuntime, compileDemonstrationRuntime } from './simulation/compiler/compile.js';
export { demonstrationDomain } from './simulation/runtime/prepare.js';
