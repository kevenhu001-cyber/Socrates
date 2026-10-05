/** The one mounted editor serves the landing/topic and chat surfaces. */
export type ComposerSurface = 'topic' | 'chat';

/** A selected workflow rendered inside the editable composer surface. */
export interface ComposerExtensionToken {
  key: string;
  title: string;
  icon: string;
  hint?: string;
}
