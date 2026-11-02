/**
 * RN-4 — landing-page learning modes: the shared capsule segmented control
 * (packages/ui/src/think) bound to the shell's mode store. Choosing a mode
 * switches to Tutor when needed and runs the mode's entry action.
 */
/* Must run before any react-native-web module evaluates (see rnwGlobal.ts). */
import '../rn/rnwGlobal';
import { Suspense, lazy, useEffect, useState, useSyncExternalStore } from 'react';
import { LearningModeSwitch, ReviewDueEntry } from '@socrates/ui/think';
import { dueReviewCount } from '@socrates/ui/learn-model';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { i18n } from '../legacy/gateway.ts';
import { chooseLearningMode } from '../../tutor/learningMode.ts';
import { learningModeOptions, useLearningMode } from '../tutor/QuestionChainRoot';
import { useAppMode } from '../app-mode/useAppMode';
import { getReviewDeck, subscribeReviewDeck } from '../../tutor/reviewDeck.ts';

/* RN-14: the review dialog (and the flashcard it draws) loads on demand.
 * The widgets chunk goes first: it applies the widget runtime config (the
 * locale strings and the math renderer the flashcard leans on). Opened from
 * home, nothing else has pulled that chunk yet, so without it the dialog
 * came up in English with raw TeX. */
const ReviewRoot = lazy(() =>
  import('../../render/widgetScheduler.ts')
    .then((m) => m.loadWidgets())
    .then(() => import('../tutor-widgets/ReviewRoot')),
);

/** Re-reads the clock once a minute, so a card coming due shows up without a reload. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** RN-14: "3 cards due for review today", only while something is due. */
function HomeReviewEntry() {
  const deck = useSyncExternalStore(subscribeReviewDeck, getReviewDeck);
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  const due = dueReviewCount(deck, Math.max(now, Date.now()));
  const label = due === 1
    ? i18n('review.due.one', '1 card due for review today')
    : i18n('review.due.many', '{n} cards due for review today').replace('{n}', String(due));
  return (
    <>
      {due > 0 && !open ? <ReviewDueEntry label={label} onPress={() => setOpen(true)} /> : null}
      {open ? (
        <Suspense fallback={null}>
          <ReviewRoot onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}

export function HomeLearningModes() {
  useLocaleRefresh();
  const mode = useLearningMode();
  const appMode = useAppMode();
  return (
    <WebUiTheme>
      <LearningModeSwitch
        testID="home-learning-modes"
        variant="row"
        options={learningModeOptions()}
        /* In Chat mode no learning mode is active yet: nothing is selected,
           and choosing one switches to Tutor. */
        value={appMode === 'tutor' ? mode : null}
        showHint={appMode === 'tutor'}
        label={i18n('learnMode.label', 'Learning mode')}
        onChange={(id) => { void chooseLearningMode(id, 'home'); }}
      />
      <HomeReviewEntry />
    </WebUiTheme>
  );
}
