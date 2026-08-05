import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { LegacyChatMessage } from '../types/domain';
import { sanitizeHtml } from './sanitize';
import { copyToClipboard } from './clipboard';
import { useTranslation } from './useTranslation';
import { CanvasToolbar, type CanvasMode } from './CanvasToolbar';

interface CanvasBlockProps {
  message: LegacyChatMessage;
  html: string;
  canvasId: string;
  originalText: string;
}

interface MutableState {
  messages?: Array<{
    canvasId?: string | null;
    editedText?: string | null;
  }>;
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
 *   │  persists editedText onto the message      │
 *   │  entry so it survives reload.              │
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
  const t = useTranslation();

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
      const state = (typeof window !== 'undefined' ? (window as unknown as { state?: MutableState }).state : null);
      const entry = state?.messages?.find((m) => m && m.canvasId === canvasId);
      if (entry) entry.editedText = safe;
      setHasEdited(true);
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
    /* P_iterate-as-follow-up — surface the canvas content back into the
       composer as the next user turn. Wire through the existing
       legacyActions bridge rather than adding a new module boundary. */
    type ComposerActions = { setMarkdown?: (surface: 'chat' | 'topic', text: string) => void; };
    const actions = (typeof window !== 'undefined'
      ? (window as unknown as { legacyActions?: { composer?: ComposerActions } }).legacyActions?.composer
      : null);
    if (actions && typeof actions.setMarkdown === 'function') {
      actions.setMarkdown('chat', text);
    } else {
      /* Fallback: drop into the topic composer as a markdown textarea. */
      const ta = document.getElementById('chatInput') as HTMLTextAreaElement | null;
      if (ta) {
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }, []);

  const fullscreen = useCallback(() => {
    const root = innerRef.current?.closest('.canvas-block') as HTMLElement | null;
    if (!root) return;
    root.classList.toggle('is-fullscreen');
  }, []);

  const toggleOriginal = useCallback(() => {
    setMode((prev) => (prev === 'view-original' ? 'view-edited' : 'view-original'));
  }, []);

  const extensionIcon = typeof message._extensionIcon === 'string' ? message._extensionIcon : '';
  const extensionLabel = (() => {
    const k = 'composer.write';
    const v = (typeof window !== 'undefined' && window.t) ? window.t(k) : k;
    return v !== k ? v : 'write';
  })();

  return (
    <div className="canvas-block" data-canvas-id={canvasId} data-output-mode="canvas">
      <CanvasToolbar
        mode={mode}
        extensionIcon={extensionIcon}
        extensionLabel={extensionLabel}
        hasEdited={hasEdited}
        onToggleEdit={toggleEdit}
        onCopy={copy}
        onIterate={iterate}
        onFullscreen={fullscreen}
        onToggleOriginal={toggleOriginal}
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