import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { i18n } from '../legacy/gateway';
import type { OpenUiBlockProps } from './OpenUiBlock';

const OpenUiBlock = lazy(() => import('./OpenUiBlock'));

export function LazyOpenUiBlock(props: OpenUiBlockProps) {
  const fallback = <div className="intui" role="status">{i18n('common.loading', 'Loading…')}</div>;
  return <ErrorBoundary><Suspense fallback={fallback}><OpenUiBlock {...props} /></Suspense></ErrorBoundary>;
}
