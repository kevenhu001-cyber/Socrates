import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { BlockSkeleton, BlockSkeletonShell } from './BlockSkeleton';
import type { OpenUiBlockProps } from './OpenUiBlock';

const OpenUiBlock = lazy(() => import('./OpenUiBlock'));

export function LazyOpenUiBlock(props: OpenUiBlockProps) {
  /* Same footprint the loaded block shows until its program draws. */
  const fallback = props.embedded ? <div className="intui-openui"><BlockSkeleton /></div> : <BlockSkeletonShell />;
  return <ErrorBoundary><Suspense fallback={fallback}><OpenUiBlock {...props} /></Suspense></ErrorBoundary>;
}
