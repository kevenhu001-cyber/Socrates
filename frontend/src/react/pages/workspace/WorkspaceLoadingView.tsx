import React from 'react';

export interface WorkspaceLoadingViewProps {
  page: string;
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`workspace-skeleton-shimmer ${className}`} />;
}

export function WorkspaceLoadingView({ page }: WorkspaceLoadingViewProps) {
  let label = '正在载入工作区…';
  let title = '工作区';
  if (page === 'plugins') {
    title = '插件';
    label = '正在同步插件生态与连接状态…';
  } else if (page === 'projects') {
    title = '项目';
    label = '正在载入项目空间与知识上下文…';
  } else if (page === 'library') {
    title = '资料库';
    label = '正在载入知识库文档与文件…';
  } else if (page === 'scheduled') {
    title = '定时任务';
    label = '正在载入任务与运行计划…';
  }

  return (
    <div className={`workspace-surface workspace-loading-surface workspace-loading-${page}`} aria-busy="true" aria-live="polite">
      <div className="workspace-loading-banner">
        <div className="workspace-loading-spinner-box">
          {/* Keep the page-level loading affordance as a rotating ring. The
              content placeholders below carry the shimmer treatment. */}
          <div className="workspace-loading-spinner-ring" aria-hidden="true" />
        </div>
        <div className="workspace-loading-banner-text">
          <strong className="shimmer-text">{title}</strong>
          <span className="shimmer-text">{label}</span>
        </div>
      </div>

      {/* Skeleton Mockup */}
      {page === 'plugins' && (
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
      )}

      {page === 'projects' && (
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
      )}

      {page === 'library' && (
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
      )}

      {page === 'scheduled' && (
        <div className="workspace-skeleton-container workspace-scheduled-skeleton" aria-hidden="true">
          <div className="workspace-skeleton-scheduled-head">
            <div className="workspace-skeleton-copy workspace-skeleton-scheduled-heading">
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-page-title" />
              <SkeletonBlock className="workspace-skeleton-line workspace-skeleton-line-page-desc" />
            </div>
            <div className="workspace-skeleton-scheduled-actions">
              <SkeletonBlock className="workspace-skeleton-search" />
              <SkeletonBlock className="workspace-skeleton-action workspace-skeleton-create" />
            </div>
          </div>
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
      )}
    </div>
  );
}
