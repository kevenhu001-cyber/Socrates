/**
 * P_canvas-mode — minimal i18n hook so CanvasBlock/CanvasToolbar don't
 * have to thread the t() function through every prop. Falls back to the
 * English string baked into the module when the key is missing, so a
 * missing i18n entry never breaks the canvas UI.
 */

import { t } from '../legacy/gateway.ts';

type Translator = (key: string, fallback?: string) => string;

const FALLBACKS: Record<string, string> = {
  'composer.canvas.edit': 'Edit',
  'composer.canvas.done': 'Done',
  'composer.canvas.copy': 'Copy',
  'composer.canvas.iterate': 'Iterate',
  'composer.canvas.fullscreen': 'Fullscreen',
  'composer.canvas.original': 'Original',
  'composer.canvas.editedView': 'Edited',
  'composer.canvas.edited': 'Edited',
  'composer.canvas.iterateEmpty': 'Canvas is empty.',
};

export function useTranslation(): Translator {
  return function translate(key: string, fallback?: string): string {
    const v = t(key);
    if (typeof v === 'string' && v && v !== key) return v;
    return FALLBACKS[key] ?? fallback ?? key;
  };
}