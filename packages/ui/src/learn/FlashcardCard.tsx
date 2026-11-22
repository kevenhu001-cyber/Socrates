/**
 * Flashcard: question on the front, answer on the back. Turning folds the
 * face edge-on and unfolds the other side (a real turn, so the learner sees
 * the card change sides); under reduced motion it cross-fades instead.
 * On the back the learner rates recall: remembered / fuzzy / forgot.
 */
import { useEffect, useReducer, useRef, type CSSProperties } from 'react';
import { H, R, S, focusRing, insetRing, sheets, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { useReducedMotion } from '../turn/parts';
import { dataAttributes } from '../domProps';
import { useLearnHost } from './host';
import {
  RECALL_RATINGS,
  flashcardReducer,
  resumeFlashcardState,
  type FlashcardState,
  type RecallRating,
} from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard } from './parts';

const BUTTON_RESET: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
};

export interface FlashcardCardProps {
  front: string;
  back: string;
  /** Optional reporting hook for the self-rating. */
  onRate?: (rating: RecallRating) => void;
  /**
   * RN-14: where the card was before a re-render remounted it (face and
   * rating). Read once on mount; the host keeps it from `onStateChange`.
   */
  initialState?: Partial<FlashcardState> | null;
  onStateChange?: (state: FlashcardState) => void;
  /** RN-14: an extra line under the rating (the review schedule). */
  note?: string | null;
  testID?: string;
}

export function FlashcardCard({
  front,
  back,
  onRate,
  initialState,
  onStateChange,
  note,
  testID,
}: FlashcardCardProps) {
  const { strings } = useLearnHost();
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(flashcardReducer, initialState, resumeFlashcardState);
  const reported = useRef(state);
  useEffect(() => {
    if (reported.current === state) return;
    reported.current = state;
    onStateChange?.(state);
  }, [state, onStateChange]);
  const { hovered, focused, handlers } = usePressFeedback();
  const flip = () => dispatch({ type: 'flip' });
  const rate = (rating: RecallRating) => {
    dispatch({ type: 'rate', rating });
    onRate?.(rating);
  };
  const onBack = state.face === 'back';

  return (
    <ScaffoldCard kind="flashcard" label={strings.label.flashcard} testID={testID}>
      <button
        type="button"
        aria-label={`${strings.flashcardAria}: ${onBack ? strings.flashcardBack : strings.flashcardFront}`}
        onClick={flip}
        data-testid="flashcard-face"
        {...handlers}
        {...dataAttributes({ face: state.face })}
        style={BUTTON_RESET}
      >
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 80,
            padding: S[100],
            gap: S[75],
            borderRadius: R.row,
            backgroundColor: subtle,
            boxShadow: insetRing(hovered ? colors.hairlineStrong : colors.hairline),
            ...focusRing(colors, focused),
            ...transition('box-shadow', reduced),
          }}
        >
          <UiText variant="labelSm" tone="tertiary">
            {onBack ? strings.flashcardBack : strings.flashcardFront}
          </UiText>
          {onBack ? (
            <Rich source={back} part="flashcard-back" />
          ) : (
            <Rich source={front} part="flashcard-front" />
          )}
        </span>
      </button>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[75],
          minHeight: H.action,
        }}
      >
        {onBack ? (
          /* RN-14: flexShrink + minWidth 0 keep the group inside the row, so its
             pills wrap on a phone. Without them the group took its one-line
             width (wider than a 390 card), and focusing a pill past the edge
             scrolled the card's overflow-hidden box, cutting off its left side. */
          <div
            role="group"
            aria-label={strings.flashcardRate}
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: S[75],
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <UiText variant="labelSm" tone="secondary">
              {strings.flashcardRate}
            </UiText>
            {RECALL_RATINGS.map((rating) => (
              <PillAction
                key={rating}
                label={strings.rating[rating]}
                tone="quiet"
                selected={state.rating === rating}
                testID={`flashcard-rate-${rating}`}
                onPress={() => rate(rating)}
                data={{ rating }}
              />
            ))}
          </div>
        ) : (
          <UiText variant="labelSm" tone="tertiary" style={{ flexShrink: 1 }}>
            {strings.flashcardPrompt}
          </UiText>
        )}
        <ActionRow>
          <PillAction
            label={onBack ? strings.flashcardFlipBack : strings.flashcardFlip}
            tone="soft"
            testID="flashcard-flip"
            onPress={flip}
          />
        </ActionRow>
      </div>
      {onBack && state.rating ? (
        <UiText variant="labelSm" tone="secondary" testID="flashcard-note" aria-live="polite">
          {strings.ratingNote[state.rating]}
        </UiText>
      ) : null}
      {onBack && state.rating && note ? (
        <UiText variant="labelSm" tone="tertiary" testID="flashcard-schedule">
          {note}
        </UiText>
      ) : null}
    </ScaffoldCard>
  );
}
