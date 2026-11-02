/**
 * Flashcard: question on the front, answer on the back. Turning folds the
 * face edge-on and unfolds the other side (a real turn, so the learner sees
 * the card change sides); under reduced motion it cross-fades instead.
 * On the back the learner rates recall: remembered / fuzzy / forgot.
 */
import { useEffect, useReducer, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { uiMotion } from '@socrates/theme';
import { H, R, S, focusRing, insetRing, sheets, transition } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { usePressFeedback } from '../primitives/UiButton';
import { nativeDriver, useReducedMotion } from '../turn/parts';
import { useLearnHost } from './host';
import { RECALL_RATINGS, flashcardReducer, initialFlashcardState, type RecallRating } from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard, dataSet } from './parts';

export interface FlashcardCardProps {
  front: string;
  back: string;
  /** Optional reporting hook for the self-rating. */
  onRate?: (rating: RecallRating) => void;
  testID?: string;
}

export function FlashcardCard({ front, back, onRate, testID }: FlashcardCardProps) {
  const { strings } = useLearnHost();
  const { colors } = useUiTheme();
  const { subtle } = sheets(colors);
  const reduced = useReducedMotion();
  const [state, dispatch] = useReducer(flashcardReducer, initialFlashcardState);
  /* `shown` lags `state.face` by half a turn so the content swaps edge-on. */
  const [shown, setShown] = useReducer((_: 'front' | 'back', next: 'front' | 'back') => next, 'front');
  const turn = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const { hovered, focused, handlers } = usePressFeedback();

  useEffect(() => {
    if (state.face === shown) return;
    const half = Math.round(uiMotion.medium * 0.8);
    if (reduced) {
      Animated.timing(fade, { toValue: 0, duration: uiMotion.fast, useNativeDriver: nativeDriver }).start(() => {
        setShown(state.face);
        Animated.timing(fade, { toValue: 1, duration: uiMotion.fast, useNativeDriver: nativeDriver }).start();
      });
      return;
    }
    Animated.timing(turn, { toValue: 1, duration: half, easing: Easing.in(Easing.quad), useNativeDriver: nativeDriver }).start(() => {
      setShown(state.face);
      turn.setValue(-1);
      Animated.timing(turn, { toValue: 0, duration: half, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }).start();
    });
  }, [state.face, shown, reduced, turn, fade]);

  const rotateY = turn.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-90deg', '0deg', '90deg'] });
  const flip = () => dispatch({ type: 'flip' });
  const rate = (rating: RecallRating) => {
    dispatch({ type: 'rate', rating });
    onRate?.(rating);
  };
  const onBack = shown === 'back';

  return (
    <ScaffoldCard kind="flashcard" label={strings.label.flashcard} testID={testID}>
      <Pressable
        role="button"
        aria-label={`${strings.flashcardAria}: ${onBack ? strings.flashcardBack : strings.flashcardFront}`}
        onPress={flip}
        testID="flashcard-face"
        {...handlers}
        {...dataSet({ face: shown })}
      >
        <Animated.View
          style={{
            minHeight: 112,
            padding: S[300],
            gap: S[75],
            borderRadius: R.row,
            backgroundColor: subtle,
            boxShadow: insetRing(hovered ? colors.hairlineStrong : colors.hairline),
            ...focusRing(colors, focused),
            ...transition('box-shadow', reduced),
            opacity: fade,
            transform: [{ perspective: 900 }, { rotateY }],
          }}
        >
          <UiText variant="labelSm" tone="tertiary">{onBack ? strings.flashcardBack : strings.flashcardFront}</UiText>
          {onBack
            ? <Rich source={back} part="flashcard-back" />
            : <Rich source={front} part="flashcard-front" />}
        </Animated.View>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: S[75], minHeight: H.action }}>
        {onBack ? (
          <View role="group" aria-label={strings.flashcardRate} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S[75] }}>
            <UiText variant="labelSm" tone="secondary">{strings.flashcardRate}</UiText>
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
          </View>
        ) : (
          <UiText variant="labelSm" tone="tertiary" style={{ flexShrink: 1 }}>{strings.flashcardPrompt}</UiText>
        )}
        <ActionRow>
          <PillAction label={onBack ? strings.flashcardFlipBack : strings.flashcardFlip} tone="soft" testID="flashcard-flip" onPress={flip} />
        </ActionRow>
      </View>
      {onBack && state.rating ? (
        <UiText variant="labelSm" tone="secondary" testID="flashcard-note" aria-live="polite">{strings.ratingNote[state.rating]}</UiText>
      ) : null}
    </ScaffoldCard>
  );
}
