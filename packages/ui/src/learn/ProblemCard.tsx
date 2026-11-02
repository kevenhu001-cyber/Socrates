/**
 * Practice and worked example: the problem, hints revealed one level at a
 * time, and a solution (example) or answer box + reveal (practice).
 * Grading and reporting for practice stay with the host (`onSubmitAnswer`).
 */
import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { uiType } from '@socrates/theme';
import { H, R, S, insetRing, sheets } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { useLearnHost } from './host';
import { fillTemplate, isFullyRevealed, revealNext, revealNone, revealState, type RevealState } from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard, Section, VerdictGlyph, dataSet } from './parts';

export type AnswerFeedbackState = '' | 'ok' | 'bad' | 'recorded';

export interface AnswerFeedback {
  state: AnswerFeedbackState;
  /** Plain feedback line. */
  text?: string;
  /** Markdown to render instead of `text` (the revealed answer). */
  rich?: string;
}

export interface ProblemCardProps {
  kind: 'practice' | 'example';
  title?: string;
  problem: string;
  hints: readonly string[];
  /** Worked solution (example, or a practice that ships one). */
  solution?: string;
  /** Practice only: grade and report a typed answer; returns the feedback. */
  onSubmitAnswer?: (answer: string) => AnswerFeedback;
  /** Practice only: reveal the expected answer (no report). */
  onRevealAnswer?: () => AnswerFeedback;
  /** Practice only: whether the block has a key to reveal. */
  hasAnswerKey?: boolean;
  /** Example: restore the solution's open state across remounts. */
  initialSolutionOpen?: boolean;
  onSolutionToggle?: (open: boolean) => void;
  testID?: string;
}

function HintLevels({ hints, reveal, setReveal }: { hints: readonly string[]; reveal: RevealState; setReveal: (next: RevealState) => void }) {
  const { strings } = useLearnHost();
  if (!hints.length) return null;
  const more = !isFullyRevealed(reveal);
  const label = reveal.shown === 0
    ? strings.hintShow
    : fillTemplate(strings.hintNext, { n: reveal.shown + 1, total: reveal.total });
  return (
    <>
      {hints.slice(0, reveal.shown).map((hint, index) => (
        <Section key={index} label={fillTemplate(strings.hintLevel, { n: index + 1 })} testID={`hint-${index + 1}`}>
          <Rich source={hint} part="hint" />
        </Section>
      ))}
      <ActionRow>
        {more ? (
          <PillAction label={label} tone="quiet" chevron expanded={false} testID="hint-next" onPress={() => setReveal(revealNext(reveal))} />
        ) : null}
        {reveal.shown > 0 ? (
          <PillAction label={strings.hintHide} tone="quiet" chevron expanded testID="hint-hide" onPress={() => setReveal(revealNone(reveal))} />
        ) : null}
      </ActionRow>
    </>
  );
}

function AnswerBox({ onSubmitAnswer, onRevealAnswer, hasAnswerKey }: Pick<ProblemCardProps, 'onSubmitAnswer' | 'onRevealAnswer' | 'hasAnswerKey'>) {
  const { strings } = useLearnHost();
  const { colors, fontFamily, typeScale } = useUiTheme();
  const { subtle } = sheets(colors);
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<AnswerFeedback>({ state: '' });
  const busy = useRef(false);
  const submit = () => {
    if (done || busy.current || !onSubmitAnswer) return;
    busy.current = true;
    const next = onSubmitAnswer(value.trim());
    busy.current = false;
    setFeedback(next);
    if (value.trim()) setDone(true);
  };
  const reveal = () => {
    if (done || !onRevealAnswer) return;
    setFeedback(onRevealAnswer());
    setDone(true);
  };
  return (
    <View style={{ gap: S[100] }}>
      <TextInput
        multiline
        numberOfLines={3}
        value={value}
        onChangeText={setValue}
        editable={!done}
        placeholder={strings.answerPlaceholder}
        placeholderTextColor={colors.inkTertiary}
        aria-label={strings.answerPlaceholder}
        testID="practice-input"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          minHeight: 84,
          paddingHorizontal: S[200],
          paddingVertical: S[100],
          borderRadius: R.row,
          borderWidth: 0,
          /* Site question box: hairline ring at rest, a deeper ring plus a
             4px halo on focus — never a colour. */
          boxShadow: focused
            ? `${insetRing(colors.inkTertiary)}, 0 0 0 4px ${colors.fill}`
            : insetRing(colors.hairlineStrong),
          backgroundColor: done ? subtle : colors.card,
          color: colors.ink,
          fontFamily,
          fontSize: uiType.bodySm.size * typeScale,
          lineHeight: uiType.bodySm.lineHeight * typeScale,
          textAlignVertical: 'top',
          outlineStyle: 'none',
        } as object}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: S[75], minHeight: H.action }}>
        <View
          testID="practice-feedback"
          role="status"
          aria-live="polite"
          {...dataSet({ state: feedback.state })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: S[75], flexShrink: 1, flexGrow: 1 }}
        >
          {feedback.state === 'ok' || (feedback.state === 'bad' && done) ? <VerdictGlyph verdict={feedback.state === 'ok' ? 'correct' : 'incorrect'} /> : null}
          {feedback.rich ? <Rich source={feedback.rich} part="practice-answer" style={{ flexShrink: 1 }} /> : null}
          {!feedback.rich && feedback.text ? (
            <UiText variant="labelSm" tone={feedback.state === 'ok' ? 'ink' : 'secondary'} style={{ flexShrink: 1 }}>{feedback.text}</UiText>
          ) : null}
        </View>
        <ActionRow>
          {hasAnswerKey ? <PillAction label={strings.answerReveal} tone="quiet" testID="practice-reveal" disabled={done} onPress={reveal} /> : null}
          <PillAction label={strings.answerSubmit} tone="solid" testID="practice-submit" disabled={done} onPress={submit} />
        </ActionRow>
      </View>
    </View>
  );
}

export function ProblemCard(props: ProblemCardProps) {
  const { kind, title, problem, hints, solution, initialSolutionOpen, onSolutionToggle, testID } = props;
  const { strings, readOnly } = useLearnHost();
  const [reveal, setReveal] = useState<RevealState>(() => revealState(hints.length));
  const [solutionOpen, setSolutionOpen] = useState(Boolean(initialSolutionOpen));
  const showTitle = Boolean(title && title !== 'Example' && title !== 'Practice');
  const toggleSolution = () => {
    const next = !solutionOpen;
    setSolutionOpen(next);
    onSolutionToggle?.(next);
  };
  return (
    <ScaffoldCard kind={kind} label={kind === 'example' ? strings.label.example : strings.label.practice} testID={testID}>
      {showTitle ? <Rich source={title || ''} part={`${kind}-title`} /> : null}
      <Rich source={problem} part={`${kind}-problem`} />
      <HintLevels hints={hints} reveal={reveal} setReveal={setReveal} />
      {solution ? (
        <>
          <ActionRow>
            <PillAction
              label={solutionOpen ? strings.solutionHide : strings.solutionShow}
              tone="quiet"
              chevron
              expanded={solutionOpen}
              testID={`${kind}-solution-toggle`}
              onPress={toggleSolution}
            />
          </ActionRow>
          {solutionOpen ? (
            <Section testID={`${kind}-solution`}>
              <Rich source={solution} part={`${kind}-solution`} />
            </Section>
          ) : null}
        </>
      ) : null}
      {kind === 'practice' && !readOnly && props.onSubmitAnswer ? (
        <AnswerBox onSubmitAnswer={props.onSubmitAnswer} onRevealAnswer={props.onRevealAnswer} hasAnswerKey={props.hasAnswerKey} />
      ) : null}
    </ScaffoldCard>
  );
}
