/* ui/diagnosticScreen.ts — the loading / failure cards of the diagnostic view.
 *
 * `#diagnosticView` used to be written by four different modules with
 * `innerHTML`. It now has one React owner (`react/tutor/diagnosticHost`), and
 * the question and results screens live in `ui/diagnosticQuestion.js` /
 * `ui/diagnosticResults.js`. This module keeps the two transient screens plus
 * the clear path, and owns the progress state the generator reports into. */
import { clearDiagnostic, renderDiagnostic } from '../react/tutor/diagnosticHost.tsx';

function _t(key: string, fallback: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const value = window.t(key);
      if (value && value !== key) return value;
    }
  } catch {
    /* empty-catch: intentional — translation is best-effort */
  }
  return fallback;
}

let progress = { percent: 0, step: '' };

export function showDiagnosticLoading(): void {
  progress = { percent: 0, step: _t('diag.analyzingTopic', 'Analyzing topic…') };
  paintLoading();
}

export function updateDiagnosticProgress(percent: number, step: string): void {
  progress = { percent, step };
  paintLoading();
}

export function showDiagnosticError(reason: string): void {
  renderDiagnostic({
    kind: 'error',
    title: _t('diag.timeoutTitle', 'Question generation timed out'),
    reason,
    retryLabel: _t('diag.retry', 'Retry'),
    builtinLabel: _t('diag.useBuiltin', 'Use built-in questions'),
  });
}

export function clearDiagnosticScreen(): void {
  clearDiagnostic();
}

function paintLoading(): void {
  renderDiagnostic({
    kind: 'loading',
    loadingText: _t('tutor.loading', 'Generating questions...'),
    percent: progress.percent,
    step: progress.step,
    cancelLabel: _t('diag.cancel', 'Cancel'),
  });
}
