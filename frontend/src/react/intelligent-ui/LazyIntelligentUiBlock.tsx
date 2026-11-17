import { lazy, Suspense, type ComponentProps } from 'react';

import { ErrorBoundary } from '../ErrorBoundary';
import { BlockSkeletonShell } from './BlockSkeleton';

const IntelligenceUiBlock = lazy(() => import('./IntelligenceUi'));

/** Keep rich response surfaces outside the ordinary prose/boot graph. */
export function LazyIntelligenceUiBlock(props: ComponentProps<typeof IntelligenceUiBlock>) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<BlockSkeletonShell />}>
        <IntelligenceUiBlock {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
