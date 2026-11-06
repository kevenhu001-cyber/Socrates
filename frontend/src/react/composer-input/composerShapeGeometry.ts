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

const measureProbes = new WeakMap<HTMLElement, { host: HTMLElement; editor: HTMLElement; html: string }>();

export function releaseComposerMeasureProbe(editorDom: HTMLElement): void {
  measureProbes.get(editorDom)?.host.remove();
  measureProbes.delete(editorDom);
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
  const previous = measureProbes.get(editorDom);
  const host = previous?.host ?? document.createElement('div');
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
  host.style.width = collapsedWidth + 'px';

  const editor = previous?.editor ?? editorDom.cloneNode(false) as HTMLElement;
  const html = editorDom.innerHTML;
  if (!previous || previous.html !== html) editor.innerHTML = html;
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('aria-label');
  editor.style.cssText = collapsedMeasure.editorStyle;
  editor.style.setProperty('width', '100%', 'important');
  editor.style.setProperty('height', 'auto', 'important');
  editor.style.setProperty('min-height', '0', 'important');
  editor.style.setProperty('max-height', 'none', 'important');
  editor.style.setProperty('overflow-y', 'auto', 'important');
  editor.style.setProperty('scrollbar-width', 'thin', 'important');
  if (!previous) {
    const styleEl = document.createElement('style');
    styleEl.textContent = '.composer-shape-probe p { margin: 0 !important; }';
    host.appendChild(styleEl);
    host.appendChild(editor);
    document.body.appendChild(host);
  }
  measureProbes.set(editorDom, { host, editor, html });
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

  // Structural line breaks prove expansion without cloning or measuring a
  // second DOM tree. Only a wrapped single paragraph needs the narrow probe.
  if (editorDom.querySelector('br:not(.ProseMirror-trailingBreak), p + p, li + li')) return true;
  let measureDom = editorDom;
  if (isMultiline && collapsedMeasureRef.current) {
    const probe = createCollapsedMeasureProbe(
      editorDom,
      wrapWidth,
      surface,
      collapsedMeasureRef.current,
    );
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

  /* Empty editors can exceed one line because of the surface's CSS minimum
     height. Only text or a rendered break may expand the shell. */
  return hasMultilineContent(hasRenderedBreak, hasEditorText, contentHeight, singleLineHeight, lineHeight);
}

function hasMultilineContent(
  hasRenderedBreak: boolean,
  hasEditorText: boolean,
  contentHeight: number,
  singleLineHeight: number,
  lineHeight = 24,
): boolean {
  // A second line of text adds an entire line height (typically 24px).
  // Require at least half a line height (12px) of overflow to reliably detect a second line,
  // preventing subpixel jitter, font descender protrusion, or 1px rounding discrepancies from falsely triggering multiline.
  const threshold = singleLineHeight + Math.max(10, Math.round(lineHeight * 0.5));
  return hasRenderedBreak || (hasEditorText && contentHeight >= threshold);
}

/** Commit intrinsic geometry once. Animating height on every frame forced the
 * transcript to reflow throughout typing, paste and keyboard transitions. */
export function transitionComposerShape(
  wrap: HTMLElement,
  shouldExpand: boolean,
  state: ComposerShapeState,
): void {
  cancelComposerShapeAnimation(state);
  wrap.classList.toggle('composer-multiline', shouldExpand);
  state.height.current = wrap.getBoundingClientRect().height;
}
