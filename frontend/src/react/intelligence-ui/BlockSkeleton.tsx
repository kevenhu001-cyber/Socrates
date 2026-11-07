import { i18n } from '../legacy/gateway';

/**
 * The one placeholder an interactive block shows before it has anything of
 * its own to draw: while its code chunk loads, and while an OpenUI program
 * streams in before its `root` line. Both moments share this footprint, so
 * the block takes its place once and only grows from there. The skeleton highlights pending
 * content while preserving the final layout. Its lines carry the shared
 * `.skeleton-shimmer` sweep (foundations/base.css), the same one the streaming
 * scaffold previews use, and stay static under reduced motion.
 */
export function BlockSkeleton({ announce = true }: { announce?: boolean }) {
  return (
    <div className="intui-block-skeleton" role={announce ? 'status' : undefined} aria-busy={announce || undefined}>
      <span className="intui-block-skeleton-line skeleton-shimmer" data-width="title" aria-hidden="true" />
      <span className="intui-block-skeleton-line skeleton-shimmer" aria-hidden="true" />
      {announce ? <span className="sr-only">{i18n('common.loading', 'Loading…')}</span> : null}
    </div>
  );
}

/** Suspense fallback with the same shell the loaded block renders in. */
export function BlockSkeletonShell() {
  return (
    <div className="intui" role="status" aria-busy="true" aria-label={i18n('common.loading', 'Loading…')}>
      <div className="intui-surface-shell" data-display-mode="inline">
        <div className="intui-surface-document"><BlockSkeleton announce={false} /></div>
      </div>
    </div>
  );
}

/** A block with nothing to show yet: the skeleton while it streams, else nothing. */
export function PendingBlock({ open }: { open: boolean }) {
  return open ? <BlockSkeletonShell /> : null;
}
