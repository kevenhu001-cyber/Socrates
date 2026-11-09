import { normalizeLearningUiNode, type IntelligenceUiNode } from '@socrates/core';
import { MathText } from '../rn/useInlineMath';
import { i18n } from '../legacy/gateway';

interface FallbackOption { letter: string; text: string }

/** Only the public half of a broken quiz: the choices, never the key or their explanations. */
function fallbackOptions(node: Record<string, unknown>): FallbackOption[] {
  if (node.kind !== 'quiz' || !Array.isArray(node.options)) return [];
  return node.options.flatMap((option, index): FallbackOption[] => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return [];
    const record = option as Record<string, unknown>;
    if (typeof record.text !== 'string' || !record.text.trim()) return [];
    const letter = typeof record.letter === 'string' && record.letter.trim() ? record.letter.trim() : String.fromCharCode(65 + index);
    return [{ letter, text: record.text }];
  });
}

/** Invalid historical cards keep readable public content; never expose a hidden key/solution. */
export function LearningFallback({ node }: { node: IntelligenceUiNode }) {
  const normalized = normalizeLearningUiNode(node) as Record<string, unknown>;
  const content = [normalized.q, normalized.problem, normalized.front, normalized.body, normalized.statement]
    .find(value => typeof value === 'string' && value.trim());
  const options = fallbackOptions(normalized);
  return <article className="intui-callout" data-tone="warning" data-learning-fallback={node.id} role="status">
    <p className="intui-text">{i18n('intui.learning.incomplete', 'This learning card is incomplete. Its available content is shown below.')}</p>
    {typeof content === 'string' ? <p className="intui-text"><MathText text={content} /></p> : null}
    {options.map((option, index) => <p className="intui-text" key={`${option.letter}-${index}`} data-learning-option={option.letter}>
      {option.letter}. <MathText text={option.text} />
    </p>)}
  </article>;
}
