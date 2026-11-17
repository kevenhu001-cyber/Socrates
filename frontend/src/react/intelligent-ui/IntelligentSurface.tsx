import { useId, type ReactNode } from 'react';
import { MathText } from '../rn/useInlineMath';
import { i18n } from '../legacy/gateway';

export type IntelligentDisplayMode = 'inline' | 'compact' | 'carousel' | 'fullscreen' | 'pip';

/** Interactive results stay embedded in the answer. */
export function IntelligentSurface({ children, title, description }: {
  children: ReactNode;
  title?: string;
  description?: string;
  displayMode?: IntelligentDisplayMode;
}) {
  const titleId = useId();
  return <section className="intui-surface-shell" data-display-mode="inline" data-has-title={Boolean(title)}
    aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : i18n('intui.surface', 'Interactive result')}>
    {title || description ? <header className="intui-surface-header"><div className="intui-surface-heading">
      {title ? <h3 id={titleId} className="intui-panel-title intui-surface-title"><MathText text={title} /></h3> : null}
      {description ? <div className="intui-panel-description intui-surface-description"><MathText text={description} /></div> : null}
    </div></header> : null}
    <div className="intui-surface-document">{children}</div>
  </section>;
}
