/**
 * RN-14 — reviewing the flashcards that are due. One card at a time in a
 * dialog (a bottom sheet on a phone): the same flashcard the replies use,
 * a quiet "2 / 5" count, and after a rating the next review date and a
 * "Next card" pill. The host owns the deck: it hands in the cards that
 * were due when the dialog opened and records each rating.
 *
 * Needs a LearnHostProvider above it (the flashcard reads its copy and
 * markdown rendering from there). White/grey only, no dots.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { R, S, shadow } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { FlashcardCard } from './FlashcardCard';
import { ActionRow, PillAction, dataSet } from './parts';
import type { RecallRating } from './model';

export interface ReviewStrings {
  /** Dialog title ("Review"). */
  title: string;
  /** Position in the round ("{n} / {total}"). */
  progress: string;
  next: string;
  finish: string;
  /** Shown once every card in the round has been rated. */
  done: string;
  close: string;
}

export const defaultReviewStrings: ReviewStrings = {
  title: 'Review',
  progress: '{n} / {total}',
  next: 'Next card',
  finish: 'Finish',
  done: 'That was every card due today.',
  close: 'Close',
};

export interface ReviewCardInput {
  id: string;
  front: string;
  back: string;
}

export interface ReviewSessionProps {
  cards: readonly ReviewCardInput[];
  strings?: ReviewStrings;
  /** Record a rating; returns the line to show under it ("Next review in 3 days"). */
  onRate: (card: ReviewCardInput, rating: RecallRating) => string | null | void;
  onClose: () => void;
}

const COMPACT = 640;

export function ReviewSession({ cards, strings = defaultReviewStrings, onRate, onClose }: ReviewSessionProps) {
  const { colors } = useUiTheme();
  const { width } = useWindowDimensions();
  const compact = width < COMPACT;
  const [position, setPosition] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const card = cards[position] ?? null;
  const rated = card ? Object.prototype.hasOwnProperty.call(notes, card.id) : false;
  const last = position >= cards.length - 1;

  const rate = (rating: RecallRating) => {
    if (!card) return;
    const note = onRate(card, rating);
    setNotes((current) => ({ ...current, [card.id]: typeof note === 'string' ? note : '' }));
  };

  const panel = compact
    ? { position: 'absolute' as const, left: 0, right: 0, bottom: 0, maxHeight: '90%' as const, borderTopLeftRadius: R.stage, borderTopRightRadius: R.stage }
    : { position: 'absolute' as const, top: '12%' as const, alignSelf: 'center' as const, width: Math.min(560, width - 48), maxHeight: '76%' as const, borderRadius: R.stage };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable aria-label={strings.close} onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.16)' }} />
        <View
          role="dialog"
          aria-modal
          aria-label={strings.title}
          testID="review-session"
          {...dataSet({ reviewPosition: card ? position + 1 : 0, reviewTotal: cards.length })}
          style={[panel, { backgroundColor: colors.card, boxShadow: shadow(colors, 'dialog'), overflow: 'hidden' }]}
        >
          {compact ? <View aria-hidden style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: R.pill, backgroundColor: colors.hairlineStrong, marginTop: S[75] }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: S[100], paddingHorizontal: S[300], paddingTop: S[300], paddingBottom: S[200] }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: S[100] }}>
              <UiText variant="title">{strings.title}</UiText>
              {card ? (
                <UiText variant="labelSm" tone="tertiary" testID="review-progress" style={{ fontVariant: ['tabular-nums'] }}>
                  {strings.progress.replace('{n}', String(position + 1)).replace('{total}', String(cards.length))}
                </UiText>
              ) : null}
            </View>
            <PillAction size="sm" tone="soft" label="✕" accessibilityLabel={strings.close} onPress={onClose} testID="review-close" />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: S[300], paddingBottom: S[300], gap: S[200] }}>
            {card ? (
              <>
                <FlashcardCard
                  key={card.id}
                  front={card.front}
                  back={card.back}
                  onRate={rate}
                  note={rated ? notes[card.id] || null : null}
                  testID="review-card"
                />
                {rated ? (
                  <ActionRow end>
                    <PillAction
                      tone="solid"
                      label={last ? strings.finish : strings.next}
                      testID="review-next"
                      onPress={() => setPosition((current) => current + 1)}
                    />
                  </ActionRow>
                ) : null}
              </>
            ) : (
              <View testID="review-done" style={{ gap: S[200], paddingTop: S[100] }}>
                <UiText variant="bodySm" tone="secondary">{strings.done}</UiText>
                <ActionRow end>
                  <PillAction tone="solid" label={strings.close} testID="review-done-close" onPress={onClose} />
                </ActionRow>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
