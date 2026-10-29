import { LoaderCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/shadcn/alert';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/shadcn/empty';
import { Progress, ProgressLabel } from '../ui/shadcn/progress';

export type ExamStatusSnapshot =
  | {
      kind: 'loading';
      progress: number;
      message: string;
      step: string;
      subtitle: string;
    }
  | {
      kind: 'empty';
      message: string;
      detail?: string;
    }
  | {
      kind: 'error';
      message: string;
      detail?: string;
    };

function ExamStatus({ snapshot }: { snapshot: ExamStatusSnapshot }) {
  if (snapshot.kind === 'loading') {
    return (
      <div className="exam-loading" role="status" aria-live="polite">
        <span className="loading" aria-hidden="true"><span /><span /><span /></span>
        <div className="exam-loading-msg">{snapshot.message}</div>
        <Progress value={snapshot.progress} aria-label={snapshot.message} className="exam-progress">
          <ProgressLabel className="sr-only">{snapshot.step}</ProgressLabel>
        </Progress>
        <div className="exam-progress-step">
          <LoaderCircle className="exam-progress-spin" aria-hidden="true" />
          {snapshot.step}
        </div>
        <div className="exam-loading-sub">{snapshot.subtitle}</div>
      </div>
    );
  }

  if (snapshot.kind === 'error') {
    return (
      <Alert variant="destructive" className="exam-status-alert">
        <AlertTitle>{snapshot.message}</AlertTitle>
        {snapshot.detail && <AlertDescription>{snapshot.detail}</AlertDescription>}
      </Alert>
    );
  }

  return (
    <Empty className="exam-empty">
      <EmptyHeader>
        <EmptyTitle>{snapshot.message}</EmptyTitle>
        {snapshot.detail && <EmptyDescription>{snapshot.detail}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

export { ExamStatus };
