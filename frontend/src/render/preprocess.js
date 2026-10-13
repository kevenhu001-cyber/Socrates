/* Runtime adapter around the TypeScript preprocessors.
   Keep the broad weak-model normalization rules in preprocess.ts; this entry
   adds the display-math/Markdown boundary repair that must run BEFORE those
   rules decide which lines are inside math. */
export * from './preprocess.ts';
export { recoverUnclosedDisplayMathBeforeHeading } from './markdownBoundary.ts';

import {
  preprocessMarkdown as preprocessMarkdownBase,
  preprocessMarkdownForStreaming as preprocessMarkdownForStreamingBase,
} from './preprocess.ts';
import { recoverUnclosedDisplayMathBeforeHeading } from './markdownBoundary.ts';

export function preprocessMarkdown(t) {
  return preprocessMarkdownBase(recoverUnclosedDisplayMathBeforeHeading(t));
}

export function preprocessMarkdownForStreaming(t, opts) {
  return preprocessMarkdownForStreamingBase(recoverUnclosedDisplayMathBeforeHeading(t), opts);
}
