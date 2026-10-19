import { writeFileSync } from 'node:fs';

/** Keep failed/partial audits from replacing the last reviewed baseline. */
export function writeValidatedBaseline(path, { scenarios, defects, unresolved, partial, tolerancePx }) {
  const problems = [];
  if (partial) problems.push('baseline updates require the full scenario/viewport/theme/language matrix (no --quick or --only)');
  if (unresolved.length) {
    problems.push('gated roles never resolved: ' + unresolved.map(({ role }) => role).join(', '));
  }
  const defectCount = Object.values(defects).reduce((n, entries) => n + entries.length, 0);
  if (defectCount) problems.push(`${defectCount} layout defect(s) must be fixed before updating the baseline`);
  if (!Object.keys(scenarios).length) problems.push('no measured scenarios');
  if (problems.length) throw new Error('refusing to write parity baseline: ' + problems.join('; '));

  writeFileSync(path, JSON.stringify({
    note: 'Committed visual baseline for scripts/parity-audit.mjs --check. ' +
      'Only stable fields are recorded (no x/y). Regenerate with ' +
      '`npm run parity:update` and review the diff and screenshots.',
    tolerancePx,
    generatedBy: 'parity-audit.mjs --update',
    scenarios,
  }, null, 1) + '\n');
}
