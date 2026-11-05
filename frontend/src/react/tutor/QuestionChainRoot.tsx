/**
 * RN-4 web adapters for the shared "Think out loud" module
 * (packages/ui/src/think). The module draws; this file supplies copy (i18n),
 * the session's chain, the mistake book and the send path.
 *
 *  - LatestTutorQuestionChain   under the latest settled tutor reply in the transcript;
 *  - SessionLearningModes the capsule menu next to the conversation composer.
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useEffect, useSyncExternalStore } from 'react';
import { extractNextQuestions } from '@socrates/core/learningBlocks';
import { useSessionStore } from '../../store/index.ts';
import {
  LEARNING_MODES,
  LearningModeSwitch,
  QuestionChain,
  askCandidates,
  learningModeSpec,
  mistakeCandidates,
  type ChainCandidate,
  type LearningModeOption,
  type QuestionChainStrings,
} from '@socrates/ui/think';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { useInlineMath } from '../rn/useInlineMath';
import { i18n } from '../legacy/gateway.ts';
import { useKbStore } from '../../store/index.ts';
import { useIsChatStreaming } from '../useChatRuntime.ts';
import { getQuestionChain, subscribeQuestionChain, syncQuestionChain } from '../../tutor/questionChain.ts';
import { followChainCandidate } from '../../tutor/questionChainActions.ts';
import { chooseLearningMode, getLearningMode, subscribeLearningMode } from '../../tutor/learningMode.ts';

export function chainStrings(): QuestionChainStrings {
  return {
    title: i18n('chain.title', 'Question chain'),
    next: i18n('chain.next', 'Ask next'),
    nextFromMistakes: i18n('chain.nextFromMistakes', 'From your mistakes'),
    expand: i18n('chain.expand', 'Show all'),
    collapse: i18n('chain.collapse', 'Fold'),
    folded: i18n('chain.folded', '{n} more questions'),
    current: i18n('chain.current', 'Current question'),
    own: i18n('chain.own', 'You asked'),
  };
}

export function learningModeOptions(surface: 'home' | 'session' = 'home'): LearningModeOption[] {
  return LEARNING_MODES.map((mode) => {
    const modeLabel = i18n(mode.labelKey, mode.id);
    if (surface === 'home') return { id: mode.id, label: modeLabel, hint: i18n(mode.hintKey, '') };
    return {
      id: mode.id,
      label: i18n(`learnMode.session.${mode.id}.label`, modeLabel),
      hint: i18n(`learnMode.session.${mode.id}.hint`, i18n(mode.hintKey, '')),
      triggerLabel: modeLabel,
    };
  });
}

export function useLearningMode() {
  return useSyncExternalStore(subscribeLearningMode, getLearningMode);
}

export interface QuestionChainRootProps {
  prompts: readonly string[];
  onFollow: (candidate: ChainCandidate) => void;
}

export function LatestTutorQuestionChain({ rawText }: { rawText: string }) {
  const parsed = extractNextQuestions(rawText);
  return (
    <div className="tutor-question-chain">
      <QuestionChainRoot prompts={parsed.status === 'ok' ? parsed.questions : []} onFollow={followChainCandidate} />
    </div>
  );
}

export function QuestionChainRoot({ prompts, onFollow }: QuestionChainRootProps) {
  useLocaleRefresh();
  const sessionId = useSessionStore((snapshot) => snapshot.currentSessionId);
  const chain = useSyncExternalStore(subscribeQuestionChain, getQuestionChain);
  useEffect(() => { syncQuestionChain(); }, [sessionId]);
  const sessionMatches = chain.sessionKey === (sessionId ?? null);
  const mode = useLearningMode();
  const mistakes = useKbStore((snapshot) => snapshot.mistakes);
  const streaming = useIsChatStreaming();
  const renderText = useInlineMath();
  const fromMistakes = learningModeSpec(mode).candidatesFromMistakes ? mistakeCandidates(mistakes) : [];
  /* While a reply streams there is nothing to choose yet: the chain shows
     where the learner is, and the next questions return with the reply. */
  const candidates = streaming ? [] : (fromMistakes.length > 0 ? fromMistakes : askCandidates(prompts, chain.steps));
  if (!sessionMatches) return null;
  return (
    <WebUiTheme>
      <QuestionChain steps={chain.steps} candidates={candidates} strings={chainStrings()} onSelect={onFollow} busy={streaming} renderText={renderText} />
    </WebUiTheme>
  );
}

export function SessionLearningModes() {
  useLocaleRefresh();
  const mode = useLearningMode();
  return (
    <WebUiTheme>
      <LearningModeSwitch
        variant="menu"
        options={learningModeOptions('session')}
        value={mode}
        label={i18n('learnMode.label', 'Learning mode')}
        triggerLabel={i18n('learnMode.trigger', 'Mode: {mode}')}
        onChange={(id) => { void chooseLearningMode(id, 'session'); }}
      />
    </WebUiTheme>
  );
}
