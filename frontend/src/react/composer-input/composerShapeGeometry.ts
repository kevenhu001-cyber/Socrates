import type { ComposerSurface } from '../../composer/types.ts';

type MutableRef<T> = { current: T };
export type CollapsedComposerMeasure = {
  editorWidth: number;
  wrapWidth: number;
  editorStyle: string;
  singleLineHeight: number;
};
export type ShapeAnimation = { cancel(): void };

export interface ComposerShapeState {
  animation: MutableRef<ShapeAnimation | null>;
  animationCleanup: MutableRef<(() => void) | null>;
  height: MutableRef<number | null>;
}

export function cancelComposerShapeAnimation(state: ComposerShapeState): void {
  state.animation.current?.cancel();
  state.animation.current = null;
  state.animationCleanup.current?.();
  state.animationCleanup.current = null;
}

export function clearPluginOnlyShape(
  editorDom: HTMLElement,
  wrap: HTMLElement,
  state: ComposerShapeState,
): boolean {
  const hasPluginChips = Boolean(wrap.querySelector('.composer-plugin-chips'));
  const hasEditorText = Boolean((editorDom.textContent || '').replace(/\u200b/g, '').trim());
  if (!hasPluginChips || hasEditorText) return false;

  cancelComposerShapeAnimation(state);
  wrap.classList.remove('composer-multiline');
  wrap.style.removeProperty('height');
  state.height.current = wrap.getBoundingClientRect().height;
  return true;
}

function cacheCollapsedMeasure(
  editorDom: HTMLElement,
  wrapWidth: number,
  singleLineHeight: number,
): CollapsedComposerMeasure {
  const style = getComputedStyle(editorDom);
  return {
    editorWidth: editorDom.getBoundingClientRect().width,
    wrapWidth,
    singleLineHeight,
    editorStyle: [
      'box-sizing:' + style.boxSizing,
      'padding:' + style.padding,
      'font:' + style.font,
      'line-height:' + style.lineHeight,
      'letter-spacing:' + style.letterSpacing,
      'word-break:' + style.wordBreak,
      'overflow-wrap:' + style.overflowWrap,
      'white-space:' + style.whiteSpace,
    ].join(';'),
  };
}

function updateCollapsedMeasure(
  editorDom: HTMLElement,
  wrapWidth: number,
  collapsedMeasureRef: MutableRef<CollapsedComposerMeasure | null>,
): void {
  const measuredEditorHeight = editorDom.clientHeight;
  const previousHeight = collapsedMeasureRef.current?.singleLineHeight ?? 0;
  const singleLineHeight = previousHeight > 0
    ? Math.min(measuredEditorHeight, previousHeight)
    : measuredEditorHeight;
  collapsedMeasureRef.current = cacheCollapsedMeasure(editorDom, wrapWidth, singleLineHeight);
}

function createCollapsedMeasureProbe(
  editorDom: HTMLElement,
  wrapWidth: number,
  surface: ComposerSurface,
  collapsedMeasure: CollapsedComposerMeasure,
): { host: HTMLElement; editor: HTMLElement } {
  const collapsedWidth = Math.max(
    1,
    collapsedMeasure.editorWidth + wrapWidth - collapsedMeasure.wrapWidth,
  );
  const host = document.createElement('div');
  host.className = 'rich-composer composer-shape-probe';
  host.dataset.surface = surface;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:' + collapsedWidth + 'px',
    'visibility:hidden',
    'pointer-events:none',
    'contain:layout style',
  ].join(';');

  const editor = editorDom.cloneNode(true) as HTMLElement;
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('aria-label');
  editor.style.cssText = collapsedMeasure.editorStyle;
  editor.style.setProperty('width', '100%', 'important');
  editor.style.setProperty('height', 'auto', 'important');
  editor.style.setProperty('min-height', '0', 'important');
  editor.style.setProperty('max-height', 'none', 'important');
  editor.style.setProperty('overflow', 'visible', 'important');
  host.appendChild(editor);
  document.body.appendChild(host);
  return { host, editor };
}

export function shouldExpandComposer(
  editorDom: HTMLElement,
  wrap: HTMLElement,
  surface: ComposerSurface,
  collapsedMeasureRef: MutableRef<CollapsedComposerMeasure | null>,
): boolean {
  const style = getComputedStyle(editorDom);
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  const isMultiline = wrap.classList.contains('composer-multiline');
  const wrapWidth = wrap.getBoundingClientRect().width;
  const hasEditorText = Boolean((editorDom.textContent || '').replace(/\u200b/g, '').trim());

  /* Keep the smallest settled one-line measurement. The browser can grow the
     intrinsic box before an explicit line break is reflected in layout. */
  if (!isMultiline) updateCollapsedMeasure(editorDom, wrapWidth, collapsedMeasureRef);

  let measureDom = editorDom;
  let probeHost: HTMLElement | null = null;
  if (isMultiline && collapsedMeasureRef.current) {
    const probe = createCollapsedMeasureProbe(
      editorDom,
      wrapWidth,
      surface,
      collapsedMeasureRef.current,
    );
    probeHost = probe.host;
    measureDom = probe.editor;
  }

  const measureStyle = getComputedStyle(measureDom);
  const paddingY = (Number.parseFloat(measureStyle.paddingTop) || 0)
    + (Number.parseFloat(measureStyle.paddingBottom) || 0);
  const singleLineHeight = Math.max(
    paddingY + lineHeight,
    collapsedMeasureRef.current?.singleLineHeight ?? 0,
  );
  const contentHeight = measureDom.scrollHeight;
  /* Ignore ProseMirror's synthetic trailing break in an otherwise empty
     paragraph; real breaks and a second block prove multiline content. */
  const hasRenderedBreak = Boolean(
    measureDom.querySelector('br:not(.ProseMirror-trailingBreak), p + p, li + li'),
  );
  probeHost?.remove();

  /* Empty editors can exceed one line because of the surface's CSS minimum
     height. Only text or a rendered break may expand the shell. */
  return hasMultilineContent(hasRenderedBreak, hasEditorText, contentHeight, singleLineHeight);
}

function hasMultilineContent(
  hasRenderedBreak: boolean,
  hasEditorText: boolean,
  contentHeight: number,
  singleLineHeight: number,
): boolean {
  return hasRenderedBreak || (hasEditorText && contentHeight > singleLineHeight + 1);
}

function lockComposerGeometry(wrap: HTMLElement, fromHeight: number): () => void {
  const properties = ['transition', 'min-height', 'overflow', 'height', 'box-sizing'];
  const previous = properties.map((property) => ({
    property,
    value: wrap.style.getPropertyValue(property),
    priority: wrap.style.getPropertyPriority(property),
  }));
  wrap.style.setProperty('transition', 'none', 'important');
  wrap.style.setProperty('min-height', '0px', 'important');
  wrap.style.setProperty('overflow', 'hidden', 'important');
  /* Use border-box so the interpolated height matches getBoundingClientRect. */
  wrap.style.setProperty('box-sizing', 'border-box', 'important');
  wrap.style.setProperty('height', fromHeight + 'px', 'important');
  return () => {
    const restore = ({ property, value, priority }: typeof previous[number]) => {
      if (value) wrap.style.setProperty(property, value, priority);
      else wrap.style.removeProperty(property);
    };
    /* Keep transitions disabled while restoring geometry to avoid a second
       min-height animation as the temporary lock is removed. */
    previous.filter(({ property }) => property !== 'transition').forEach(restore);
    void wrap.getBoundingClientRect();
    const transition = previous.find(({ property }) => property === 'transition');
    if (transition) restore(transition);
  };
}

function startComposerShapeAnimation(
  wrap: HTMLElement,
  fromHeight: number,
  toHeight: number,
  cleanup: () => void,
  state: ComposerShapeState,
): void {
  state.animationCleanup.current = cleanup;
  const duration = 340;
  const startedAt = performance.now();
  let frame = 0;
  let cancelled = false;
  const controller: ShapeAnimation = {
    cancel() {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    },
  };
  const tick = (now: number) => {
    if (cancelled) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    /* Cubic ease-out avoids the initial jump of a front-loaded easing curve. */
    const eased = 1 - Math.pow(1 - progress, 3);
    const height = fromHeight + (toHeight - fromHeight) * eased;
    wrap.style.setProperty('height', height + 'px', 'important');
    state.height.current = height;
    if (progress < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    if (state.animation.current !== controller) return;
    state.animation.current = null;
    state.animationCleanup.current = null;
    cleanup();
    state.height.current = wrap.getBoundingClientRect().height;
  };
  state.animation.current = controller;
  frame = requestAnimationFrame(tick);
}

function getTransitionStartHeight(
  wrap: HTMLElement,
  shouldExpand: boolean,
  classChanges: boolean,
  state: ComposerShapeState,
): number {
  const renderedHeight = wrap.getBoundingClientRect().height;
  if (state.animation.current) return renderedHeight;
  if (classChanges && shouldExpand) {
    /* The collapsed shell is fixed-height. Keep the cached painted baseline
       when a paste or early font settling has already changed its live rect. */
    return Math.max(renderedHeight, state.height.current ?? 0);
  }
  const cachedHeight = state.height.current;
  return cachedHeight && cachedHeight > 0 ? cachedHeight : renderedHeight;
}

function shouldAnimateShape(wrap: HTMLElement, fromHeight: number, toHeight: number): boolean {
  return !matchMedia('(prefers-reduced-motion:reduce)').matches
    && Math.abs(toHeight - fromHeight) > 1;
}

export function transitionComposerShape(
  wrap: HTMLElement,
  shouldExpand: boolean,
  state: ComposerShapeState,
): void {
  const classChanges = wrap.classList.contains('composer-multiline') !== shouldExpand;
  if (!shouldExpand && !classChanges) {
    /* Empty and one-line drafts keep the CSS baseline instead of animating
       toward the editor's smaller intrinsic height. */
    if (!state.animation.current) state.height.current = wrap.getBoundingClientRect().height;
    return;
  }

  const fromHeight = getTransitionStartHeight(wrap, shouldExpand, classChanges, state);
  cancelComposerShapeAnimation(state);

  const shouldAnimate = !matchMedia('(prefers-reduced-motion:reduce)').matches;
  const cleanupTemporaryStyles = shouldAnimate
    ? lockComposerGeometry(wrap, fromHeight)
    : null;
  if (classChanges) wrap.classList.toggle('composer-multiline', shouldExpand);

  /* Read the destination while the temporary geometry lock is synchronously
     released, then restore the painted start height before yielding. */
  if (shouldAnimate) wrap.style.removeProperty('height');
  const toHeight = wrap.getBoundingClientRect().height;
  if (shouldAnimate) wrap.style.setProperty('height', fromHeight + 'px', 'important');

  if (cleanupTemporaryStyles && shouldAnimateShape(wrap, fromHeight, toHeight)) {
    startComposerShapeAnimation(wrap, fromHeight, toHeight, cleanupTemporaryStyles, state);
  } else {
    cleanupTemporaryStyles?.();
    state.height.current = wrap.getBoundingClientRect().height;
  }
}
