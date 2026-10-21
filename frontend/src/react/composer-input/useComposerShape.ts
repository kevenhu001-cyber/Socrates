import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ComposerSurface } from '../../composer/types.ts';
import {
  cancelComposerShapeAnimation,
  clearPluginOnlyShape,
  releaseComposerMeasureProbe,
  shouldExpandComposer,
  transitionComposerShape,
  type CollapsedComposerMeasure,
  type ComposerShapeState,
  type ShapeAnimation,
} from './composerShapeGeometry.ts';

export interface ComposerShapeHandlers {
  captureShapeHeight(editorDom: HTMLElement): void;
  syncComposerShape(editorDom: HTMLElement, immediate?: boolean): void;
  handleComposerFocus(editorDom: HTMLElement): void;
  handleComposerBlur(event: Event): void;
}

export function useComposerShape(surface: ComposerSurface) {
  /* Focus and geometry stay separate: a one-line draft keeps the same shape
     while focused, and mobile grows only when the rendered draft needs it. */
  const pendingGeometryRelease = useRef<(() => void) | null>(null);
  const measuredEditorRef = useRef<HTMLElement | null>(null);
  const composerWrapRef = useRef<HTMLElement | null>(null);
  const shapeFrameRef = useRef<number | null>(null);
  const shapeAnimationRef = useRef<ShapeAnimation | null>(null);
  const shapeAnimationCleanupRef = useRef<(() => void) | null>(null);
  const shapeHeightRef = useRef<number | null>(null);
  const collapsedMeasureRef = useRef<CollapsedComposerMeasure | null>(null);
  const shapeState = useMemo<ComposerShapeState>(() => ({
    animation: shapeAnimationRef,
    animationCleanup: shapeAnimationCleanupRef,
    height: shapeHeightRef,
  }), []);

  const captureShapeHeight = useCallback((editorDom: HTMLElement) => {
    const wrap = editorDom.closest<HTMLElement>('.composer-input-wrap');
    if (wrap && wrap.getClientRects().length) {
      shapeHeightRef.current = wrap.getBoundingClientRect().height;
      // Hold the previous painted height until the coalesced geometry pass.
      // Without this, deleting a paragraph paints an auto-height collapse one
      // frame before the existing shrink animation starts (a visible bounce).
      if (wrap.classList.contains('composer-multiline') && !shapeAnimationRef.current && !pendingGeometryRelease.current) {
        const previous = wrap.style.getPropertyValue('height');
        const priority = wrap.style.getPropertyPriority('height');
        wrap.style.setProperty('height', shapeHeightRef.current + 'px', 'important');
        pendingGeometryRelease.current = () => {
          if (previous) wrap.style.setProperty('height', previous, priority);
          else wrap.style.removeProperty('height');
          pendingGeometryRelease.current = null;
        };
      }
    }
  }, []);

  const cacheSettledShapeHeight = useCallback((wrap: HTMLElement) => {
    shapeHeightRef.current = wrap.getBoundingClientRect().height;
  }, []);

  const syncComposerShape = useCallback((editorDom: HTMLElement, immediate = false) => {
    if (shapeFrameRef.current !== null) cancelAnimationFrame(shapeFrameRef.current);
    const run = () => {
      shapeFrameRef.current = null;
      measuredEditorRef.current = editorDom;
      const wrap = editorDom.closest<HTMLElement>('.composer-input-wrap');
      if (!wrap) return;
      /* View swaps briefly expose a pre-layout collapsed box. Skip that frame
         so it cannot become a false animation source. */
      const hiddenAncestor = editorDom.closest('.chat-view.hidden, .topic-setup.hidden, .main-inner.hidden');
      if (hiddenAncestor) { pendingGeometryRelease.current?.(); return; }
      /* Plugin chips own the empty first row; the empty editor below them
         must not toggle the multiline class from its intrinsic height. */
      if (clearPluginOnlyShape(editorDom, wrap, shapeState)) {
        // Plugin-only layout intentionally removed the temporary height.
        pendingGeometryRelease.current = null;
        return;
      }
      /* While the shell is between tiers, editor measurements are transient.
         Retry after the current animation lands before classifying the draft. */
      if (shapeAnimationRef.current) {
        shapeFrameRef.current = requestAnimationFrame(run);
        return;
      }
      const shouldExpand = shouldExpandComposer(
        editorDom,
        wrap,
        surface,
        collapsedMeasureRef,
      );
      pendingGeometryRelease.current?.();
      transitionComposerShape(wrap, shouldExpand, shapeState);
    };
    if (immediate) run();
    else shapeFrameRef.current = requestAnimationFrame(run);
  }, [shapeState, surface]);

  const handleComposerFocus = useCallback((editorDom: HTMLElement) => {
    composerWrapRef.current = editorDom.closest<HTMLElement>('.composer-input-wrap');
    const wrap = composerWrapRef.current;
    if (wrap) requestAnimationFrame(() => wrap.classList.add('composer-focused'));
  }, []);

  const handleComposerBlur = useCallback((event: Event) => {
    const wrap = composerWrapRef.current;
    const nextTarget = (event as FocusEvent).relatedTarget as Node | null;
    /* Keep geometry expanded when focus moves between composer controls.
       Defer the exit check until activeElement has settled. */
    if (wrap && nextTarget && wrap.contains(nextTarget)) return;
    requestAnimationFrame(() => {
      if (wrap && !wrap.contains(document.activeElement)) {
        wrap.classList.remove('composer-focused');
      }
    });
  }, []);

  const isShapeAnimating = useCallback(() => Boolean(shapeAnimationRef.current), []);

  useEffect(() => {
    return () => {
      composerWrapRef.current?.classList.remove('composer-focused');
      composerWrapRef.current?.classList.remove('composer-multiline');
      pendingGeometryRelease.current?.();
      cancelComposerShapeAnimation(shapeState);
      if (shapeFrameRef.current !== null) cancelAnimationFrame(shapeFrameRef.current);
      shapeFrameRef.current = null;
      if (measuredEditorRef.current) releaseComposerMeasureProbe(measuredEditorRef.current);
      measuredEditorRef.current = null;
      collapsedMeasureRef.current = null;
      shapeHeightRef.current = null;
      composerWrapRef.current = null;
    };
  }, [shapeState]);

  return {
    captureShapeHeight,
    cacheSettledShapeHeight,
    syncComposerShape,
    handleComposerFocus,
    handleComposerBlur,
    isShapeAnimating,
  };
}

export function useComposerShapeObserver(
  editorDom: HTMLElement | null,
  syncComposerShape: (editorDom: HTMLElement, immediate?: boolean) => void,
  isShapeAnimating: () => boolean,
  cacheSettledShapeHeight: (wrap: HTMLElement) => void,
): void {
  useLayoutEffect(() => {
    if (!editorDom) return;
    const wrap = editorDom.closest<HTMLElement>('.composer-input-wrap');
    let previousEditorWidth = -1;
    let previousWrapWidth = -1;
    const observer = new ResizeObserver(() => {
      const editorWidth = editorDom.getBoundingClientRect().width;
      const wrapWidth = wrap?.getBoundingClientRect().width ?? -1;
      if (wrap && !isShapeAnimating()) {
        /* Height-only entries still refresh the settled cache after font or
           responsive layout changes. */
        cacheSettledShapeHeight(wrap);
      }
      /* The transition itself emits height changes every frame. Re-measure
         only when width changes can affect line wrapping. */
      if (
        Math.abs(editorWidth - previousEditorWidth) < 0.5
        && Math.abs(wrapWidth - previousWrapWidth) < 0.5
      ) return;
      previousEditorWidth = editorWidth;
      previousWrapWidth = wrapWidth;
      syncComposerShape(editorDom);
    });
    observer.observe(editorDom);
    if (wrap) observer.observe(wrap);
    previousEditorWidth = editorDom.getBoundingClientRect().width;
    previousWrapWidth = wrap?.getBoundingClientRect().width ?? -1;
    syncComposerShape(editorDom);
    return () => observer.disconnect();
  }, [editorDom, syncComposerShape, isShapeAnimating, cacheSettledShapeHeight]);
}
