import { lazy, Suspense, type ComponentProps } from 'react';

import { ErrorBoundary } from '../ErrorBoundary';
import { i18n } from '../legacy/gateway';

const IntelligenceUiBlock = lazy(() => import('./IntelligenceUi'));

/** Keep rich response surfaces outside the ordinary prose/boot graph. */
export function LazyIntelligenceUiBlock(props: ComponentProps<typeof IntelligenceUiBlock>) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="intui" role="status">{i18n('common.loading', 'Loading…')}</div>}>
        <IntelligenceUiBlock {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
