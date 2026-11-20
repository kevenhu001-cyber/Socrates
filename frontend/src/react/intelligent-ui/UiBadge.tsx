import { normalizeIntelligentUiTone, type IntelligentUiNode } from '@socrates/core';
import { MathText } from '../rn/useInlineMath';
import { asProse, resolve, type RenderContext } from './renderRuntime';

export function UiBadge({ node, context }: { node: IntelligentUiNode; context: RenderContext }) {
  const label = asProse(resolve(node.label || node.text, context));
  if (!label) return null;

  const tone = normalizeIntelligentUiTone(resolve(node.tone, context));
  const variant = String(node.variant || 'subtle').toLowerCase();

  return (
    <span className={`intui-badge is-${tone} is-${variant}`} data-intui-id={node.id}>
      <MathText text={label} />
    </span>
  );
}

export default UiBadge;
