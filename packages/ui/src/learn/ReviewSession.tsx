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
import { useState, type CSSProperties } from 'react';
import { dataAttributes } from '../domProps';
import { S, shadow } from '../look';
import { useUiTheme } from '../primitives/theme';
import { UiText } from '../primitives/UiText';
import { FlashcardCard } from './FlashcardCard';
import { ActionRow, PillAction } from './parts';
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

const BUTTON_RESET: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
};

export function ReviewSession({
  cards,
  strings = defaultReviewStrings,
  onRate,
  onClose,
}: ReviewSessionProps) {
  const { colors } = useUiTheme();
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <button
          type="button"
          aria-label={strings.close}
          onClick={onClose}
          style={{
            ...BUTTON_RESET,
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.16)',
          }}
        />
        <div
          role="dialog"
          aria-modal
          aria-label={strings.title}
          data-testid="review-session"
          {...dataAttributes({
            reviewPosition: card ? position + 1 : 0,
            reviewTotal: cards.length,
          })}
          className="review-session-panel"
          style={{
            backgroundColor: colors.card,
            boxShadow: shadow(colors, 'dialog'),
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden
            className="review-session-grabber"
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.hairlineStrong,
              marginTop: S[75],
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: S[100],
              paddingInline: S[300],
              paddingTop: S[300],
              paddingBottom: S[200],
            }}
          >
            <div
              style={{
                display: 'flex',
                flex: 1,
                minWidth: 0,
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: S[100],
              }}
            >
              <UiText variant="title">{strings.title}</UiText>
              {card ? (
                <UiText
                  variant="labelSm"
                  tone="tertiary"
                  testID="review-progress"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {strings.progress
                    .replace('{n}', String(position + 1))
                    .replace('{total}', String(cards.length))}
                </UiText>
              ) : null}
            </div>
            <PillAction
              size="sm"
              tone="soft"
              label="✕"
              accessibilityLabel={strings.close}
              onPress={onClose}
              testID="review-close"
            />
          </div>
          <div style={{ overflow: 'auto', flexGrow: 0, flexShrink: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingInline: S[300],
                paddingBottom: S[300],
                gap: S[200],
              }}
            >
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
                <div
                  data-testid="review-done"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: S[200],
                    paddingTop: S[100],
                  }}
                >
                  <UiText variant="bodySm" tone="secondary">
                    {strings.done}
                  </UiText>
                  <ActionRow end>
                    <PillAction
                      tone="solid"
                      label={strings.close}
                      testID="review-done-close"
                      onPress={onClose}
                    />
                  </ActionRow>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
