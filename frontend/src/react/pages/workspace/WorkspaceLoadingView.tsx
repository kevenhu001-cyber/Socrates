import React from 'react';
import { Skeleton } from '../../ui/shadcn/skeleton';
import { cn } from 'cn';
import { PageFrame } from '../../ui/page/PageFrame';
import { PageHeader } from '../../ui/page/PageHeader';
import { i18n } from './workspaceUi';
import { getCurrentLang } from '../../../ui/legacyI18n.ts';

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
  const zh = getCurrentLang() === 'zh';
  const fallback = (zhText: string, enText: string) => (zh ? zhText : enText);
  switch (page) {
    case 'plugins':
      return {
        title: i18n('plugins.title', fallback('插件', 'Plugins')),
        description: i18n(
          'plugins.loading',
          fallback('正在同步插件生态与连接状态…', 'Loading apps and connection status…'),
        ),
      };
    case 'projects':
      return {
        title: i18n('projects.title', fallback('项目', 'Projects')),
        description: i18n(
          'projects.loading',
          fallback(
            '正在载入项目空间与知识上下文…',
            'Loading project spaces and knowledge context…',
          ),
        ),
      };
    case 'library':
      return {
        title: i18n('library.title', fallback('资料库', 'Library')),
        description: i18n(
          'library.loading',
          fallback('正在载入知识库文档与文件…', 'Loading documents and files…'),
        ),
      };
    case 'scheduled':
      return {
        title: i18n('scheduled.title', fallback('定时任务', 'Scheduled')),
        description: i18n(
          'scheduled.loading',
          fallback('正在载入任务与运行计划…', 'Loading tasks and schedules…'),
        ),
      };
    default:
      return {
        title: i18n('workspace.title', fallback('工作区', 'Workspace')),
        description: i18n('workspace.loading', fallback('正在载入工作区…', 'Loading workspace…')),
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
