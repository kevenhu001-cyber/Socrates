/**
 * RN-14 — the flashcard review dialog for the web shell. Loaded only when
 * the learner opens a review from the home learning modes. The cards are
 * the ones due when the dialog opened; each rating reschedules its card in
 * the persisted deck (tutor/reviewDeck.ts).
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { useState } from 'react';
import { ReviewSession, type ReviewCardInput, type ReviewStrings } from '@socrates/ui/learn';
import { i18n } from '../legacy/gateway.ts';
import { dueCards, recordReview } from '../../tutor/reviewDeck.ts';
import { LearnMount, reviewScheduleNote } from './LearnScaffolds';

function reviewStrings(): ReviewStrings {
  return {
    title: i18n('review.title', 'Review'),
    progress: i18n('review.progress', '{n} / {total}'),
    next: i18n('review.next', 'Next card'),
    finish: i18n('review.finish', 'Finish'),
    done: i18n('review.done', 'That was every card due today.'),
    close: i18n('review.close', 'Close'),
  };
}

export default function ReviewRoot({ onClose }: { onClose: () => void }) {
  const [cards] = useState<ReviewCardInput[]>(() => dueCards().map(({ id, front, back }) => ({ id, front, back })));
  return (
    <LearnMount readOnly={false}>
      <ReviewSession
        cards={cards}
        strings={reviewStrings()}
        onRate={(card, rating) => reviewScheduleNote(recordReview(card.front, card.back, rating))}
        onClose={onClose}
      />
    </LearnMount>
  );
}
