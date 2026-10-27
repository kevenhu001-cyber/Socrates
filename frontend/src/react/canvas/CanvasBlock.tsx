import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { LegacyChatMessage } from '../types/domain';
import { setComposerMarkdown } from '../../composer/controller.ts';
import { persistCanvasEdit } from './canvasState.ts';
import { sanitizeHtml } from '../../render/sanitizeHtml.ts';
import { copyToClipboard } from './clipboard';
import { useTranslation } from './useTranslation';
import { CanvasToolbar, type CanvasMode } from './CanvasToolbar';
import { openWorkbench } from '../workbench/workbenchStore';

interface CanvasBlockProps {
  message: LegacyChatMessage;
  html: string;
  canvasId: string;
  originalText: string;
}

/**
 * P_canvas-mode — ChatGPT-style editable reply surface.
 *
 *   ┌────────────────────────────────────────────┐
 *   │ [write icon] write             [orig][edit][copy][iterate][fullscreen] │
 *   ├────────────────────────────────────────────┤
 *   │  The assistant's reply, sanitized HTML     │
 *   │  rendered into a contentEditable inner     │
 *   │  div. Editing toggles the accent ring and  │
 *   │  writes editedText through the session     │
 *   │  state action.                              │
 *   └────────────────────────────────────────────┘
 *
 * The legacy pipeline writes the canvas wrapper via wrapForCanvas in
 * main.js:renderAssistantHTML. React hydrates from the same data-canvas-id
 * attribute and never enters dangerouslySetInnerHTML for this message.
 */
export function CanvasBlock({ message, html, canvasId, originalText }: CanvasBlockProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<CanvasMode>('view-edited');
  const [hasEdited, setHasEdited] = useState<boolean>(!!message.editedText);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const t = useTranslation();

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  /* Seed the contenteditable body from sanitized html on first mount and
     whenever the underlying html changes (e.g. session restore). Editing
     in this surface mutates the DOM directly; we only re-seed when the
     upstream html actually changes. */
  useLayoutEffect(() => {
    if (!innerRef.current) return;
    const seed = message.editedText && message.editedText.length > 0
      ? message.editedText
      : html;
    innerRef.current.innerHTML = sanitizeHtml(seed);
    if (message.editedText) setHasEdited(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, canvasId]);

  const toggleEdit = useCallback(() => {
    if (mode === 'edit') {
      /* Commit: sanitize and persist. */
      const dom = innerRef.current?.innerHTML ?? '';
      const safe = sanitizeHtml(dom);
      if (innerRef.current) innerRef.current.innerHTML = safe;
      setHasEdited(persistCanvasEdit(canvasId, safe));
      setMode('view-edited');
    } else {
      setMode('edit');
      /* Focus on the next paint so the caret lands inside. */
      requestAnimationFrame(() => {
        const el = innerRef.current;
        if (!el) return;
        el.focus();
        /* Move caret to end of current content. */
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    }
  }, [mode, canvasId]);

  const copy = useCallback(() => {
    const text = innerRef.current?.innerText ?? originalText;
    copyToClipboard(text);
  }, [originalText]);

  const iterate = useCallback(() => {
    const text = innerRef.current?.innerText ?? '';
    if (!text.trim()) return;
    /* Reuse the active rich composer API so markdown is parsed as editor
       content and the controller can retain the draft if the editor is
       between surfaces or temporarily unmounted. */
    setComposerMarkdown('chat', text);
  }, []);

  const fullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const toggleOriginal = useCallback(() => {
    setMode((prev) => (prev === 'view-original' ? 'view-edited' : 'view-original'));
  }, []);

  const openInWorkbench = useCallback(() => {
    openWorkbench({
      id: canvasId,
      title: 'Canvas 协同工作台',
      type: 'document',
      previewHtml: innerRef.current?.innerHTML || html,
      code: innerRef.current?.innerText || originalText,
      version: hasEdited ? 2 : 1,
    }, 'preview');
  }, [canvasId, html, originalText, hasEdited]);

  const extensionIcon = typeof message._extensionIcon === 'string' ? message._extensionIcon : '';
  const extensionLabel = (() => {
    const k = 'composer.write';
    const v = t(k);
    return v !== k ? v : 'write';
  })();

  return (
    <div className={`canvas-block${isFullscreen ? ' is-fullscreen' : ''}`} data-canvas-id={canvasId} data-output-mode="canvas">
      <CanvasToolbar
        mode={mode}
        extensionIcon={extensionIcon}
        extensionLabel={extensionLabel}
        hasEdited={hasEdited}
        isFullscreen={isFullscreen}
        onToggleEdit={toggleEdit}
        onCopy={copy}
        onIterate={iterate}
        onFullscreen={fullscreen}
        onToggleOriginal={toggleOriginal}
        onOpenWorkbench={openInWorkbench}
      />
      {mode === 'view-original' ? (
        <pre className="canvas-block-original">{originalText}</pre>
      ) : (
        <div
          ref={innerRef}
          className={'canvas-block-body' + (mode === 'edit' ? ' is-editing' : '')}
          contentEditable={mode === 'edit'}
          suppressContentEditableWarning
          aria-label={t('composer.canvas.edit', 'Canvas body')}
        />
      )}
    </div>
  );
}
