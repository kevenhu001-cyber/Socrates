/**
 * Quiz: rounded option rows with letter tiles, single or multiple choice.
 * Pick, then check: the host grades (and records mistakes / asks the tutor),
 * the card shows the verdict in ink or grey with a ✓ / ✕ glyph and words,
 * opens the explanation, and offers a retry after a wrong answer.
 */
import { useReducer, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { useReducedMotion } from '../turn/parts';
import { H, R, S, focusRing, insetRing, sheets, transition } from '../look';
import { useLearnHost } from './host';
import {
  fillTemplate,
  formatAnswerKey,
  gradeQuiz,
  initialQuizState,
  quizOptionMark,
  quizReducer,
  type QuizOption,
  type QuizOptionMark,
  type QuizVerdict,
} from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard, Section, Tag, VerdictGlyph, dataSet } from './parts';

export interface QuizResult {
  verdict: QuizVerdict;
  /** Feedback line to show (already localized by the host). */
  feedback: string;
}

export interface QuizCardProps {
  question: string;
  options: readonly QuizOption[];
  /** Sorted answer letters; empty when the quiz has no key. */
  answerKey: readonly string[];
  multi?: boolean;
  explanation?: string;
  /** Grade + report. May be async. Absent: graded locally, nothing reported. */
  onSubmit?: (letters: string[]) => QuizResult | Promise<QuizResult>;
  testID?: string;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof value === 'object' && typeof (value as Promise<T>).then === 'function';
}

/**
 * Site `.ui-option`: a 44px row on a 12px radius with an inset hairline;
 * the chosen row takes the `#f9f9f9` sheet and a 1.5px ink ring. The letter
 * sits in a 24px ring (a circle for one answer, a rounded square for many)
 * that fills with ink when chosen. Once graded the letter stays, so the
 * feedback line ("the correct answer is option B") can point at it, and the
 * verdict sits at the row end as a ✓ / ✕ glyph.
 */
function OptionRow({ option, mark, multi, disabled, onPress }: {
  option: QuizOption;
  mark: QuizOptionMark;
  multi: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useUiTheme();
  const reduced = useReducedMotion();
  const { subtle } = sheets(colors);
  const { scale, hovered, focused, handlers } = usePressFeedback();
  const live = hovered && !disabled && mark === 'idle';
  const strong = mark === 'selected' || mark === 'correct';
  const ring = strong
    ? insetRing(colors.ink, 1.5)
    : mark === 'missed'
      ? insetRing(colors.ink, 1)
      : insetRing(live ? colors.hairlineStrong : colors.hairline, 1);
  const tileInk = mark === 'selected' || mark === 'correct';
  const verdict = mark === 'correct' || mark === 'missed' ? 'correct' : mark === 'incorrect' ? 'incorrect' : null;
  const checked = mark === 'selected' || mark === 'correct' || mark === 'incorrect';
  return (
    <Pressable
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={`${option.letter}. ${option.text}`}
      disabled={disabled}
      onPress={onPress}
      testID={`quiz-option-${option.letter}`}
      {...handlers}
      {...dataSet({ letter: option.letter, mark })}
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: S[100],
          minHeight: H.option,
          paddingVertical: 10,
          paddingLeft: S[100],
          paddingRight: S[200],
          borderRadius: R.row,
          backgroundColor: strong || live || mark === 'incorrect' ? subtle : colors.card,
          boxShadow: ring,
          opacity: mark === 'muted' ? 0.5 : 1,
          ...focusRing(colors, focused),
          ...transition('background-color, box-shadow, opacity', reduced),
          transform: [{ scale }],
        }}
      >
        <View
          aria-hidden
          style={{
            width: 24,
            height: 24,
            borderRadius: multi ? 7 : R.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tileInk ? colors.ink : colors.card,
            boxShadow: tileInk ? undefined : insetRing(mark === 'missed' ? colors.ink : colors.hairlineStrong, mark === 'missed' ? 1.5 : 1),
          }}
        >
          <UiText variant="labelSm" tone={tileInk ? 'onInk' : (mark === 'incorrect' ? 'tertiary' : 'secondary')} style={{ fontVariant: ['tabular-nums'] }}>{option.letter}</UiText>
        </View>
        <Rich source={option.text} part="quiz-option" style={{ flex: 1, paddingTop: 1, opacity: mark === 'incorrect' ? 0.7 : 1 }} />
        {verdict ? <View style={{ paddingTop: 2 }}><VerdictGlyph verdict={verdict} /></View> : null}
      </Animated.View>
    </Pressable>
  );
}

export function QuizCard({ question, options, answerKey, multi = false, explanation, onSubmit, testID }: QuizCardProps) {
  const { strings, readOnly } = useLearnHost();
  const [state, dispatch] = useReducer(quizReducer, initialQuizState);
  const answered = state.phase === 'answered';
  const locked = readOnly || state.phase !== 'choosing';

  const submit = () => {
    if (readOnly || state.phase !== 'choosing' || !state.selected.length) return;
    const letters = [...state.selected];
    dispatch({ type: 'submit' });
    const local = (): QuizResult => {
      const verdict = gradeQuiz(letters, answerKey);
      const feedback = verdict === 'correct' ? strings.quizCorrect : verdict === 'incorrect' ? strings.quizIncorrect : '';
      return { verdict, feedback };
    };
    let outcome: QuizResult | Promise<QuizResult>;
    try {
      outcome = onSubmit ? onSubmit(letters) : local();
    } catch (_) {
      dispatch({ type: 'fail' });
      return;
    }
    if (isPromise(outcome)) {
      outcome.then(
        (result) => dispatch({ type: 'resolve', verdict: result.verdict, feedback: result.feedback }),
        () => dispatch({ type: 'fail' }),
      );
      return;
    }
    dispatch({ type: 'resolve', verdict: outcome.verdict, feedback: outcome.feedback });
  };

  const keyText = answerKey.length
    ? options.filter((option) => answerKey.includes(option.letter)).map((option) => `${option.letter}. ${option.text}`).join('；')
    : '';
  let explanationBody: ReactNode = null;
  if (answered && explanation) explanationBody = <Rich source={explanation} part="quiz-explanation" />;
  else if (answered && state.verdict === 'incorrect' && keyText) {
    explanationBody = <UiText variant="bodySm" tone="secondary">{fillTemplate(strings.quizAnswerIs, { answer: keyText })}</UiText>;
  }

  return (
    <ScaffoldCard
      kind="quiz"
      label={strings.label.quiz}
      testID={testID}
      trailing={multi ? <Tag label={strings.quizMulti} /> : (readOnly ? <Tag label={strings.readOnly} /> : undefined)}
    >
      <Rich source={question} part="quiz-q" />
      <View role={multi ? 'group' : 'radiogroup'} aria-label={question} style={{ gap: S[75] }}>
        {options.map((option) => (
          <OptionRow
            key={option.letter}
            option={option}
            multi={multi}
            mark={quizOptionMark(option.letter, state, answerKey)}
            disabled={locked}
            onPress={() => dispatch({ type: 'toggle', letter: option.letter, multi })}
          />
        ))}
      </View>
      {readOnly ? null : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: S[75], minHeight: H.action }}>
          <View
            testID="quiz-feedback"
            role="status"
            aria-live="polite"
            {...dataSet({ verdict: state.verdict ?? '' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: S[75], flexShrink: 1 }}
          >
            {answered && state.verdict !== 'recorded' && answerKey.length ? <VerdictGlyph verdict={state.verdict === 'correct' ? 'correct' : 'incorrect'} /> : null}
            {answered && state.feedback ? (
              <UiText variant="labelSm" tone={state.verdict === 'correct' ? 'ink' : 'secondary'} style={{ flexShrink: 1 }}>{state.feedback}</UiText>
            ) : null}
          </View>
          <ActionRow>
            {answered && state.verdict === 'incorrect' ? (
              <PillAction label={strings.quizRetry} tone="soft" testID="quiz-retry" onPress={() => dispatch({ type: 'retry' })} />
            ) : null}
            {!answered ? (
              <PillAction
                label={strings.quizSubmit}
                tone="solid"
                testID="quiz-submit"
                disabled={!state.selected.length || state.phase === 'pending'}
                onPress={submit}
              />
            ) : null}
          </ActionRow>
        </View>
      )}
      {explanationBody ? (
        <Section label={strings.quizExplanation} testID="quiz-explanation">{explanationBody}</Section>
      ) : null}
    </ScaffoldCard>
  );
}
