import React from 'react';

import { Wave } from '../../wave/Wave.js';

export interface WorkspaceLoadingViewProps {
  page: string;
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
  }

  return (
    <div className={`workspace-surface workspace-loading-surface workspace-loading-${page}`} aria-busy="true" aria-live="polite">
      {/* P_wave-page — the page loader is the one loading state big enough to
          carry a real animation, so it gets the travelling wave. It replaced a
          concentric ring + dot: two objects spinning at two tempos beside each
          other, which read as two different things loading. The wave is a
          single left-to-right band, matching the inline wave on a tool row so
          "loading" looks identical at every scale. */}
      <div className="workspace-loading-banner">
        <div className="workspace-loading-spinner-box">
          {/* The `workspace-loading-spinner-ring` class stays on the box: it
              is the loading-state hook chatgpt-oled-replicas.spec asserts, and
              a 44px wave is still "a spinner is showing" to that contract. */}
          <div className="workspace-loading-spinner-ring">
            <Wave size="lg" count={5} />
          </div>
        </div>
        <div className="workspace-loading-banner-text">
          <strong>{title}</strong>
          <span>{label}</span>
        </div>
      </div>

      {/* Skeleton Mockup */}
      {page === 'plugins' && (
        <div className="workspace-skeleton-container" aria-hidden="true">
          <div className="workspace-skeleton-strip">
            <div className="workspace-skeleton-pill workspace-skeleton-pill-sm" />
            <div className="workspace-skeleton-icons">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="workspace-skeleton-squircle" />
              ))}
            </div>
          </div>
          <div className="workspace-skeleton-tabs">
            <div className="workspace-skeleton-pill workspace-skeleton-pill-tab active" />
            <div className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
          </div>
          <div className="workspace-skeleton-list">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="workspace-skeleton-row">
                <div className="workspace-skeleton-logo" />
                <div className="workspace-skeleton-copy">
                  <div className="workspace-skeleton-line workspace-skeleton-line-title" />
                  <div className="workspace-skeleton-line workspace-skeleton-line-desc" />
                </div>
                <div className="workspace-skeleton-action" />
              </div>
            ))}
          </div>
        </div>
      )}

      {page === 'projects' && (
        <div className="workspace-skeleton-container" aria-hidden="true">
          <div className="workspace-skeleton-tabs">
            <div className="workspace-skeleton-pill workspace-skeleton-pill-tab active" />
            <div className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
            <div className="workspace-skeleton-pill workspace-skeleton-pill-tab" />
          </div>
          <div className="workspace-skeleton-list">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="workspace-skeleton-row project-skeleton-row">
                <div className="workspace-skeleton-icon-circle" />
                <div className="workspace-skeleton-copy">
                  <div className="workspace-skeleton-line workspace-skeleton-line-title" />
                  <div className="workspace-skeleton-line workspace-skeleton-line-sub" />
                </div>
                <div className="workspace-skeleton-dot-action" />
              </div>
            ))}
          </div>
        </div>
      )}

      {page === 'library' && (
        <div className="workspace-skeleton-container" aria-hidden="true">
          <div className="workspace-skeleton-toolbar">
            <div className="workspace-skeleton-pill workspace-skeleton-pill-md" />
            <div className="workspace-skeleton-search" />
          </div>
          <div className="workspace-skeleton-chips">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="workspace-skeleton-pill workspace-skeleton-pill-chip" />
            ))}
          </div>
          <div className="workspace-skeleton-list">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="workspace-skeleton-row library-skeleton-row">
                <div className="workspace-skeleton-check" />
                <div className="workspace-skeleton-file-icon" />
                <div className="workspace-skeleton-copy">
                  <div className="workspace-skeleton-line workspace-skeleton-line-title" />
                </div>
                <div className="workspace-skeleton-line workspace-skeleton-line-date" />
                <div className="workspace-skeleton-line workspace-skeleton-line-size" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
