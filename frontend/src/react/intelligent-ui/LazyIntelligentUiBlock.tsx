import { lazy, Suspense, type ComponentProps } from 'react';

import { ErrorBoundary } from '../ErrorBoundary';
import { BlockSkeletonShell } from './BlockSkeleton';

const loadIntelligentUiBlock = () => import('./IntelligentUi');
const IntelligentUiBlock = lazy(loadIntelligentUiBlock);

/** Start downloading the renderer while a rich UI tool is still executing.
 * A failed speculative load must not change tool status; Suspense and the
 * error boundary still own the actual render. */
export function preloadIntelligentUiBlock(): void {
  void loadIntelligentUiBlock().catch(() => undefined);
}

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
