

const BUDGET = 4000000,
  DYNAMICS_BUDGET = 12000000;
const budgetError = () => Error('Demonstration calculation budget exceeded');
/** True for the resource-limit error, which callers retry at a coarser resolution. */
function isDemonstrationBudgetError(error) {
  return error instanceof Error && error.message.includes('budget exceeded');
}

const record = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const range = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((v) => (finite(v) && Math.abs(v) <= 1e6) || typeof v === 'string') &&
  (!value.every(finite) || value[0] < value[1]);
const text = (value) => value === undefined || (typeof value === 'string' && value.length <= 200);
/** An error that remembers which part of the program it belongs to. */
function located(path, error) {
  const message = error instanceof Error ? error.message : String(error);
  const result = Error(`${path}: ${message}`);
  result.path = path;
  result.detail = message;
  return result;
}
const at = (path, fn) => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error && error.path) throw error;
    throw located(path, error);
  }
};

export { BUDGET, DYNAMICS_BUDGET, budgetError, isDemonstrationBudgetError, record, finite, range, text, located, at };
