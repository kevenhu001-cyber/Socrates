/**
 * Conservative local grading for short practice answers.
 *
 * Only answers with a clear, lossless comparison are marked right or wrong.
 * Unsupported algebraic prose is left for the tutor to review instead of
 * being treated as incorrect because its formatting differs from the key.
 */
export type PracticeAnswerAssessment = 'correct' | 'incorrect' | 'unverified';

type SimpleAnswer =
  | { kind: 'number'; value: number }
  | { kind: 'equation'; variable: string; value: number };

const DECIMAL = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const NUMBER_RE = new RegExp(`^${DECIMAL}$`);
const FRACTION_RE = new RegExp(`^(${DECIMAL})/(${DECIMAL})$`);
const LEFT_EQUATION_RE = new RegExp(`^([a-z][a-z0-9_]*)=(${DECIMAL}(?:/(${DECIMAL}))?%?)$`, 'i');
const RIGHT_EQUATION_RE = new RegExp(`^(${DECIMAL}(?:/(${DECIMAL}))?%?)=([a-z][a-z0-9_]*)$`, 'i');

function finiteNumber(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function numericValue(raw: string): number | null {
  let text = raw.trim().replace(/\s+/g, '').replace(/[。．]$/u, '').replace(/％$/u, '%');
  if (/^[+-]?\d{1,3}(,\d{3})+(?:\.\d+)?%?$/.test(text)) text = text.replace(/,/g, '');
  else if (text.includes(',')) return null;
  const percent = text.endsWith('%');
  const numericText = percent ? text.slice(0, -1) : text;
  const fraction = FRACTION_RE.exec(numericText);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    const value = numerator / denominator;
    return finiteNumber(percent ? value / 100 : value);
  }
  if (!NUMBER_RE.test(numericText)) return null;
  const value = Number(numericText);
  return finiteNumber(percent ? value / 100 : value);
}

function simpleAnswer(raw: string): SimpleAnswer | null {
  const text = String(raw ?? '').trim().replace(/\s+/g, '').replace(/[。．]$/u, '').replace(/％$/u, '%');
  const number = numericValue(text);
  if (number !== null) return { kind: 'number', value: number };

  const left = LEFT_EQUATION_RE.exec(text);
  if (left) {
    const value = numericValue(left[2]);
    return value === null ? null : { kind: 'equation', variable: left[1]!.toLowerCase(), value };
  }
  const right = RIGHT_EQUATION_RE.exec(text);
  if (right) {
    const value = numericValue(right[1]);
    return value === null ? null : { kind: 'equation', variable: right[3]!.toLowerCase(), value };
  }
  return null;
}

function numericallyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

/** Remove presentation-only punctuation for exact textual self-checks. */
function normalizedText(value: string): string {
  return String(value ?? '').toLowerCase().trim()
    .replace(/[\s\u00a0]+/gu, '')
    .replace(/[.,;:!?。；：！？]+$/gu, '')
    .replace(/^["'“”‘’「」『』]+|["'“”‘’「」『』]+$/gu, '');
}

/**
 * Grade an answer only when the answer key supports a reliable comparison.
 * Fractions, decimals, percentages, and simple one-variable assignments are
 * compared numerically. Other non-identical expressions return `unverified`.
 */
export function evaluatePracticeAnswer(answer: string, correct: string): PracticeAnswerAssessment {
  const normalizedAnswer = normalizedText(answer);
  const normalizedCorrect = normalizedText(correct);
  if (normalizedAnswer && normalizedAnswer === normalizedCorrect) return 'correct';
  const submitted = simpleAnswer(answer);
  const expected = simpleAnswer(correct);
  if (!submitted || !expected) return 'unverified';

  if (submitted.kind === 'equation' && expected.kind === 'equation'
    && submitted.variable !== expected.variable) return 'unverified';
  return numericallyEqual(submitted.value, expected.value) ? 'correct' : 'incorrect';
}
