/** Axis bounds can follow parameter/state-dependent expressions. Reversed
 * bounds are swapped and equal bounds widened; a non-finite bound uses the
 * fallback when one is given (for example a range fitted to the samples). */
export function demonstrationDomain(bounds, runtime, time = 0, fallback) {
  let problem = '';
  const values = bounds.map((value) => {
    try {
      return runtime.evaluate(value, time);
    } catch (error) {
      problem ||= error instanceof Error ? error.message : String(error);
      return Number.NaN;
    }
  });
  if (values.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) {
    if (fallback) return fallback;
    throw new Error(`Axis bounds must be finite and within ±1e6${problem ? ` (${problem})` : ''}`);
  }
  let [a, b] = values;
  if (a > b) [a, b] = [b, a];
  if (a === b) {
    const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
    a -= pad;
    b += pad;
  }
  return [a, b];
}
