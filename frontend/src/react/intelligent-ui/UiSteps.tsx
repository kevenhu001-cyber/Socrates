import type { IntelligentUiNode } from '@socrates/core';
import { MathText } from '../rn/useInlineMath';
import { asNumber, asProse, isRecord, resolve, setBoundValue, type RenderContext } from './renderRuntime';

interface StepItem {
  id: string;
  title: string;
  description?: string;
  status?: 'completed' | 'current' | 'upcoming';
}

export function UiSteps({
  node,
  context,
}: {
  node: IntelligentUiNode;
  context: RenderContext;
}) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  const rawCurrent = bind && context.state[bind] !== undefined
    ? context.state[bind]
    : resolve(node.current, context);
  const currentIndex = Math.max(0, Math.round(asNumber(rawCurrent, 0)));

  const rawItems = Array.isArray(node.items)
    ? (node.items.filter(isRecord) as Array<Record<string, unknown>>)
    : [];

  const items: StepItem[] = rawItems.map((item, index) => {
    const id = String(item.id || `step-${index}`);
    const title = asProse(resolve(item.title || item.label || `Step ${index + 1}`, context));
    const description = asProse(resolve(item.description || item.detail, context));
    let status: 'completed' | 'current' | 'upcoming';
    if (typeof item.status === 'string') {
      const s = item.status.toLowerCase();
      status = s === 'completed' || s === 'done' ? 'completed' : s === 'current' ? 'current' : 'upcoming';
    } else {
      status = index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming';
    }
    return { id, title, description, status };
  });

  if (!items.length) return null;

  const handleStepClick = (index: number) => {
    if (bind) {
      setBoundValue(context, bind, index);
    }
  };

  return (
    <div className="intui-steps" data-intui-id={node.id} role="list">
      {items.map((step, index) => {
        const isClickable = Boolean(bind);
        const isCurrent = step.status === 'current' || (!step.status && index === currentIndex);
        const isCompleted = step.status === 'completed' || (!step.status && index < currentIndex);

        return (
          <div
            key={step.id}
            className={`intui-step-item is-${step.status} ${isCurrent ? 'is-active' : ''} ${isClickable ? 'is-clickable' : ''}`}
            role="listitem"
            onClick={isClickable ? () => handleStepClick(index) : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={isClickable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStepClick(index);
              }
            } : undefined}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="intui-step-indicator">
              <span className="intui-step-circle">
                {isCompleted ? '✓' : index + 1}
              </span>
              {index < items.length - 1 && <span className="intui-step-line" aria-hidden="true" />}
            </div>

            <div className="intui-step-content">
              <div className="intui-step-title">
                <MathText text={step.title} />
              </div>
              {step.description && (
                <div className="intui-step-description">
                  <MathText text={step.description} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default UiSteps;
