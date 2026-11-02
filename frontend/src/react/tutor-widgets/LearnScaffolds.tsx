/**
 * RN-3 web adapters for the shared learning scaffolds (packages/ui/src/learn).
 * Every surface mounts through WebUiTheme (rnwGlobal first); content fields
 * are rendered by the shell's markdown + KaTeX pipeline into `.sc-rich`
 * blocks, and grading / reporting stays in render/widgetRuntime.ts.
 */
import { recordRecallRating } from '../../tutor/recallRatings.ts';
import { daysUntilReview, flashcardUiState, recordReview, rememberFlashcardUiState, reviewCardFor } from '../../tutor/reviewDeck.ts';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
  parseAnswerKey,
  splitDerivationSteps,
  type FlashcardState,
  type LearnStrings,
  type QuizResult,
  type RecallRating,
  type ReviewCard,
} from '@socrates/ui/learn';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
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

function tr(key: string, fallback: string): string {
  const value = widgetRuntime().t(key);
  return value && value !== key ? value : fallback;
}

function learnStrings(): LearnStrings {
  return {
    label: {
      quiz: tr('learn.label.quiz', 'Quiz'),
      flashcard: tr('learn.label.flashcard', 'Flashcard'),
      practice: tr('learn.label.practice', 'Practice'),
      example: tr('learn.label.example', 'Example'),
      step: tr('learn.label.step', 'Steps'),
      definition: tr('learn.label.definition', 'Definition'),
      theorem: tr('learn.label.theorem', 'Theorem'),
      proof: tr('learn.label.proof', 'Proof'),
      derivation: tr('learn.label.derivation', 'Derivation'),
      keyPoint: tr('tutor.keyPointLabel', 'Key point'),
    },
    quizMulti: tr('learn.quiz.multi', 'Select all that apply'),
    quizSubmit: tr('learn.quiz.submit', 'Check answer'),
    quizRetry: tr('learn.quiz.retry', 'Try again'),
    quizExplanation: tr('learn.quiz.explanation', 'Explanation'),
    quizAnswerIs: tr('learn.quiz.answerIs', 'Answer: {answer}'),
    quizCorrect: tr('tutor.practiceSelfCorrect', 'Correct'),
    quizIncorrect: tr('learn.quiz.incorrect', 'Not quite'),
    readOnly: tr('learn.readOnly', 'View only'),
    flashcardAria: tr('tutor.flashcardAria', 'Flashcard — press to turn'),
    flashcardFront: tr('learn.flashcard.front', 'Question'),
    flashcardBack: tr('learn.flashcard.back', 'Answer'),
    flashcardFlip: tr('learn.flashcard.flip', 'Turn the card'),
    flashcardFlipBack: tr('learn.flashcard.flipBack', 'Back to question'),
    flashcardPrompt: tr('learn.flashcard.prompt', 'Answer it in your head first, then turn the card.'),
    flashcardRate: tr('learn.flashcard.rate', 'Did you remember it?'),
    rating: {
      good: tr('learn.flashcard.good', 'Remembered'),
      fuzzy: tr('learn.flashcard.fuzzy', 'Fuzzy'),
      forgot: tr('learn.flashcard.forgot', 'Forgot'),
    },
    ratingNote: {
      good: tr('learn.flashcard.noteGood', 'Remembered. Leave it a little longer next time.'),
      fuzzy: tr('learn.flashcard.noteFuzzy', 'A bit fuzzy. Come back sooner and explain it again.'),
      forgot: tr('learn.flashcard.noteForgot', 'That is fine. Read the answer, then try again soon.'),
    },
    hintShow: tr('tutor.showHint', 'Show hint'),
    hintNext: tr('learn.hint.next', 'Next hint ({n}/{total})'),
    hintHide: tr('tutor.hideHint', 'Hide hints'),
    hintLevel: tr('learn.hint.level', 'Hint {n}'),
    solutionShow: tr('tutor.showSolution', 'Show solution'),
    solutionHide: tr('tutor.hideSolution', 'Hide solution'),
    answerPlaceholder: tr('tutor.practicePlaceholder', 'Type your answer…'),
    answerSubmit: tr('tutor.submitAnswer', 'Submit'),
    answerReveal: tr('tutor.revealAnswer', 'Reveal answer'),
    stepsStepMode: tr('learn.steps.stepMode', 'Step through'),
    stepsNext: tr('learn.steps.next', 'Next step ({n}/{total})'),
    stepsAll: tr('learn.steps.all', 'Show all'),
    proofShow: tr('tutor.showProof', 'Show proof'),
    proofHide: tr('tutor.hideProof', 'Hide proof'),
  };
}

function RichHtml({ source, part }: { source: string; part: string }) {
  const html = useMemo(() => {
    try {
      return widgetRuntime().formatMsg(source);
    } catch (error) {
      reportSwallow(error, 'learn.renderRich');
      return widgetRuntime().esc(source);
    }
  }, [source]);
  return <div className="sc-rich" data-part={part} dangerouslySetInnerHTML={{ __html: html }} />;
}

const renderRich = (source: string, part: string): ReactNode => <RichHtml source={source} part={part} />;

/** Theme + host context for one mounted scaffold. Re-renders on language change. */
export function LearnMount({ readOnly, children }: { readOnly: boolean; children?: ReactNode }) {
  useLocaleRefresh();
  const strings = learnStrings();
  return (
    <WebUiTheme>
      <LearnHostProvider value={{ strings, renderRich, readOnly }}>{children}</LearnHostProvider>
    </WebUiTheme>
  );
}

export function QuizScaffold({ parsed }: { parsed: QuizMountData }) {
  const answerKey = parseAnswerKey(parsed.correct);
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
    const outcome = pick(picked, parsed);
    return outcome instanceof Promise ? outcome.then(toResult) : toResult(outcome);
  };
  return (
    <QuizCard
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
  const steps = splitDerivationSteps(parsed.body).map((body, index) => ({ n: index + 1, body }));
  return <StepsCard kind="derivation" title={parsed.title} steps={steps} />;
}
