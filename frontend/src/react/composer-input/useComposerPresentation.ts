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
      /* Keep ordinary typing out of the animated-layout hot path. A one-line
         composer delta is roughly 24–30px, so those changes settle in one
         frame; larger structural changes (paste, attachments, mode changes)
         still get a short, distance-aware morph. */
      velocity: 1800,
      maxDuration: 200,
      snapDistance: 30,
      minDuration: 90,
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
