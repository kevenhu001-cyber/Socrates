import React from 'react';
import { Skeleton } from '../../ui/shadcn/skeleton';
import { cn } from 'cn';
import { PageFrame } from '../../ui/page/PageFrame';
import { PageHeader } from '../../ui/page/PageHeader';
import { i18n } from './workspaceUi';

export interface WorkspaceLoadingViewProps {
  page: string;
}

function SkeletonBlock({ className }: { className: string }) {
  return <Skeleton className={cn('workspace-skeleton-shimmer', className)} />;
}

function PluginSkeleton() {
  return (
    <div className="workspace-skeleton-container" aria-hidden="true">
      <div className="workspace-skeleton-strip">
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-sm" />
        <div className="workspace-skeleton-icons">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonBlock key={i} className="workspace-skeleton-squircle" />
          ))}
        </div>
      </div>
      <div className="workspace-skeleton-tabs">
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab active" />
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
      </div>
      <div className="workspace-skeleton-list">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="workspace-skeleton-row">
            <SkeletonBlock className="workspace-skeleton-logo" />
            <div className="workspace-skeleton-copy">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-title" />
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-desc" />
            </div>
            <SkeletonBlock className="workspace-skeleton-action" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="workspace-skeleton-container" aria-hidden="true">
      <div className="workspace-skeleton-tabs">
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab active" />
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
      </div>
      <div className="workspace-skeleton-list">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="workspace-skeleton-row project-skeleton-row">
            <SkeletonBlock className="workspace-skeleton-icon-circle" />
            <div className="workspace-skeleton-copy">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-title" />
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-sub" />
            </div>
            <SkeletonBlock className="workspace-skeleton-dot-action" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="workspace-skeleton-container" aria-hidden="true">
      <div className="workspace-skeleton-toolbar">
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-md" />
        <SkeletonBlock className="workspace-skeleton-search" />
      </div>
      <div className="workspace-skeleton-chips">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="workspace-skeleton-pill workspace-skeleton-pill-chip" />
        ))}
      </div>
      <div className="workspace-skeleton-list">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="workspace-skeleton-row library-skeleton-row">
            <SkeletonBlock className="workspace-skeleton-check" />
            <SkeletonBlock className="workspace-skeleton-file-icon" />
            <div className="workspace-skeleton-copy">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-title" />
            </div>
            <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-date" />
            <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-size" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduledSkeleton() {
  return (
    <div className="workspace-skeleton-container workspace-scheduled-skeleton" aria-hidden="true">
      <div className="workspace-skeleton-tabs">
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab active" />
        <SkeletonBlock className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
      </div>
      <div className="workspace-skeleton-scheduled-cards">
        {[1, 2, 3].map((i) => (
          <div key={i} className="workspace-skeleton-scheduled-card">
            <SkeletonBlock className="workspace-skeleton-icon-circle" />
            <div className="workspace-skeleton-copy">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-title" />
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-desc" />
            </div>
            <SkeletonBlock className="workspace-skeleton-dot-action" />
          </div>
        ))}
      </div>
      <div className="workspace-skeleton-list workspace-scheduled-task-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="workspace-skeleton-row scheduled-skeleton-row">
            <SkeletonBlock className="workspace-skeleton-icon-circle" />
            <div className="workspace-skeleton-copy">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-title" />
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-sub" />
            </div>
            <SkeletonBlock className="workspace-skeleton-action workspace-skeleton-task-action" />
          </div>
        ))}
      </div>
    </div>
  );
}

function loadingCopy(page: string): { title: string; description: string } {
  switch (page) {
    case 'plugins':
      return {
        title: i18n('plugins.title', 'Plugins'),
        description: i18n('plugins.loading', 'Loading apps and connection status…'),
      };
    case 'projects':
      return {
        title: i18n('projects.title', 'Projects'),
        description: i18n('projects.loading', 'Loading project spaces and knowledge context…'),
      };
    case 'library':
      return {
        title: i18n('library.title', 'Library'),
        description: i18n('library.loading', 'Loading documents and files…'),
      };
    case 'scheduled':
      return {
        title: i18n('scheduled.title', 'Scheduled'),
        description: i18n('scheduled.loading', 'Loading tasks and schedules…'),
      };
    default:
      return {
        title: i18n('workspace.title', 'Workspace'),
        description: i18n('workspace.loading', 'Loading workspace…'),
      };
  }
}

export function WorkspaceLoadingView({ page }: WorkspaceLoadingViewProps) {
  const { title, description } = loadingCopy(page);
  const titleId = `workspace-loading-${page}-title`;
  return (
    <PageFrame
      className={`workspace-surface workspace-loading-surface workspace-loading-${page}`}
      aria-busy="true"
      aria-live="polite"
      aria-labelledby={titleId}
    >
      <PageHeader
        titleId={titleId}
        title={title}
        description={description}
        actions={<SkeletonBlock className="workspace-skeleton-action workspace-skeleton-create" />}
      />
      {page === 'plugins' && <PluginSkeleton />}
      {page === 'projects' && <ProjectsSkeleton />}
      {page === 'library' && <LibrarySkeleton />}
      {page === 'scheduled' && <ScheduledSkeleton />}
    </PageFrame>
  );
}
