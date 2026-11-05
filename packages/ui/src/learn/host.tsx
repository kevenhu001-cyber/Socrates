/**
 * Host contract for the RN-3 learning scaffolds.
 *
 * The scaffolds never parse markdown or math themselves: every content field
 * is handed back to the host through `renderRich(source, part)`. The web shell
 * answers with its markdown + KaTeX HTML; a native client can answer with its
 * own markdown view. `part` names the field (`quiz-q`, `definition-term`, …)
 * so hosts and tests can address it.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { defaultLearnStrings, type LearnStrings } from './strings.ts';

export { defaultLearnStrings, learnStrings, type LearnStrings } from './strings.ts';

export interface LearnHost {
  strings: LearnStrings;
  /** Render one markdown field. Must return block content. */
  renderRich: (source: string, part: string) => ReactNode;
  /** Shared / replayed transcripts: no grading, no reporting. */
  readOnly?: boolean;
}

const fallbackHost: LearnHost = {
  strings: defaultLearnStrings,
  renderRich: () => null,
};

const LearnHostContext = createContext<LearnHost>(fallbackHost);

export function LearnHostProvider({ value, children }: { value: LearnHost; children: ReactNode }) {
  return <LearnHostContext.Provider value={value}>{children}</LearnHostContext.Provider>;
}

export function useLearnHost(): LearnHost {
  return useContext(LearnHostContext);
}
