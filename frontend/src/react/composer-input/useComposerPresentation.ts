import { useEffect, useLayoutEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { ComposerSurface } from '../../composer/types.ts';
import { syncComposerShellFlags } from '../../ui/composerShape.ts';

export function useComposerPresentation(
  editor: Editor | null,
  activePlaceholder: string,
  webSearchOn: boolean,
  surface: ComposerSurface,
): void {
  // CSS owns the editor's intrinsic height; avoid a second JS height animation
  // competing with the shell's multiline geometry and mobile keyboard.

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
