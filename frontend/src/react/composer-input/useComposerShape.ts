import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ComposerSurface } from '../../composer/types.ts';
import { hasMultilineDraft } from './composerShapeGeometry.ts';

export interface ComposerShapeHandlers {
  syncComposerShape(editor: HTMLElement): void;
  handleComposerFocus(editor: HTMLElement): void;
  handleComposerBlur(event: FocusEvent): void;
}

export function useComposerShape(): ComposerShapeHandlers {
  const wrapRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const syncComposerShape = useCallback((editor: HTMLElement) => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const wrap = editor.closest<HTMLElement>('.composer-input-wrap');
      if (!wrap || editor.closest('.chat-view.hidden, .topic-setup.hidden, .main-inner.hidden'))
        return;
      wrapRef.current = wrap;
      wrap.classList.toggle('composer-multiline', hasMultilineDraft(editor, wrap));
    });
  }, []);

  const handleComposerFocus = useCallback((editor: HTMLElement) => {
    wrapRef.current = editor.closest<HTMLElement>('.composer-input-wrap');
    wrapRef.current?.classList.add('composer-focused');
  }, []);

  const handleComposerBlur = useCallback((event: FocusEvent) => {
    const wrap = wrapRef.current;
    if (wrap && !wrap.contains(event.relatedTarget as Node | null)) {
      wrap.classList.remove('composer-focused');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      wrapRef.current?.classList.remove('composer-focused', 'composer-multiline');
      wrapRef.current = null;
    };
  }, []);

  return { syncComposerShape, handleComposerFocus, handleComposerBlur };
}

export function useComposerShapeObserver(
  editor: HTMLElement | null,
  surface: ComposerSurface,
  syncComposerShape: ComposerShapeHandlers['syncComposerShape'],
): void {
  useLayoutEffect(() => {
    if (!editor) return;
    const observer = new ResizeObserver(() => syncComposerShape(editor));
    observer.observe(editor);
    return () => observer.disconnect();
  }, [editor, surface, syncComposerShape]);
}
