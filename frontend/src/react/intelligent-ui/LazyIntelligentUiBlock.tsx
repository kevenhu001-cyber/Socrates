import { lazy, Suspense, type ComponentProps } from 'react';

import { ErrorBoundary } from '../ErrorBoundary';
import { BlockSkeletonShell } from './BlockSkeleton';

const IntelligentUiBlock = lazy(() => import('./IntelligentUi'));

/** Keep rich response surfaces outside the ordinary prose/boot graph. */
export function LazyIntelligentUiBlock(props: ComponentProps<typeof IntelligentUiBlock>) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<BlockSkeletonShell />}>
        <IntelligentUiBlock {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
