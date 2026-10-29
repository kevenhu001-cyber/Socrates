import { Button } from '../ui/shadcn/button';

export type ExamAction = {
  command: string;
  label: string;
  variant?: 'default' | 'outline' | 'destructive';
};

function ExamActionFooter({ actions }: { actions: ExamAction[] }) {
  return (
    <>
      {actions.map((action) => (
        <Button
          key={action.command}
          variant={action.variant ?? 'default'}
          className="exam-action-button"
          data-exam-command={action.command}
        >
          {action.label}
        </Button>
      ))}
    </>
  );
}

export { ExamActionFooter };
