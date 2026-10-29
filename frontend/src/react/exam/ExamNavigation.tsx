import { Button } from '../ui/shadcn/button';

export type ExamNavigationSnapshot = {
  current: number;
  total: number;
  answered: number[];
  isSubmitted: boolean;
  labels: {
    previous: string;
    next: string;
    answered: string;
  };
};

function ExamNavigation({ snapshot }: { snapshot: ExamNavigationSnapshot }) {
  const current = Math.max(0, Math.min(snapshot.total - 1, snapshot.current));
  const answered = new Set(snapshot.answered);

  return (
    <>
      <div className="exam-nav-bar" id="examNavBar">
        <Button
          variant="outline"
          size="icon-sm"
          className="exam-nav-btn"
          id="examNavPrev"
          data-exam-command="nav-step"
          data-delta="-1"
          aria-label={snapshot.labels.previous}
          disabled={current <= 0}
        >
          ‹
        </Button>
        <div className="exam-nav-counter" id="examNavCounter">
          <span className="exam-nav-current" id="examNavCurrent">{current + 1}</span>
          <span className="exam-nav-sep">/</span>
          <span className="exam-nav-total">{snapshot.total}</span>
          {!snapshot.isSubmitted && (
            <span className="exam-nav-progress" id="examNavProgress">
              · {answered.size} {snapshot.labels.answered}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          className="exam-nav-btn"
          id="examNavNext"
          data-exam-command="nav-step"
          data-delta="1"
          aria-label={snapshot.labels.next}
          disabled={current >= snapshot.total - 1}
        >
          ›
        </Button>
      </div>
      <div className="exam-nav-pills" id="examNavPills" aria-label="Question navigation">
        {Array.from({ length: snapshot.total }, (_, index) => {
          const isCurrent = index === current;
          const isAnswered = answered.has(index);
          return (
            <Button
              key={index}
              variant={isCurrent ? 'secondary' : isAnswered ? 'outline' : 'ghost'}
              size="sm"
              className="exam-nav-pill"
              data-nav-idx={index}
              data-answered={isAnswered ? 'true' : 'false'}
              data-current={isCurrent ? 'true' : 'false'}
              data-exam-command="nav-jump"
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${index + 1}${isAnswered ? `, ${snapshot.labels.answered}` : ''}`}
            >
              {index + 1}{isAnswered ? ' ·' : ''}
            </Button>
          );
        })}
      </div>
    </>
  );
}

export { ExamNavigation };
