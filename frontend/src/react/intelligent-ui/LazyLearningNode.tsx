import { LearningFallback } from './LearningFallback';
import { lazy, Suspense } from 'react';
import type { IntelligenceUiNode } from '@socrates/core';
import { ErrorBoundary } from '../ErrorBoundary';
import { BlockSkeleton } from './BlockSkeleton';

const LearningNode=lazy(()=>import('./LearningNode'));

/** Isolate each card; a failed learning widget must not take down adjacent content. */
export function LazyLearningNode({ node, readOnly, streaming }: { node:IntelligenceUiNode; readOnly:boolean; streaming?:boolean }) {
  return <ErrorBoundary key={JSON.stringify([node.id,node.kind,node.q,node.options,node.correct,node.problem,node.front,node.back,node.body,node.statement])} fallback={<LearningFallback node={node} />}>
    <Suspense fallback={<BlockSkeleton />}><LearningNode node={node} readOnly={readOnly} streaming={streaming} /></Suspense>
  </ErrorBoundary>;
}
