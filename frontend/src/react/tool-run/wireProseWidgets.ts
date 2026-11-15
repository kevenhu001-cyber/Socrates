import { getLegacyActions } from '../legacy/gateway';

/** Called after each prose owner paints, including lazily mounted history. */
export function wireProseWidgets(element: HTMLElement): void {
  try {
    const postRender = getLegacyActions().postRender;
    if (element.querySelector('.viz')) {
      postRender.reclaimVizCards?.(element);
      if (postRender.schedulePendingMermaid) postRender.schedulePendingMermaid();
      else postRender.processPendingMermaid?.();
      postRender.processPendingViz?.(element);
      postRender.processPendingVizActions?.(element);
    }
    postRender.wireCodeBlockHeaders?.(element);
  } catch {
    /* empty-catch: intentional — optional widget wiring must not break prose */
  }
}
