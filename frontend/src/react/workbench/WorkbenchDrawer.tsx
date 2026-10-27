import { Button as UiButton } from '../ui/Button';
import React, { useEffect, useRef, useState } from 'react';
import {
  closeWorkbench,
  setWorkbenchTab,
  toggleWorkbenchFullscreen,
  useWorkbench,
} from './workbenchStore';
import { copyToClipboard } from '../canvas/clipboard';
import { setComposerMarkdown } from '../../composer/controller.ts';
import { sanitizeHtml } from '../../render/sanitizeHtml.ts';
import { i18n } from '../legacy/gateway';

export function WorkbenchDrawer(): React.ReactElement | null {
  const { isOpen, activeTab, isFullscreen, artifact } = useWorkbench();
  const [copied, setCopied] = useState(false);
  const [, setLanguageRevision] = useState(0);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const refreshLanguage = () => setLanguageRevision((revision) => revision + 1);
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);

  // Keyboard shortcut: Esc to close workbench or exit fullscreen
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          toggleWorkbenchFullscreen();
        } else {
          closeWorkbench();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen]);

  // Mount preview element when tab is preview and previewElement is provided
  useEffect(() => {
    if (!previewRef.current || !artifact || activeTab !== 'preview') return;
    if (artifact.previewElement) {
      previewRef.current.innerHTML = '';
      previewRef.current.appendChild(artifact.previewElement);
    } else if (artifact.previewHtml) {
      previewRef.current.innerHTML = sanitizeHtml(artifact.previewHtml);
    }
  }, [artifact, activeTab]);

  if (!isOpen || !artifact) return null;
  const title = artifact.titleKey
    ? i18n(artifact.titleKey, artifact.title).replace('{language}', (artifact.language || '').toUpperCase())
    : artifact.title;

  const handleCopy = () => {
    const textToCopy = artifact.code || artifact.previewHtml || '';
    if (copyToClipboard(textToCopy)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAskAboutArtifact = () => {
    const prompt = i18n('workbench.askPrompt', 'About “{title}”: ').replace('{title}', title);
    try {
      setComposerMarkdown('chat', prompt);
      const editor = document.querySelector<HTMLElement>('#composerRoot [contenteditable="true"]');
      if (editor) {
        editor.focus();
      }
    } catch (_) { /* empty-catch: intentional — focus composer on artifact ask is best-effort */ }
  };

  const getTypeIcon = () => {
    switch (artifact.type) {
      case 'chart':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        );
      case 'whiteboard':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
          </svg>
        );
      case 'geometry':
      case 'math':
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 2 22 22 22" />
          </svg>
        );
      case 'code':
      default:
        return (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        );
    }
  };

  return (
    <div className={`workbench-drawer${isFullscreen ? ' is-fullscreen' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      {/* Mobile top drag handle indicator */}
      <div className="workbench-drag-handle" aria-hidden="true" onClick={closeWorkbench}>
        <span className="workbench-drag-bar" />
      </div>

      <header className="workbench-header">
        <div className="workbench-title-group">
          <span className="workbench-type-badge" aria-hidden="true">
            {getTypeIcon()}
          </span>
          <div className="workbench-title-wrap">
            <h2 className="workbench-title">{title}</h2>
            {artifact.language && (
              <span className="workbench-lang-badge">{artifact.language}</span>
            )}
          </div>
        </div>

        <div className="workbench-tabs" role="tablist" aria-label={i18n('workbench.viewModes', 'Workbench view modes')}>
          <UiButton
            type="button"
            role="tab"
            aria-selected={activeTab === 'preview'}
            className={`workbench-tab${activeTab === 'preview' ? ' is-active' : ''}`}
            onClick={() => setWorkbenchTab('preview')}
          >
            {i18n('workbench.preview', '实时预览')}
          </UiButton>
          <UiButton
            type="button"
            role="tab"
            aria-selected={activeTab === 'code'}
            className={`workbench-tab${activeTab === 'code' ? ' is-active' : ''}`}
            onClick={() => setWorkbenchTab('code')}
          >
            {i18n('workbench.code', '查看代码')}
          </UiButton>
        </div>

        <div className="workbench-actions">
          <UiButton
            type="button"
            className="workbench-action-btn"
            title={copied ? i18n('workbench.copied', '已复制') : i18n('workbench.copy', '复制代码')}
            aria-label={copied ? i18n('workbench.copied', '已复制') : i18n('workbench.copy', '复制代码')}
            onClick={handleCopy}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </UiButton>
          <UiButton
            type="button"
            className="workbench-action-btn desktop-only"
            title={i18n('workbench.fullscreen', '全屏模式')}
            aria-label={i18n('workbench.fullscreen', '全屏模式')}
            onClick={toggleWorkbenchFullscreen}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </UiButton>
          <UiButton
            type="button"
            className="workbench-action-btn workbench-close-btn"
            title={i18n('workbench.close', '关闭工作台')}
            aria-label={i18n('workbench.close', '关闭工作台')}
            onClick={closeWorkbench}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </UiButton>
        </div>
      </header>

      <main className="workbench-content">
        {activeTab === 'preview' ? (
          <div className="workbench-preview-container" ref={previewRef}>
            {/* Seeded or mounted via effect */}
          </div>
        ) : (
          <div className="workbench-code-container">
            <pre className="workbench-code-pre">
              <code>{artifact.code || artifact.previewHtml || ''}</code>
            </pre>
          </div>
        )}
      </main>

      <footer className="workbench-footer">
        <div className="workbench-version-tag">
          <span className="workbench-version-dot" aria-hidden="true" />
          <span>v{artifact.version || 1} · {i18n('workbench.live', 'Live workbench')}</span>
        </div>
        <UiButton
          type="button"
          className="workbench-ask-btn"
          onClick={handleAskAboutArtifact}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{i18n('workbench.ask', '对此产物提问')}</span>
        </UiButton>
      </footer>
    </div>
  );
}
