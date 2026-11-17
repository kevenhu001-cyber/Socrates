import { Button as UiButton } from '../../ui/Button';
import { defineComponent } from '@openuidev/react-lang';
import { calculatorStep, initialCalculatorState } from '@socrates/core';
import { useReducer, type KeyboardEvent } from 'react';
import { z } from 'zod/v4';
import { i18n } from '../../legacy/gateway';
import { cx } from './style';

/* Key order and role. The role drives the visual hierarchy: functions stay
   quiet, operators read as a group, digits carry the surface and equals is
   the single accent action. */
const CALCULATOR_KEYS: ReadonlyArray<readonly [string, 'fn' | 'op' | 'digit' | 'equals']> = [
  ['C', 'fn'], ['Backspace', 'fn'], ['±', 'fn'], ['÷', 'op'],
  ['7', 'digit'], ['8', 'digit'], ['9', 'digit'], ['×', 'op'],
  ['4', 'digit'], ['5', 'digit'], ['6', 'digit'], ['−', 'op'],
  ['1', 'digit'], ['2', 'digit'], ['3', 'digit'], ['+', 'op'],
  ['0', 'digit'], ['.', 'digit'], ['=', 'equals'],
];

export const Calculator = defineComponent({
  name: 'Calculator',
  props: z.object({ label: z.string().optional() }),
  description: 'A working local pocket calculator with decimal input, + − × ÷, clear, backspace and keyboard support. Prefer this over drawing calculator buttons.',
  component: function CalculatorView({ props }) {
    const title = props.label || i18n('intui.calculator', 'Calculator');
    const [state, dispatch] = useReducer(calculatorStep, initialCalculatorState);
    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!/^[0-9.+*/=-]$/.test(event.key) && !['Enter', 'Escape', 'Backspace'].includes(event.key)) return;
      event.preventDefault();
      dispatch(event.key);
    };
    return <div className="iui-card iui-flow iui-calculator" role="group" aria-label={title} tabIndex={0} onKeyDown={keyboard}>
      {props.label ? <strong>{props.label}</strong> : null}
      <output className="iui-title" aria-live="polite" aria-label={title}>{state.display === 'Error' ? i18n('intui.calculationError', 'Error') : state.display}</output>
      <div className="iui-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--ui-space-sm)' }}>
        {CALCULATOR_KEYS.map(([key, role]) => <UiButton className={cx('iui-button', 'iui-button-outline', 'iui-button-md', `iui-calculator-${role}`)} type="button" aria-label={key === 'Backspace' ? i18n('intui.backspace', 'Backspace') : undefined} key={key} onClick={() => dispatch(key)}>{key === 'Backspace' ? '⌫' : key}</UiButton>)}
      </div>
    </div>;
  },
});
