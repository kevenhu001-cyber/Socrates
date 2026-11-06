import { stateStore } from '../../state/store.ts';
/**
 * RN-3 web adapters for the shared learning scaffolds (packages/ui/src/learn).
 * Every surface mounts through WebUiTheme (rnwGlobal first); content fields
 * are rendered by the shell's markdown + KaTeX pipeline into `.sc-rich`
 * blocks, and grading / reporting stays in render/widgetRuntime.ts.
 */
import { recordRecallRating } from '../../tutor/recallRatings.ts';
import { daysUntilReview, flashcardUiState, recordReview, rememberFlashcardUiState, reviewCardFor } from '../../tutor/reviewDeck.ts';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { hasMathDelimiters } from '../../render/markdownMath.ts';
import { onKatexReady } from '../../vendor/lazy.ts';
import {
  DefinitionCard,
  FlashcardCard,
  KeyPointCard,
  LearnHostProvider,
  ProblemCard,
  ProofCard,
  QuizCard,
  StepsCard,
  TheoremCard,
  hintLevels,
  learnStrings,
  parseAnswerKey,
  splitDerivationSteps,
  derivationStepSource,
  type FlashcardState,
  type QuizResult,
  type RecallRating,
  type ReviewCard,
} from '@socrates/ui/learn';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { getCurrentLang } from '../legacy/gateway';
import { reportSwallow } from '../../util/reportSwallow.ts';
import {
  revealPracticeAnswer,
  submitPracticeAnswer,
  widgetRuntime,
  type ParsedStep,
  type PracticeMountData,
  type QuizMountData,
  type TheoremMountData,
} from '../../render/widgetRuntime.ts';
import type { ParsedDefinition, ParsedDerivation, ParsedExample, ParsedFlashcard, ParsedKeyPoint, ParsedProof } from '@socrates/ui/learn-model';

/** The shell's i18n lookup for the few labels the shared cards do not own. */
function tr(key: string, fallback: string): string {
  const value = widgetRuntime().t(key);
  return value && value !== key ? value : fallback;
}

function RichHtml({ source, part }: { source: string; part: string }) {
  /* KaTeX loads on demand. A card whose field holds the reply's only math
     (a derivation step, an answer key) is painted before it lands, and the
     turn-level KaTeX repaint only re-renders prose; repaint the field once. */
  const [katexTick, setKatexTick] = useState(0);
  useEffect(() => {
    if (!hasMathDelimiters(source)) return undefined;
    // Subscribe even if KaTeX completed between render and this effect.
    return onKatexReady(() => setKatexTick((value) => value + 1));
  }, [source]);
  const html = useMemo(() => {
    void katexTick; // repaint once KaTeX is ready
    try {
      return widgetRuntime().formatMsg(source);
    } catch (error) {
      reportSwallow(error, 'learn.renderRich');
      return widgetRuntime().esc(source);
    }
  }, [source, katexTick]);
  return <div className="sc-rich" data-part={part} dangerouslySetInnerHTML={{ __html: html }} />;
}

const renderRich = (source: string, part: string): ReactNode => <RichHtml source={source} part={part} />;

/** Theme + host context for one mounted scaffold. Re-renders on language change. */
export function LearnMount({ readOnly, children }: { readOnly: boolean; children?: ReactNode }) {
  useLocaleRefresh();
  const strings = learnStrings(getCurrentLang());
  return (
    <WebUiTheme>
      <LearnHostProvider value={{ strings, renderRich, readOnly }}>{children}</LearnHostProvider>
    </WebUiTheme>
  );
}

// Retain the submitted answer when the tutor follow-up rebuilds the transcript.
const submittedQuizzes = new Map<string, { letters: string[]; result: QuizResult }>();

export function QuizScaffold({ parsed }: { parsed: QuizMountData }) {
  if (!parsed.options.length) {
    return <PracticeScaffold parsed={{ title: '', problem: parsed.q, hint: '' }} />;
  }
  const answerKey = parseAnswerKey(parsed.correct);
  const answerId = JSON.stringify([stateStore.read('currentSessionId'), parsed.q, parsed.options, answerKey]);
  const onSubmit = (letters: string[]): QuizResult | Promise<QuizResult> => {
    const pick = widgetRuntime().handleQuizPick;
    const chosen = parsed.options.filter((option) => letters.includes(option.letter));
    const picked = { letter: letters.join(''), text: chosen.map((option) => option.text).join('; ') };
    if (!pick) {
      /* No runtime wired (tests, standalone): grade locally without side effects. */
      const right = answerKey.length > 0 && answerKey.join('') === picked.letter;
      return { verdict: answerKey.length ? (right ? 'correct' : 'incorrect') : 'recorded', feedback: '' };
    }
    const toResult = (feedback: { feedbackText: string; feedbackClass: string; verdict?: QuizResult['verdict'] }): QuizResult => ({
      verdict: feedback.verdict ?? (/\bok\b/.test(feedback.feedbackClass) ? 'correct' : /\bbad\b/.test(feedback.feedbackClass) ? 'incorrect' : 'recorded'),
      feedback: feedback.feedbackText,
    });
    const right = answerKey.join('') === picked.letter;
    submittedQuizzes.set(answerId, { letters, result: { verdict: answerKey.length ? (right ? 'correct' : 'incorrect') : 'recorded', feedback: '' } });
    if (submittedQuizzes.size > 100) submittedQuizzes.delete(submittedQuizzes.keys().next().value!);
    const outcome = pick(picked, parsed);
    return outcome instanceof Promise ? outcome.then(toResult) : toResult(outcome);
  };
  return (
    <QuizCard
      initialAnswer={submittedQuizzes.get(answerId)}
      question={parsed.q || ''}
      options={parsed.options || []}
      answerKey={answerKey}
      multi={Boolean(parsed.multi)}
      explanation={parsed.explanation}
      onSubmit={onSubmit}
    />
  );
}

export function PracticeScaffold({ parsed }: { parsed: PracticeMountData }) {
  return (
    <ProblemCard
      kind="practice"
      title={parsed.title}
      problem={parsed.problem || ''}
      hints={hintLevels(parsed)}
      solution={parsed.solution}
      hasAnswerKey={Boolean(parsed.correct)}
      onSubmitAnswer={(answer) => submitPracticeAnswer(parsed, answer)}
      onRevealAnswer={() => revealPracticeAnswer(parsed)}
    />
  );
}

export function ExampleScaffold({ parsed }: { parsed: ParsedExample }) {
  return (
    <ProblemCard
      kind="example"
      title={parsed.title}
      problem={parsed.problem}
      hints={hintLevels(parsed)}
      solution={parsed.solution}
      initialSolutionOpen={Boolean(parsed._revealed)}
      onSolutionToggle={(open) => { parsed._revealed = open; }}
    />
  );
}

/** RN-14: when a rated card comes back, in the interface language. */
export function reviewScheduleNote(card: ReviewCard | null, now = Date.now()): string | null {
  if (!card) return null;
  const days = daysUntilReview(card, now);
  if (days <= 0) return tr('review.laterToday', 'Back again later today');
  if (days === 1) return tr('review.tomorrow', 'Next review tomorrow');
  return tr('review.inDays', 'Next review in {n} days').replace('{n}', String(days));
}

export function FlashcardScaffold({ parsed }: { parsed: ParsedFlashcard }) {
  const front = parsed.front || '';
  const back = parsed.back || '';
  /* RN-14: a re-render remounts this card; it resumes where it was. */
  const [initial] = useState(() => flashcardUiState(front));
  const [note, setNote] = useState<string | null>(() => (initial?.rating ? reviewScheduleNote(reviewCardFor(front)) : null));
  const onStateChange = useCallback((state: FlashcardState) => rememberFlashcardUiState(front, state), [front]);
  const onRate = (rating: RecallRating) => {
    /* RN-6: the self-rating goes back to the tutor as next-turn context. */
    recordRecallRating(front, rating);
    /* RN-14: and schedules the card for spaced review. */
    setNote(reviewScheduleNote(recordReview(front, back, rating)));
  };
  return <FlashcardCard front={front} back={back} onRate={onRate} initialState={initial} onStateChange={onStateChange} note={note} />;
}

export function DefinitionScaffold({ parsed }: { parsed: ParsedDefinition }) {
  return <DefinitionCard term={parsed.term} body={parsed.body} />;
}

export function KeyPointScaffold({ parsed }: { parsed: ParsedKeyPoint }) {
  return <KeyPointCard body={parsed.body} />;
}

export function TheoremScaffold({ parsed }: { parsed: TheoremMountData }) {
  return <TheoremCard title={parsed.title} statement={parsed.statement} proofTitle={parsed.proofTitle} proofBody={parsed.proofBody} />;
}

export function ProofScaffold({ parsed }: { parsed: ParsedProof }) {
  return <ProofCard title={parsed.title} body={parsed.body} />;
}

export function StepListScaffold({ steps }: { steps: ParsedStep[] }) {
  return <StepsCard kind="step" steps={steps} />;
}

export function DerivationScaffold({ parsed }: { parsed: ParsedDerivation }) {
  const steps = splitDerivationSteps(parsed.body).map((body, index) => ({ n: index + 1, body: derivationStepSource(body) }));
  return <StepsCard kind="derivation" title={parsed.title} steps={steps} />;
}
