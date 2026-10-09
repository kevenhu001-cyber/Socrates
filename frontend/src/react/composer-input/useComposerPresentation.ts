import { useEffect, useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { ComposerSurface } from '../../composer/types.ts';
import { syncComposerShellFlags } from '../../ui/composerShape.js';
import { useAutoHeight } from './useAutoHeight';

export function useComposerPresentation(
  editor: Editor | null,
  activePlaceholder: string,
  webSearchOn: boolean,
  surface: ComposerSurface,
): void {
  const editorElement = editor ? editor.view.dom as HTMLElement : null;
  const isDesktop = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width:769px)').matches
    : true;
  useAutoHeight(isDesktop ? editorElement : null, {
    motion: {
      velocity: 1100,
      maxDuration: 360,
      /* A single composer line is the whole transition the user sees, so do
         not let the planner's general snap threshold collapse that motion. */
      snapDistance: 0,
      minDuration: 140,
    },
  });

  /* Editor attributes are initial-only; keep the accessible name localized. */
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('aria-label', activePlaceholder);
  }, [editor, activePlaceholder]);

  /* Stamp the JS-owned mirror at the chips commit to keep the CSS hot path
     independent from :has(); the global observer covers attachments. */
  useLayoutEffect(() => {
    if (!editor) return;
    try {
      const wrap = editor.view.dom.closest('.composer-shell');
      if (wrap) syncComposerShellFlags(wrap);
    } catch (_) { /* empty-catch: intentional — the editor may have detached */ }
  }, [editor, webSearchOn, surface]);
}
