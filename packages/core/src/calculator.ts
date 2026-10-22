/** Deterministic pocket calculator. Each operation rounds floating point noise. */
export interface CalculatorState {
  display: string;
  stored: number | null;
  operator: string | null;
  fresh: boolean;
  repeat: { operator: string; operand: number } | null;
}
export const initialCalculatorState: CalculatorState = { display: '0', stored: null, operator: null, fresh: true, repeat: null };
function calculate(a: number, operator: string, b: number): number {
  return operator === '+' ? a + b : operator === '−' ? a - b : operator === '×' ? a * b : b === 0 ? NaN : a / b;
}
function resultState(state: CalculatorState, value: number): CalculatorState {
  return Number.isFinite(value) ? { ...state, display: String(Number(value.toPrecision(12))), fresh: true }
    : { ...initialCalculatorState, display: 'Error' };
}
export function calculatorStep(previous: CalculatorState, key: string): CalculatorState {
  if (key === 'C' || key === 'Escape') return { ...initialCalculatorState };
  const state = previous.display === 'Error' ? initialCalculatorState : previous;
  key = ({ '*': '×', '/': '÷', '-': '−', Enter: '=' } as Record<string, string>)[key] ?? key;
  if (/^[0-9.]$/.test(key)) {
    if (key === '.' && !state.fresh && state.display.includes('.')) return state;
    const display = state.fresh ? (key === '.' ? '0.' : key) : state.display === '0' && key !== '.' ? key : state.display + key;
    return display.length > 16 ? state : { ...state, display, fresh: false, repeat: null };
  }
  if (key === 'Backspace') return state.fresh ? state : { ...state, display: state.display.slice(0, -1) || '0' };
  if (key === '±') return { ...state, display: String(-Number(state.display)) };
  if (key === '=') {
    const operator = state.operator ?? state.repeat?.operator;
    const operand = state.operator ? Number(state.display) : state.repeat?.operand;
    if (!operator || operand === undefined) return state;
    const base = state.operator ? state.stored ?? 0 : Number(state.display);
    return resultState({ ...state, stored: null, operator: null, repeat: { operator, operand } }, calculate(base, operator, operand));
  }
  if (['+', '−', '×', '÷'].includes(key)) {
    const next = state.operator && !state.fresh && state.stored !== null ? resultState(state, calculate(state.stored, state.operator, Number(state.display))) : state;
    if (next.display === 'Error') return next;
    return { ...next, stored: Number(next.display), operator: key, fresh: true, repeat: null };
  }
  return previous;
}
